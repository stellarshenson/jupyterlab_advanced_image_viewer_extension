"""The waveform endpoint: the peaks of an audio file, decoded on the server.

GET <base_url>/jupyterlab-advanced-image-viewer-extension/waveform?path=<path>&level=<n>
answers application/octet-stream: per channel one byte per bin, the largest
absolute sample decoded in it scaled from 0..1 to 0..255, channel 0 first.
Three levels, each finer than the one before:
- 0, the quick view: QUICK points spread evenly over the file, each the peak of
  one frame read at a seek to it; a file shorter than SHORT seconds, or than
  QUICK / 5 seconds where it states no duration, gets the fast pass
- 1, the fast pass, asked when no level is: about 20000 bins per channel over
  the duration the file states, or the end of its last packet where that lies
  more than SKEW from it, none for less than 1 ms, so a file up to 20 s gets
  one byte per millisecond; of a long lossy file only one run of packets per
  bin is decoded, so its waveform is coarse
- 2, the full pass: every packet decoded, in the bins of level 1
X-Waveform-Level names the level answered: the most refined level cached at or
above the one asked, otherwise the level asked. The headers X-Waveform-Duration
(seconds) and X-Waveform-Channels (1 or 2) carry what wavesurfer.js needs
besides, and X-Waveform-Source-Channels the file's own channel count. Levels 1
and 2 are kept on disk in the user cache folder, so they outlive a server
restart; a fast pass that decoded every packet is kept as level 2.
"""
import asyncio
import hashlib
import math
import os
import struct
import tempfile
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import av
import numpy as np
import tornado
from jupyter_server.auth.decorator import authorized
from jupyter_server.base.handlers import APIHandler
from jupyter_server.services.contents.fileio import FileManagerMixin
from jupyter_server.utils import url_path_join
from tornado.log import app_log

# Bins per channel over the duration the file states, none under 1 ms
PEAKS = 20000
# Points per channel of the quick view
QUICK = 1000
# Seconds under which the fast pass is no slower than the quick view in any
# format. Raw AAC and M4A break even first, just above 84 s: the quick view is
# as fast at 84.1 s (logs/waveform-levels-fix2-verify-extra.log), and
# logs/waveform-levels-fix2-breakeven.log estimates 90.4 and 93.3 s.
SHORT = 84
# Bytes of the quick view's seek index, an entry per packet of a 5-hour file:
# after a scan of the whole file, every seek lands on its packet.
INDEX = 32 * 1024**2
# Packets a lossy decoder takes after a flush before its output is whole
# again: Opus needs 3 to 4.
WARM = 4
# Seconds the first frame may lie from the start the file states, and the end
# of the last packet from the end it states, before the frame times or the
# stated duration are taken as wrong
SKEW = 0.1
# Samples gathered before their peaks are computed: numpy calls per frame
# cost more than the arithmetic.
BLOCK = 65536
# Full scale of the integer sample formats; float samples are in -1..1
FULL_SCALE = {"u8": 128, "s16": 2**15, "s32": 2**31}
# The cache folder's limit; the least recently used peaks are removed first.
CACHE_BYTES = 1024**3
# Duration in seconds, channel count and the file's channel count, ahead of
# the peaks in a cache file
HEADER = struct.Struct("<dBH")
# The demuxer each audio extension names. A file is never probed: FFmpeg's
# playlist demuxers open the files a playlist names, outside the root too.
DEMUXERS = {
    ".aac": "aac",
    ".flac": "flac",
    ".m4a": "mov",
    ".mp3": "mp3",
    ".oga": "ogg",
    ".ogg": "ogg",
    ".opus": "ogg",
    ".wav": "wav",
}
# A thread per level, so a quick view never waits behind a refinement and a
# fast pass never behind a full pass. Within a level one decode runs at a
# time: concurrent decodes in one process contend for the GIL.
_decoders = [
    ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"waveform-{level}")
    for level in range(3)
]
# (path, size, mtime_ns, level) -> the decode queued or running and the count
# of requests waiting on it; a second request awaits the same decode
_pending = {}


