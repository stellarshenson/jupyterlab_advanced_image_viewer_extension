"""The waveform endpoint: the peaks of an audio file, decoded on the server.

GET <base_url>/jupyterlab-advanced-image-viewer-extension/waveform?path=<path>
answers application/octet-stream: per channel, one byte per millisecond, the
largest absolute sample of that millisecond scaled from 0..1 to 0..255,
channel 0 first. The headers X-Waveform-Duration (seconds) and
X-Waveform-Channels (1 or 2) carry what wavesurfer.js needs besides, and
X-Waveform-Source-Channels the file's own channel count. The peaks are kept on
disk in the user cache folder, so they outlive a server restart.
"""
import asyncio
import hashlib
import os
import struct
import tempfile
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

PEAKS_PER_SECOND = 1000
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
# Concurrent decodes in one process contend for the GIL; one at a time is the fastest.
_decoder = ThreadPoolExecutor(max_workers=1, thread_name_prefix="waveform")
# (path, size, mtime_ns) -> the decode queued or running and the count of
# requests waiting on it; a second request awaits the same decode
_pending = {}


def compute_peaks(path, demuxer):
    """Decode the first audio stream frame by frame, keeping only the peaks."""
    with av.open(path, format=demuxer) as container:
        stream = container.streams.audio[0]
        source = stream.channels
        channels = 2 if source > 1 else 1
        # Any sample format becomes planar float in -1..1; more than two
        # channels are mixed down, as wavesurfer draws two.
        resampler = av.AudioResampler(
            format="fltp", layout="stereo" if channels == 2 else "mono"
        )

        def frames():
            for frame in container.decode(stream):
                yield from resampler.resample(frame)
            yield from resampler.resample(None)

        buffers = [bytearray() for _ in range(channels)]

        def keep(maxima):
            scaled = (np.minimum(maxima, 1) * 255 + 0.5).astype(np.uint8)
            for buffer, row in zip(buffers, scaled):
                buffer += row.tobytes()

        samples = rate = 0
        # The millisecond still filling, carried from one frame to the next
        open_index, open_max = 0, np.zeros(channels, np.float32)
        for frame in frames():
            data = np.abs(frame.to_ndarray())
            if not data.shape[1]:
                continue
            rate = frame.sample_rate
            index = (
                np.arange(samples, samples + data.shape[1]) * PEAKS_PER_SECOND // rate
            )
            samples += data.shape[1]
            starts = np.flatnonzero(np.diff(index, prepend=-1))
            maxima = np.maximum.reduceat(data, starts, axis=1)
            if index[0] == open_index:
                maxima[:, 0] = np.maximum(maxima[:, 0], open_max)
            else:
                keep(open_max[:, None])
            keep(maxima[:, :-1])
            open_index, open_max = index[-1], maxima[:, -1]
    if not samples:
        raise ValueError("no audio samples")
    keep(open_max[:, None])
    return samples / rate, channels, source, b"".join(buffers)


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


def decode(path, demuxer, file):
    """Compute the peaks in the decoder thread and keep them on disk."""
    result = compute_peaks(path, demuxer)
    try:
        store(file, result)
    except OSError as error:
        app_log.warning("Waveform peaks of %s not cached: %s", path, error)
    return result


async def peaks_for(path, demuxer):
    """The cached peaks of the file, or one decode shared by every caller."""
    stat = os.stat(path)
    key = (path, stat.st_size, stat.st_mtime_ns)
    file = cache_file(key)
    cached = await asyncio.to_thread(load, file)
    if cached:
        return cached
    job = _pending.get(key)
    if not job:
        decoding = _decoder.submit(decode, path, demuxer, file)
        job = _pending[key] = SimpleNamespace(
            decoding=decoding, future=asyncio.wrap_future(decoding), waiters=0
        )

        # Leaves when it ends, waited on or not
        def done(_):
            if _pending.get(key) is job:
                del _pending[key]

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
            del _pending[key]


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
            self._wait = asyncio.create_task(peaks_for(full, demuxer))
            duration, channels, source, peaks = await self._wait
        except asyncio.CancelledError:
            # The user left; nobody reads the answer.
            return
        except (av.error.FFmpegError, IndexError, ValueError) as error:
            self.log.warning("Waveform of %s not computed: %s", path, error)
            raise tornado.web.HTTPError(422, "The file does not decode") from None
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