def end_seconds(container):
    """The end of the last packet of the first audio stream in seconds, None
    when not found. A seek past the end has FFmpeg scan the file at C speed
    where it has no index to seek by."""
    stream = container.streams.audio[0]
    try:
        container.seek(2**62, stream=stream)
    except av.error.FFmpegError:
        return None
    last = None
    for packet in container.demux(stream):
        if packet.size and packet.pts is not None:
            last = packet
    return last and float((last.pts + (last.duration or 0)) * stream.time_base)


def magnitudes(frames):
    """The |samples| of the frames, 0..1, one row per channel."""
    first = frames[0]
    data = np.concatenate([frame.to_ndarray() for frame in frames], axis=1)
    if not first.format.is_planar:
        data = data.reshape(-1, first.layout.nb_channels).T
    kind = first.format.name.rstrip("p")
    if kind == "u8":
        data = data.astype(np.int16) - 128
    data = np.abs(data, dtype=np.float32)
    data *= np.float32(1 / FULL_SCALE.get(kind, 1))
    return data


def scaled(top):
    """The peaks, 0..1 per channel and bin, as bytes of 0..255. Wavesurfer
    draws two rows: the channels after the first two fold into both."""
    if len(top) > 2:
        top = np.maximum(top[:2], top[2:].max(axis=0))
    return (np.clip(top, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()


def quick_view(path, demuxer):
    """QUICK points spread evenly over the file, each the peak of the first
    whole frame read at a seek to it, placed by that frame's own time.

    A lossy decoder gets the WARM packets before the frame's packet after the
    flush. An Ogg seek lands at the page start, up to 1.5 s early: the packets
    wholly before the point are passed over undecoded. A point no frame was
    placed in, as where a seek fails, shows the nearest point read. Returns
    the duration, the channels drawn, the file's channels, the peaks and the
    level: 0, or that of the fast pass for a file shorter than SHORT seconds,
    or than QUICK / 5 seconds where it states no duration.
    """
    options = {"indexmem": str(INDEX)}
    if demuxer == "wav":
        # Its header states all; FFmpeg's probe of 5 MB of samples takes 15 ms,
        # as long as the fast pass of a short file.
        options["probesize"] = "32"
    with av.open(path, format=demuxer, container_options=options) as container:
        stream = container.streams.audio[0]
        codec = stream.codec_context
        warm = WARM if codec.codec.lossy else 0
        source, base = stream.channels, stream.time_base
        stated = duration = container.duration and container.duration / av.time_base
        if demuxer == "aac" or not duration:
            # ADTS states its duration only in its frame headers; FFmpeg's
            # guess from the bit rate of the first frames can be half of it.
            # The end of its last packet is the sum of the packet durations
            # that the fast pass counts. In an open of its own, as the scan
            # leaves an index too coarse for later seeks.
            with av.open(path, format=demuxer) as again:
                duration = end_seconds(again)
        origin = next(
            (
                frame.time
                for packet in container.demux(stream)
                if packet.size
                for frame in codec.decode(packet)
                if frame.samples
            ),
            None,
        )
        if origin is None:
            raise ValueError("no audio samples")
        start = (container.start_time or 0) / av.time_base
        if demuxer in ("flac", "mp3", "ogg") and duration:
            # The stated duration can be wrong: a FLAC states the total of its
            # STREAMINFO, an MP3 without a Xing, Info or VBRI header FFmpeg's
            # guess from its first frame's bit rate, and an Ogg the granule
            # position of its last page, that of the last part of a chained
            # file. The end of the last packet corrects the first two; an
            # Ogg's packet times are granule positions too, so the fast pass
            # counts. The scan of an MP3 fills the index the seeks use.
            end = end_seconds(container)
            if end is not None and abs(end - start - duration) > SKEW:
                duration = None if demuxer == "ogg" else end - origin
        if not duration or abs(origin - start) > SKEW:
            # Frame times that do not begin where the file states, as FFmpeg's
            # Vorbis encoder writes from frames without times, make the seeks
            # and the stated duration wrong: the fast pass reads the points.
            # Under QUICK ms its bins are those of the fast pass, 1 ms, and it
            # is kept, as for a Vorbis file of one page, whose last packet
            # FFmpeg times 2**32 samples late.
            *result, level = compute_peaks(path, demuxer, False, QUICK)
            return (*result, level if result[0] * 1000 <= QUICK else 0)
        if duration < (SHORT if stated else QUICK / 5):
            # The fast pass is no slower and is kept; where the file states no
            # duration, its bins of 0.2 s are fewer than QUICK.
            return compute_peaks(path, demuxer)
        top = np.full((source, QUICK), -1, np.float32)
        packets = deque(maxlen=warm + 1)
        for j in range(QUICK):
            at = origin + (j + 0.5) * duration / QUICK
            target = int(at / base)
            try:
                container.seek(target, stream=stream)
            except av.error.FFmpegError:
                # As FFmpeg's EPERM near the end of a FLAC file without a seek table
                continue
            codec.flush_buffers()
            packets.clear()
            for packet in container.demux(stream):
                if not packet.size:
                    continue
                packets.append(packet)
                if len(packets) > warm and (
                    packet.pts is None or packet.pts + (packet.duration or 0) > target
                ):
                    break
            frame = None
            for packet in packets:
                frames = [each for each in codec.decode(packet) if each.samples]
                frame = frames[0] if frames else frame
            if frame is None:
                continue
            when = at if frame.time is None else frame.time
            k = min(max(int((when - origin) * QUICK / duration), 0), QUICK - 1)
            top[:, k] = np.maximum(top[:, k], magnitudes([frame]).max(axis=1))
    read = np.flatnonzero(top[0] >= 0)
    if not len(read):
        raise ValueError("no audio samples")
    nearest = read[np.abs(np.arange(QUICK)[:, None] - read).argmin(axis=1)]
    return float(duration), 2 if source > 1 else 1, source, scaled(top[:, nearest]), 0


def compute_peaks(path, demuxer, full=False, points=None):
    """Read the first audio stream packet by packet, keeping only the peaks
    of points bins, PEAKS when not given.

    A lossless stream is cheap to decode and every packet is decoded, as is
    every packet of a lossy stream in the full pass. Otherwise of a lossy
    stream only the first packet of each bin is, after a flush and the WARM
    packets before it, and its peak stands for the bin; where these runs
    would overlap, the packets are decoded in order without a flush, so a
    short file is decoded whole. A running sample position, not the packet
    times, places the samples and gives the duration: a decoded packet
    advances it by its decoded samples, a packet passed over by its duration.
    Returns the duration, the channels drawn, the file's channels, the peaks
    and the level reached: 2 when every packet was decoded, else 1.
    """
    points = points or PEAKS
    with av.open(path, format=demuxer) as container:
        stream = container.streams.audio[0]
        codec = stream.codec_context
        lossy = codec.codec.lossy
        source = stream.channels
        channels = 2 if source > 1 else 1
        rate, base = codec.sample_rate, stream.time_base
        if not rate:
            raise ValueError("no sample rate")
        # A packet duration is used only when positive and at most one second
        # (in time base units): a wrapped or missing one is not.
        second, scale = float(1 / base), float(base * rate)
        # Samples the bins span. The stated duration sets only the bin
        # width; the bin is 0.2 s when the file states none.
        stated = container.duration and container.duration * rate // av.time_base
        if demuxer in ("aac", "ogg"):
            # ADTS states its duration only in its frame headers; FFmpeg's
            # guess from the bit rate of the first frames can be half of it.
            # Ogg states the granule position of its last page: that of the
            # last part of a chained file, and wrong where the encoder had no
            # frame times. A seek back to 0 lands in the last part, so the
            # packets are counted through a second open.
            with av.open(path, format=demuxer) as again:
                headers = sum(
                    packet.duration
                    for packet in again.demux(again.streams.audio[0])
                    if 0 < (packet.duration or 0) <= second
                )
            stated = round(headers * base * rate)
        elif demuxer in ("flac", "mp3") and stated:
            # A FLAC states the total of its STREAMINFO and an MP3 without a
            # Xing, Info or VBRI header FFmpeg's guess from its first frame's
            # bit rate: as in the quick view, the end of the last packet
            # replaces a stated end more than SKEW from it. The demux then
            # starts again from the start.
            end = end_seconds(container)
            container.seek(0, stream=stream)
            if end is not None:
                end -= (container.start_time or 0) / av.time_base
                if abs(end - stated / rate) > SKEW:
                    stated = round(end * rate)
        span = max(stated, points * rate // 1000) if stated else points * rate // 5
        warm = deque(maxlen=WARM + 1)
        # (first sample, frame) of the frames whose peaks are not computed yet
        block, size = [], 0
        # The bin of each part of a frame and that part's largest |sample|
        bins, maxima = [], []

        def compute():
            nonlocal block, size
            data = magnitudes([frame for _, frame in block])
            starts, offset = [], 0
            for at, frame in block:
                last = (at + frame.samples - 1) * points // span
                for k in range(at * points // span, last + 1):
                    # Bin k begins at sample ceil(k * span / points).
                    begin = -(-k * span // points)
                    starts.append(offset + max(begin - at, 0))
                    bins.append(k)
                offset += frame.samples
            maxima.append(np.maximum.reduceat(data, starts, axis=1))
            block, size = [], 0

        done = None
        # The sample position of the next packet, and the last packet length
        # accepted. Packet times restart in a chained Ogg and can wrap.
        at = last = 0
        # Packets passed over since the last one decoded, and whether every
        # packet so far was decoded
        skipped, whole = 0, True
        for packet in container.demux(stream):
            if not packet.size:
                continue
            index = at * points // span
            run = [(at, packet)]
            if lossy:
                warm.append((at, packet))
                if index == done and not full:
                    skipped += 1
                    if 0 < (packet.duration or 0) <= second:
                        last = round(packet.duration * scale)
                    at += last
                    continue
                if skipped > WARM:
                    whole = False
                    codec.flush_buffers()
                    for _, earlier in list(warm)[:-1]:
                        codec.decode(earlier)
                else:
                    # The runs would overlap: the packets passed over are
                    # decoded too, in order and without a flush.
                    run = list(warm)[-skipped - 1 :]
                skipped = 0
            # A decoded packet advances the position by its decoded samples.
            at = run[0][0]
            for _, each in run:
                start = at
                for frame in codec.decode(each):
                    if frame.samples:
                        # Set on output only: a packet with none, as the first
                        # of M4A and Vorbis, leaves its bin to the next one.
                        done = index
                        block.append((at, frame))
                        at += frame.samples
                        size += frame.samples
                last = at - start or last
            if size >= BLOCK:
                compute()
        if block:
            compute()
    if not bins:
        raise ValueError("no audio samples")
    duration = at / rate
    count = max(math.ceil(at * points / span), max(bins) + 1)
    top = np.full((len(maxima[0]), count), -1, np.float32)
    np.maximum.at(top.T, bins, np.concatenate(maxima, axis=1).T)
    # A bin no decoded sample reached shows the peak of the bin before it.
    top = top[:, np.maximum.accumulate(np.where(top[0] < 0, 0, np.arange(count)))]
    level = 2 if whole and not skipped else 1
    return float(duration), channels, source, scaled(top), level


def cache_file(key):
    """The file in the user cache folder that holds the peaks of the key."""
    folder = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    name = hashlib.sha256(repr(key).encode()).hexdigest()
    return os.path.join(folder, "jupyterlab_advanced_image_viewer_extension", name)


def load(file):
    """The cached (duration, channels, source channels, peaks), or None."""
    try:
        # The modification time orders the files from least recently used.
        os.utime(file)
        with open(file, "rb") as handle:
            data = handle.read()
    except OSError:
        return None
    return *HEADER.unpack_from(data), data[HEADER.size :]


def store(file, result):
    """Write the peaks to the cache, then trim the folder to CACHE_BYTES."""
    duration, channels, source, peaks = result
    folder = os.path.dirname(file)
    os.makedirs(folder, exist_ok=True)
    # Renamed into place whole, so no reader sees a part of the file
    with tempfile.NamedTemporaryFile(dir=folder, delete=False) as handle:
        handle.write(HEADER.pack(duration, channels, source))
        handle.write(peaks)
    os.replace(handle.name, file)
    entries = sorted(os.scandir(folder), key=lambda entry: entry.stat().st_mtime_ns)
    total = sum(entry.stat().st_size for entry in entries)
    for entry in entries:
        if total <= CACHE_BYTES:
            break
        os.remove(entry.path)
        total -= entry.stat().st_size


def decode(path, demuxer, key, level):
    """Compute the level in its decoder thread; keep levels 1 and 2 on disk.
    Returns the level reached and the peaks."""
    *result, level = (
        compute_peaks(path, demuxer, level == 2) if level else quick_view(path, demuxer)
    )
    if level:
        try:
            store(cache_file((*key, level)), result)
        except OSError as error:
            app_log.warning("Waveform peaks of %s not cached: %s", path, error)
    return level, tuple(result)


async def peaks_for(path, demuxer, level):
    """The level answered and its peaks: the most refined level cached at or
    above the one asked, or one decode of the level asked shared by every
    caller."""
    stat = os.stat(path)
    key = (path, stat.st_size, stat.st_mtime_ns)
    for cached in (2, 1):
        if cached >= level:
            result = await asyncio.to_thread(load, cache_file((*key, cached)))
            if result:
                return cached, result
    asked = (*key, level)
    job = _pending.get(asked)
    if not job:
        decoding = _decoders[level].submit(decode, path, demuxer, key, level)
        job = _pending[asked] = SimpleNamespace(
            decoding=decoding, future=asyncio.wrap_future(decoding), waiters=0
        )

        # Leaves when it ends, waited on or not
        def done(_):
            if _pending.get(asked) is job:
                del _pending[asked]

        job.future.add_done_callback(done)
    job.waiters += 1
    try:
        # Shielded: a request that leaves does not cancel the others' decode.
        return await asyncio.shield(job.future)
    finally:
        job.waiters -= 1
        # Nobody waits: a decode still queued never starts. One that started
        # runs to its end and caches, and a later request joins it meanwhile.
        if not job.waiters and job.decoding.cancel():
            del _pending[asked]


class WaveformHandler(APIHandler):
    auth_resource = "contents"
    # The wait for the peaks, which a closed connection cancels
    _wait = None

    def on_connection_close(self):
        if self._wait:
            self._wait.cancel()
        super().on_connection_close()

    @tornado.web.authenticated
    @authorized
    async def get(self):
        path = self.get_query_argument("path")
        level = self.get_query_argument("level", "1")
        if level not in ("0", "1", "2"):
            raise tornado.web.HTTPError(400, "The level is 0, 1 or 2")
        manager = self.contents_manager
        if not isinstance(manager, FileManagerMixin):
            raise tornado.web.HTTPError(501, "The contents are not on a local disk")
        root = os.path.realpath(manager.root_dir)
        full = os.path.realpath(os.path.join(root, path.lstrip("/")))
        if os.path.commonpath([root, full]) != root:
            raise tornado.web.HTTPError(403, "The path is outside the root directory")
        if not os.path.isfile(full):
            raise tornado.web.HTTPError(404, "No such file")
        # The name asked for, not the target of a symlink, says the type.
        demuxer = DEMUXERS.get(os.path.splitext(path)[1].lower())
        if not demuxer:
            raise tornado.web.HTTPError(422, "Not an audio file")
        try:
            self._wait = asyncio.create_task(peaks_for(full, demuxer, int(level)))
            level, (duration, channels, source, peaks) = await self._wait
        except asyncio.CancelledError:
            # The user left; nobody reads the answer.
            return
        except (av.error.FFmpegError, IndexError, ValueError) as error:
            self.log.warning("Waveform of %s not computed: %s", path, error)
            raise tornado.web.HTTPError(422, "The file does not decode") from None
        self.set_header("X-Waveform-Level", str(level))
        self.set_header("X-Waveform-Duration", str(duration))
        self.set_header("X-Waveform-Channels", str(channels))
        self.set_header("X-Waveform-Source-Channels", str(source))
        self.finish(peaks, set_content_type="application/octet-stream")


def setup_route_handlers(web_app):
    pattern = url_path_join(
        web_app.settings["base_url"],
        "jupyterlab-advanced-image-viewer-extension",
        "waveform",
    )
    web_app.add_handlers(".*$", [(pattern, WaveformHandler)])
