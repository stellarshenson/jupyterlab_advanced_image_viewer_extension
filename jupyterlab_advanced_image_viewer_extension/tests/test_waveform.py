"""ACC-WAVE-115 to ACC-WAVE-119, ACC-WAVE-121, ACC-WAVE-122 and ACC-WAVE-137 to
ACC-WAVE-142: the waveform endpoint and its levels.

The server runs in the test process (pytest-jupyter) on a free port with its
own temporary root and peaks cache. A decode is counted by wrapping av.open,
which the endpoint calls once per decode (twice for an ADTS or Ogg file, whose
packets it counts first); the tests write their audio through
`_open`, the unwrapped function, so writing is not counted.
"""
import asyncio
import contextlib
import ctypes
import errno
import hashlib
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from importlib import metadata

import av
import numpy as np
import pytest
from jupyter_server.services.contents.manager import ContentsManager
from tornado.httpclient import HTTPClientError

from jupyterlab_advanced_image_viewer_extension import routes

NAME = "jupyterlab_advanced_image_viewer_extension"
ENDPOINT = ("jupyterlab-advanced-image-viewer-extension", "waveform")
RATE = 48000
MIB = 1024**2
_open = av.open
# (amplitude, seconds) of a 440 Hz tone; amplitude 0 is silence
SECTIONS = [(0.8, 1), (0, 1), (0.3, 0.6), (0, 1.2), (0.6, 1.2), (0, 1)]
# The same sections 15 times as long, 90 s: longer than routes.SHORT, so level
# 0 is the quick view and not the fast pass
LONG_SECTIONS = [(amplitude, 15 * seconds) for amplitude, seconds in SECTIONS]

# File suffix -> container format and encoder. FFmpeg's own Vorbis encoder is
# marked experimental, hence the strict option in encode().
FORMATS = {
    "aac": ("adts", "aac"),
    "flac": ("flac", "flac"),
    "m4a": ("ipod", "aac"),
    "mp3": ("mp3", "libmp3lame"),
    "ogg": ("ogg", "vorbis"),
    "opus": ("opus", "libopus"),
    "wav": ("wav", "pcm_s16le"),
}


def encode(path, tone=1.0, silence=1.0, layout="stereo"):
    """Write a file of a 440 Hz tone at half scale, then silence."""
    t = np.arange(round((tone + silence) * RATE)) / RATE
    write(path, np.where(t < tone, 0.5 * np.sin(2 * np.pi * 440 * t), 0), layout)


def write(path, wave, layout="stereo", bit_rate=None, options=None):
    """Write the samples, one row per channel or one row for every channel, in
    the format the suffix names, at the bit rate and with the container
    options given."""
    container_format, codec = FORMATS[path.suffix[1:]]
    nb_channels = av.AudioLayout(layout).nb_channels
    frame = av.AudioFrame.from_ndarray(
        np.broadcast_to(wave, (nb_channels, wave.shape[-1])).astype(
            np.float32, order="C"
        ),
        format="fltp",
        layout=layout,
    )
    frame.sample_rate = RATE
    with _open(
        str(path), "w", format=container_format, options=options or {}
    ) as container:
        stream = container.add_stream(
            codec, rate=RATE, layout=layout, options={"strict": "experimental"}
        )
        if bit_rate:
            stream.codec_context.bit_rate = bit_rate
        for packet in [*stream.encode(frame), *stream.encode(None)]:
            container.mux(packet)


def joined_mp3(path, parts):
    """Write the (seconds, amplitude, bit rate) parts of a 440 Hz tone, each an
    MP3 without a Xing, Info or VBRI header, joined end to end, as parts of a
    stream are: FFmpeg estimates the duration from the first frame's bit rate."""
    data = []
    for seconds, amplitude, bit_rate in parts:
        part = path.with_name(f"part{bit_rate}.mp3")
        t = np.arange(seconds * RATE) / RATE
        write(
            part,
            amplitude * np.sin(2 * np.pi * 440 * t),
            bit_rate=bit_rate,
            options={"write_xing": "0", "id3v2_version": "0"},
        )
        data.append(part.read_bytes())
    path.write_bytes(b"".join(data))


def flac_total(path, total):
    """Set the total samples a FLAC file states: the low 36 bits of bytes 21
    to 25, in the STREAMINFO block that FFmpeg writes first."""
    data = bytearray(path.read_bytes())
    data[21:26] = ((data[21] & 0xF0) << 32 | total).to_bytes(5, "big")
    path.write_bytes(data)


def sparse_wav(path, seconds):
    """A 48 kHz stereo 16-bit WAV of silence that takes no disk space."""
    size = seconds * RATE * 2 * 2
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + size, b"WAVE", b"fmt ", 16, 1, 2, RATE, RATE * 4, 4, 16,
        b"data", size,
    )
    with open(path, "wb") as handle:
        handle.write(header)
        handle.truncate(len(header) + size)


def rss_bytes():
    with open("/proc/self/status") as status:
        for line in status:
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    raise RuntimeError("no VmRSS")


def sectioned(path, sections):
    """Write a 440 Hz tone of each (amplitude, seconds), 0 for silence; return
    the section edges in seconds."""
    edges = np.cumsum([0] + [seconds for _, seconds in sections])
    t = np.arange(round(edges[-1] * RATE)) / RATE
    section = np.searchsorted(edges, t, "right") - 1
    write(path, np.array([a for a, _ in sections])[section] * np.sin(2 * np.pi * 440 * t))
    return edges


async def fetch_peaks(jp_fetch, path, level=None, **kwargs):
    params = {"path": path}
    if level is not None:
        params["level"] = level
    return await jp_fetch(*ENDPOINT, params=params, **kwargs)


def parse(response):
    """Duration in seconds and the peaks as a channels x points array."""
    duration = float(response.headers["X-Waveform-Duration"])
    channels = int(response.headers["X-Waveform-Channels"])
    peaks = np.frombuffer(response.body, np.uint8).reshape(channels, -1)
    return duration, peaks


def answered(response):
    """The level the server names in its answer."""
    return response.headers.get("X-Waveform-Level")


@pytest.fixture(autouse=True)
def cache(monkeypatch, tmp_path):
    """The folder of the peaks cache, empty for each test."""
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    return tmp_path / "cache" / NAME


SECOND = {"Authorization": "token second"}


@contextlib.contextmanager
def second_server(root):
    """The base URL of a second server process serving the root, on a free
    port that is not the lab's 8888; its token is "second"."""
    port = 8888
    while port == 8888:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
    server = subprocess.Popen(
        [
            sys.executable, "-m", "jupyter_server", "--no-browser",
            f"--port={port}", "--ServerApp.ip=127.0.0.1",
            "--IdentityProvider.token=second", f"--ServerApp.root_dir={root}",
            f"--ServerApp.jpserver_extensions={NAME}=True",
        ],
        # No configuration but this extension; the environment of the test
        # gives the same cache folder and imports the same package.
        env={**os.environ, "JUPYTER_NO_CONFIG": "1"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(300):
            try:
                read(f"{base}/api/status")
                break
            except urllib.error.URLError:
                time.sleep(0.1)
        else:
            raise TimeoutError("the second server did not start in 30 s")
        yield base
    finally:
        server.terminate()
        server.wait(10)


def read(url, headers=None, timeout=30):
    """Status and body of a GET with the second server's token."""
    request = urllib.request.Request(url, headers={**SECOND, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def second_server_answer(root, path):
    """Status and body of a peaks request to a second server process."""
    with second_server(root) as base:
        return read(f"{base}/{'/'.join(ENDPOINT)}?path={path}")


@pytest.fixture
def opened(monkeypatch):
    """The files av.open read, in order."""
    paths = []

    def counting_open(file, *args, **kwargs):
        paths.append(str(file))
        return _open(file, *args, **kwargs)

    monkeypatch.setattr(av, "open", counting_open)
    return paths


@pytest.mark.parametrize("suffix", sorted(FORMATS))
async def test_wave_115_peaks_for_every_audio_type(
    jp_fetch, jp_root_dir, tmp_path, monkeypatch, suffix
):
    encode(jp_root_dir / f"tone.{suffix}")
    no_tools = tmp_path / "no-tools"
    no_tools.mkdir()
    monkeypatch.setenv("PATH", str(no_tools))
    assert shutil.which("ffmpeg") is None

    duration, peaks = parse(await fetch_peaks(jp_fetch, f"tone.{suffix}"))

    assert abs(duration - 2) < 0.1
    assert peaks.shape[0] == 2
    # One peak per channel per millisecond.
    assert abs(peaks.shape[1] - 1000 * duration) <= 1
    last_half_second = peaks[:, -round(peaks.shape[1] / duration / 2) :]
    assert peaks.max() > 10 * last_half_second.max()


@pytest.mark.parametrize("suffix", sorted(FORMATS))
async def test_wave_137_a_10_second_file_keeps_one_peak_per_millisecond(
    jp_fetch, jp_root_dir, suffix
):
    encode(jp_root_dir / f"clip.{suffix}", tone=5, silence=5)

    duration, peaks = parse(await fetch_peaks(jp_fetch, f"clip.{suffix}"))

    assert abs(duration - 10) < 0.1
    assert peaks.shape[0] == 2
    assert abs(peaks.shape[1] - 1000 * duration) <= 1


@pytest.mark.parametrize("level", [1, 2])
async def test_wave_137_the_bins_span_the_length_of_an_mp3_whose_stated_one_is_estimated(
    jp_fetch, jp_root_dir, level
):
    # 2 s at 320 kbit/s, then 58 s at 32 kbit/s: FFmpeg estimates 7.8 s, which
    # would give bins of 1 ms, 60000 of them.
    joined_mp3(jp_root_dir / "estimated.mp3", [(2, 0.5, 320000), (58, 0.8, 32000)])

    duration, peaks = parse(await fetch_peaks(jp_fetch, "estimated.mp3", level))

    assert abs(duration - 60) <= 0.1
    assert abs(peaks.shape[1] - routes.PEAKS) <= 1


@pytest.mark.parametrize("suffix", sorted(FORMATS))
@pytest.mark.parametrize("level", [1, 2])
async def test_wave_138_the_peaks_keep_the_loudness_envelope(
    jp_fetch, jp_root_dir, monkeypatch, level, suffix
):
    # Bins of 0.2 s, as a 67-minute file gets, so the lossy decode skips packets
    monkeypatch.setattr(routes, "PEAKS", 30)
    sections = SECTIONS
    edges = sectioned(jp_root_dir / f"envelope.{suffix}", sections)

    duration, peaks = parse(await fetch_peaks(jp_fetch, f"envelope.{suffix}", level))

    assert abs(duration - edges[-1]) <= 0.05
    # PEAKS bins over the duration the file states; ADTS states it in its
    # frame headers only
    assert abs(peaks.shape[1] - 30) <= 1
    # Bin i covers [i, i + 1) * width seconds.
    width = duration / peaks.shape[1]
    starts = np.arange(peaks.shape[1]) * width
    centres = starts + width / 2
    values = peaks / 255
    # Silence is read away from its edges, past the codec's start delay.
    guard = max(0.1, width)
    delay = min(max(duration - edges[-1], 0), 0.05)
    for (loudness, _), start, end in zip(sections, edges, edges[1:]):
        if loudness:
            top = values[:, (centres >= start) & (centres < end)].max(axis=1)
            assert (top >= loudness / 2).all(), (start, top)
            assert (top <= loudness + 0.15).all(), (start, top)
        else:
            inside = (starts >= start + guard + delay) & (starts + width <= end - guard)
            assert inside.any()
            assert values[:, inside].max() <= 0.05, (start, values[:, inside])


@pytest.mark.parametrize("suffix", sorted(FORMATS))
async def test_wave_138_a_loud_part_two_bins_long_shows_in_the_fast_pass(
    jp_fetch, jp_root_dir, monkeypatch, suffix
):
    # Bins of 0.2 s; the fast pass decodes one run at the start of each bin.
    # Each 0.4 s tone at 0.8 starts 0.01 s after a bin start, so one whole
    # bin, and the run decoded at its start, lies inside it. The silences of
    # 1 s keep a whole bin inside their guards when the bins are 0.6 % wider.
    monkeypatch.setattr(routes, "PEAKS", 30)
    sections = [(0, 0.81), *[(0.8, 0.4), (0, 1)] * 2, (0.8, 0.4), (0, 1.99)]
    edges = sectioned(jp_root_dir / f"two-bins.{suffix}", sections)

    response = await fetch_peaks(jp_fetch, f"two-bins.{suffix}", 1)

    assert answered(response) in ("1", "2")
    duration, peaks = parse(response)
    width = duration / peaks.shape[1]
    starts = np.arange(peaks.shape[1]) * width
    centres = starts + width / 2
    values = peaks / 255
    guard = max(0.1, width)
    delay = min(max(duration - edges[-1], 0), 0.05)
    for (loudness, _), start, end in zip(sections, edges, edges[1:]):
        if loudness:
            top = values[:, (centres >= start) & (centres < end)].max(axis=1)
            assert (top >= 0.4).all(), (start, top)
        else:
            inside = (starts >= start + guard + delay) & (starts + width <= end - guard)
            assert inside.any()
            assert values[:, inside].max() <= 0.05, (start, values[:, inside])


@pytest.mark.parametrize("suffix", ["ogg", "opus"])
async def test_wave_138_a_chained_ogg_answers_the_duration_of_both_parts(
    jp_fetch, jp_root_dir, suffix
):
    # Two files joined byte for byte, as a recorded Icecast stream is; the
    # packet times of the second part start again from 0.
    encode(jp_root_dir / f"first.{suffix}", tone=2, silence=2)
    encode(jp_root_dir / f"second.{suffix}", tone=3, silence=3)
    (jp_root_dir / f"chain.{suffix}").write_bytes(
        (jp_root_dir / f"first.{suffix}").read_bytes()
        + (jp_root_dir / f"second.{suffix}").read_bytes()
    )

    duration, _ = parse(await fetch_peaks(jp_fetch, f"chain.{suffix}"))

    assert abs(duration - 10) <= 0.05


async def test_wave_138_a_vorbis_file_with_wrong_packet_times_answers_its_duration(
    jp_fetch, jp_root_dir
):
    # FFmpeg's Vorbis encoder, given frames without times, writes wrong
    # granule positions: the last packet states a duration of about 25 hours.
    encode(jp_root_dir / "six.ogg", tone=3, silence=3)

    duration, peaks = parse(await fetch_peaks(jp_fetch, "six.ogg"))

    assert abs(duration - 6) <= 0.05
    # One peak per millisecond at most, as the full decode gave: the Vorbis
    # blocks hold 6.016 s, so 6016 peaks per channel.
    assert peaks.shape[1] <= 1000 * duration + 1


@pytest.mark.parametrize("suffix", ["flac", "wav"])
async def test_wave_138_a_lossless_file_answers_its_decoded_duration(
    jp_fetch, jp_root_dir, suffix
):
    # 96001 samples, not a whole number of packets
    path = jp_root_dir / f"odd.{suffix}"
    encode(path, tone=1, silence=1 + 1 / RATE)
    with _open(str(path)) as container:
        samples = sum(frame.samples for frame in container.decode(audio=0))

    duration, _ = parse(await fetch_peaks(jp_fetch, f"odd.{suffix}"))

    # The full decode before the peaks were binned counted the decoded samples.
    assert duration == samples / RATE


@pytest.mark.parametrize("suffix", sorted(FORMATS))
async def test_wave_140_each_quick_view_point_reads_its_section(
    jp_fetch, jp_root_dir, suffix
):
    # The ADTS file states no duration and the Ogg Vorbis file wrong packet times.
    edges = sectioned(jp_root_dir / f"quick.{suffix}", LONG_SECTIONS)

    response = await fetch_peaks(jp_fetch, f"quick.{suffix}", 0)

    assert answered(response) == "0"
    duration, peaks = parse(response)
    assert abs(duration - edges[-1]) <= 0.05
    assert peaks.shape[0] == 2
    assert abs(peaks.shape[1] - 1000) <= 1
    assert_points_read_their_sections(duration, peaks, edges)


def assert_points_read_their_sections(duration, peaks, edges, skip=(0, 0)):
    """Each point away from a section edge, and outside the skip range of
    seconds, reads its section: a tone at least half its amplitude and at most
    0.15 above it, a silence at most 0.05."""
    # Point i covers [i, i + 1) * width.
    width = duration / peaks.shape[1]
    starts = np.arange(peaks.shape[1]) * width
    values = peaks / 255
    # A point is the frame read there, up to 0.1 s long, placed by its start.
    guard = 0.2
    outside = (starts + width <= skip[0]) | (starts >= skip[1])
    for (loudness, _), start, end in zip(SECTIONS, edges, edges[1:]):
        inside = (starts >= start + guard) & (starts + width <= end - guard)
        assert inside.any()
        read = values[:, inside & outside]
        if loudness:
            assert (read >= loudness / 2).all(), (start, read.min(axis=1))
            assert (read <= loudness + 0.15).all(), (start, read.max(axis=1))
        else:
            assert (read <= 0.05).all(), (start, read.max(axis=1))


@pytest.mark.parametrize("seconds", [3, 1])
async def test_wave_140_the_quick_view_answers_the_length_of_a_vorbis_file_with_wrong_packet_times(
    jp_fetch, jp_root_dir, seconds
):
    # FFmpeg's Vorbis encoder, given frames without times, writes wrong
    # granule positions, so the duration FFmpeg states is wrong: 0.38 s for
    # the 6 s file, whose first frame lies 5 s early, and 0.14 s for the 2 s
    # file, whose first frame lies at its start.
    encode(jp_root_dir / f"wrong{2 * seconds}.ogg", tone=seconds, silence=seconds)

    response = await fetch_peaks(jp_fetch, f"wrong{2 * seconds}.ogg", 0)

    assert answered(response) == "0"
    duration, _ = parse(response)
    assert abs(duration - 2 * seconds) <= 0.05


async def test_wave_140_a_failed_seek_leaves_its_point_to_the_nearest_point_read(
    jp_fetch, jp_root_dir, monkeypatch
):
    edges = sectioned(jp_root_dir / "seek.flac", LONG_SECTIONS)
    # Seeks into 63 to 69 s, inside the 0.6 tone, fail as FFmpeg's seek near
    # the end of a FLAC file without a seek table does.
    failed = []

    class FailingSeeks:
        def __init__(self, container):
            self.container = container

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return self.container.__exit__(*exc)

        def __getattr__(self, name):
            return getattr(self.container, name)

        def seek(self, offset, **kwargs):
            if 63 <= offset * kwargs["stream"].time_base < 69:
                failed.append(offset)
                raise av.error.PermissionError(errno.EPERM, "Operation not permitted")
            return self.container.seek(offset, **kwargs)

    monkeypatch.setattr(av, "open", lambda *a, **k: FailingSeeks(_open(*a, **k)))

    response = await fetch_peaks(jp_fetch, "seek.flac", 0)

    assert failed
    duration, peaks = parse(response)
    assert abs(peaks.shape[1] - 1000) <= 1
    # The points of the other seeks read their sections ...
    assert_points_read_their_sections(duration, peaks, edges, skip=(63, 69))
    # ... and those of the failed seeks show the tone around them.
    width = duration / peaks.shape[1]
    starts = np.arange(peaks.shape[1]) * width
    values = peaks[:, (starts >= 63) & (starts + width <= 69)] / 255
    assert ((values >= 0.3) & (values <= 0.75)).all(), values


async def test_wave_140_the_quick_view_answers_the_duration_of_an_mp3_whose_stated_one_is_estimated(
    jp_fetch, jp_root_dir
):
    # 10 s at 32 kbit/s then 90 s at 320 kbit/s, as a VBR file without a
    # header: FFmpeg estimates 910 s. 100 s is longer than routes.SHORT.
    joined_mp3(jp_root_dir / "mixed.mp3", [(10, 0.5, 32000), (90, 0.8, 320000)])

    quick = await fetch_peaks(jp_fetch, "mixed.mp3", 0)
    fast = await fetch_peaks(jp_fetch, "mixed.mp3", 1)

    assert answered(quick) == "0"
    assert abs(parse(quick)[0] - parse(fast)[0]) <= 0.05


@pytest.mark.parametrize("suffix", ["flac", "mp3", "wav"])
async def test_wave_140_a_file_under_a_second_gets_the_fast_pass_kept_as_level_2(
    jp_fetch, jp_root_dir, opened, suffix
):
    # The fast pass of a quarter second decodes every packet faster than the
    # quick view seeks 1000 times, and gives one point per millisecond: 250.
    encode(jp_root_dir / f"short.{suffix}", tone=0.25, silence=0)

    quick = await fetch_peaks(jp_fetch, f"short.{suffix}", 0)
    decodes = len(opened)
    full = await fetch_peaks(jp_fetch, f"short.{suffix}", 2)

    assert answered(quick) == "2"
    assert parse(quick)[1].shape[1] <= 250
    assert len(opened) == decodes
    assert full.body == quick.body


@pytest.mark.parametrize("suffix", ["aac", "flac", "m4a", "mp3", "opus", "wav"])
async def test_wave_140_a_file_shorter_than_the_threshold_gets_the_fast_pass_kept_as_level_2(
    jp_fetch, jp_root_dir, opened, suffix
):
    # Under the threshold the fast pass of every format is no slower than the
    # quick view, so a 60 s file is drawn once. The Vorbis file the encoder
    # writes states a wrong duration and goes to the quick view's own fast pass.
    encode(jp_root_dir / f"minute.{suffix}", tone=30, silence=30)

    quick = await fetch_peaks(jp_fetch, f"minute.{suffix}", 0)
    decodes = len(opened)
    fast = await fetch_peaks(jp_fetch, f"minute.{suffix}", 1)
    full = await fetch_peaks(jp_fetch, f"minute.{suffix}", 2)

    assert answered(quick) == "2"
    assert len(opened) == decodes
    assert fast.body == full.body == quick.body


@pytest.mark.parametrize("change", ["half", "twice", "cut"])
async def test_wave_140_the_quick_view_answers_the_length_of_a_flac_file_whose_header_states_a_wrong_one(
    jp_fetch, jp_root_dir, change
):
    # 200 s, so that the 100 s of a file cut in half or stating half are still
    # drawn by the quick view
    path = jp_root_dir / "wrong.flac"
    write(path, np.zeros(200 * RATE))
    if change == "cut":
        # At the frame boundary at 100 s, as a copy that stopped there
        with _open(str(path)) as container:
            stream = container.streams.audio[0]
            cut = next(
                packet.pos
                for packet in container.demux(stream)
                if packet.pts is not None and packet.pts * stream.time_base >= 100
            )
        path.write_bytes(path.read_bytes()[:cut])
    else:
        flac_total(path, 200 * RATE // 2 if change == "half" else 200 * RATE * 2)

    quick = await fetch_peaks(jp_fetch, "wrong.flac", 0)
    fast = await fetch_peaks(jp_fetch, "wrong.flac", 1)

    assert answered(quick) == "0"
    assert abs(parse(quick)[0] - parse(fast)[0]) <= 0.05


async def test_wave_140_a_file_stating_no_duration_gets_no_more_points_than_the_fast_pass(
    jp_fetch, jp_root_dir
):
    # A FLAC whose STREAMINFO states a total of 0: the fast pass has bins of
    # 0.2 s, 750 over 150 s, fewer than the quick view's 1000 points.
    path = jp_root_dir / "untold.flac"
    write(path, np.zeros(150 * RATE))
    flac_total(path, 0)

    quick = await fetch_peaks(jp_fetch, "untold.flac", 0)
    fast = await fetch_peaks(jp_fetch, "untold.flac", 1)

    assert parse(fast)[1].shape[1] == 750
    assert parse(quick)[1].shape[1] <= 750


@pytest.mark.parametrize("suffix", ["aac", "m4a", "mp3", "ogg", "opus"])
async def test_wave_142_the_full_pass_shows_every_short_loud_sound(
    jp_fetch, jp_root_dir, monkeypatch, suffix
):
    # Bins of 0.5 s over 10 s: the fast pass decodes one run at the start of
    # each bin and passes over the rest.
    monkeypatch.setattr(routes, "PEAKS", 20)
    t = np.arange(10 * RATE) / RATE
    # An 80 ms tone at 0.8 in the middle of each bin
    burst = (t % 0.5 >= 0.21) & (t % 0.5 < 0.29)
    write(
        jp_root_dir / f"bursts.{suffix}",
        np.where(burst, 0.8 * np.sin(2 * np.pi * 440 * t), 0),
    )

    fast = await fetch_peaks(jp_fetch, f"bursts.{suffix}", 1)
    full = await fetch_peaks(jp_fetch, f"bursts.{suffix}", 2)

    assert (answered(fast), answered(full)) == ("1", "2")
    _, fast_peaks = parse(fast)
    duration, full_peaks = parse(full)
    # The same bins; the fast pass counts the packets it passes over at the
    # end at the length of the last one decoded, so its count can pass that
    # of the full pass by the last bin (the end padding of an MP3 file).
    assert 0 <= fast_peaks.shape[1] - full_peaks.shape[1] <= 1
    assert fast_peaks.shape[0] == full_peaks.shape[0]
    # PEAKS bins over the duration the file states, which a decode can pass
    # by a part of a bin; each burst lies 0.25 s inside one.
    bins = ((np.arange(20) * 0.5 + 0.25) / (duration / 20)).astype(int)
    assert (full_peaks[:, bins] / 255 >= 0.4).all(), full_peaks[:, bins] / 255
    # The fast pass misses bursts that the full pass shows.
    assert (fast_peaks[:, bins] / 255 < 0.4).any()


async def test_wave_141_the_level_asked_and_the_level_answered(
    jp_fetch, jp_root_dir, monkeypatch, opened
):
    # Bins of 0.2 s, so the fast pass of the 6 s MP3 passes over packets
    monkeypatch.setattr(routes, "PEAKS", 30)
    encode(jp_root_dir / "levels.mp3", tone=3, silence=3)
    for bad in ("3", "-1", "one", "", "1.0"):
        with pytest.raises(HTTPClientError) as error:
            await fetch_peaks(jp_fetch, "levels.mp3", bad)
        assert error.value.code == 400, bad
    assert opened == []

    # (level asked, level answered, decodes so far): the most refined level
    # cached at or above the one asked, otherwise the level asked, computed.
    # No level asks for level 1.
    steps = [
        (None, "1", 1), (0, "1", 1), (1, "1", 1),
        (2, "2", 2), (0, "2", 2), (1, "2", 2), (2, "2", 2),
    ]
    for asked, expected, decodes in steps:
        response = await fetch_peaks(jp_fetch, "levels.mp3", asked)
        assert (answered(response), len(opened)) == (expected, decodes), asked


@pytest.mark.parametrize("asked, expected", [(0, "0"), (1, "2"), (2, "2")])
async def test_wave_141_requests_for_one_file_and_level_share_one_job(
    jp_fetch, jp_root_dir, monkeypatch, asked, expected
):
    # 90 s, longer than routes.SHORT, so level 0 is the quick view
    sparse_wav(jp_root_dir / "shared.wav", 90)
    opened = []

    def slow_open(file, *args, **kwargs):
        opened.append(str(file))
        time.sleep(0.5)
        return _open(file, *args, **kwargs)

    monkeypatch.setattr(av, "open", slow_open)
    first, second = await asyncio.gather(
        *(fetch_peaks(jp_fetch, "shared.wav", asked) for _ in range(2))
    )
    assert (answered(first), answered(second)) == (expected, expected)
    assert second.body == first.body
    assert len(opened) == 1


async def test_wave_140_a_quick_view_never_waits_behind_a_refinement(
    jp_fetch, jp_root_dir, monkeypatch
):
    for name in ("full", "fast", "next", "quick"):
        encode(jp_root_dir / f"{name}.wav")
    decode = routes.compute_peaks

    def slow(path, *args):
        if os.path.basename(path) in ("full.wav", "fast.wav"):
            time.sleep(4)
        return decode(path, *args)

    monkeypatch.setattr(routes, "compute_peaks", slow)

    async def seconds(name, asked):
        started = time.monotonic()
        await fetch_peaks(jp_fetch, name, asked)
        return time.monotonic() - started

    full = asyncio.ensure_future(fetch_peaks(jp_fetch, "full.wav", 2))
    await asyncio.sleep(0.3)
    # A fast pass never waits behind the full pass of another file ...
    assert await seconds("next.wav", 1) < 2
    fast = asyncio.ensure_future(fetch_peaks(jp_fetch, "fast.wav", 1))
    await asyncio.sleep(0.3)
    # ... and a quick view behind neither.
    assert await seconds("quick.wav", 0) < 2
    await asyncio.gather(full, fast)


async def test_wave_116_a_long_file_decodes_as_a_stream(jp_fetch, jp_root_dir):
    sparse_wav(jp_root_dir / "warm.wav", 1)
    await fetch_peaks(jp_fetch, "warm.wav")
    # 20 min of 48 kHz stereo 16-bit samples: 230 MB decoded.
    sparse_wav(jp_root_dir / "long.wav", 20 * 60)
    baseline = peak = rss_bytes()
    done = threading.Event()

    def sample():
        nonlocal peak
        while not done.is_set():
            peak = max(peak, rss_bytes())
            time.sleep(0.02)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    started = time.monotonic()
    try:
        response = await fetch_peaks(jp_fetch, "long.wav", request_timeout=300)
    finally:
        done.set()
        sampler.join()
    seconds = time.monotonic() - started

    duration, peaks = parse(response)
    print(
        "PERF 116 "
        + json.dumps(
            {
                "baseline_rss_bytes": baseline,
                "peak_rss_bytes": peak,
                "growth_bytes": peak - baseline,
                "body_bytes": len(response.body),
                "seconds": round(seconds, 2),
            }
        )
    )
    assert duration == 20 * 60
    assert peaks.shape == (2, 20000)
    assert peak - baseline < 64 * MIB


async def test_wave_117_peaks_are_cached_per_path_size_and_time(
    jp_fetch, jp_root_dir, opened
):
    path = jp_root_dir / "cached.wav"
    encode(path)
    first = await fetch_peaks(jp_fetch, "cached.wav")
    second = await fetch_peaks(jp_fetch, "cached.wav")
    assert len(opened) == 1
    assert second.body == first.body

    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 10**9))
    await fetch_peaks(jp_fetch, "cached.wav")
    assert len(opened) == 2

    encode(path, tone=0.5, silence=0.5)
    kept = await fetch_peaks(jp_fetch, "cached.wav")
    duration, _ = parse(kept)
    assert len(opened) == 3
    assert abs(duration - 1) < 0.1

    # Zeros of the same size and time decode to no audio, so only the disk
    # cache can give a restarted server these peaks.
    stat = path.stat()
    path.write_bytes(bytes(stat.st_size))
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns))
    status, body = second_server_answer(jp_root_dir, "cached.wav")
    assert status == 200, body
    assert body == kept.body


async def test_wave_117_the_cache_removes_the_least_recently_used_peaks_first(
    jp_fetch, jp_root_dir, opened, cache, monkeypatch
):
    for name in "abc":
        encode(jp_root_dir / f"{name}.wav")
    await fetch_peaks(jp_fetch, "a.wav")
    # Room for the peaks of two of the files, as 1 GiB is in use
    used = sum(file.stat().st_size for file in cache.glob("*"))
    monkeypatch.setattr(routes, "CACHE_BYTES", 2 * used, raising=False)
    for name in "bac":
        # Coarse file times still order the uses
        await asyncio.sleep(0.05)
        await fetch_peaks(jp_fetch, f"{name}.wav")
    assert len(opened) == 3
    assert len(list(cache.glob("*"))) == 2

    await fetch_peaks(jp_fetch, "a.wav")
    await fetch_peaks(jp_fetch, "c.wav")
    assert len(opened) == 3
    await fetch_peaks(jp_fetch, "b.wav")
    assert len(opened) == 4


@pytest.mark.parametrize("suffix", ["flac", "mp3", "wav"])
async def test_wave_117_a_fast_pass_that_decoded_every_packet_is_kept_as_level_2(
    jp_fetch, jp_root_dir, opened, suffix
):
    # 2 s: bins of 1 ms, so the fast pass decodes every packet of a lossy file too
    encode(jp_root_dir / f"whole.{suffix}")

    fast = await fetch_peaks(jp_fetch, f"whole.{suffix}", 1)
    decodes = len(opened)
    full = await fetch_peaks(jp_fetch, f"whole.{suffix}", 2)

    assert (answered(fast), answered(full)) == ("2", "2")
    assert len(opened) == decodes
    assert full.body == fast.body


async def test_wave_117_the_quick_view_is_never_cached_and_an_earlier_versions_file_never_answers_as_level_2(
    jp_fetch, jp_root_dir, monkeypatch, opened, cache
):
    monkeypatch.setattr(routes, "PEAKS", 30)
    path = jp_root_dir / "kept.mp3"
    # 90 s, longer than routes.SHORT, so level 0 is the quick view
    encode(path, tone=45, silence=45)
    # The cache file of an earlier version, named by path, size and
    # modification time
    stat = path.stat()
    key = (os.path.realpath(path), stat.st_size, stat.st_mtime_ns)
    cache.mkdir(parents=True)
    earlier = cache / hashlib.sha256(repr(key).encode()).hexdigest()
    planted = bytes([255]) * 60
    earlier.write_bytes(routes.HEADER.pack(6.0, 2, 2) + planted)

    for decodes in (1, 2):
        assert answered(await fetch_peaks(jp_fetch, "kept.mp3", 0)) == "0"
        assert len(opened) == decodes
    assert list(cache.glob("*")) == [earlier]

    full = await fetch_peaks(jp_fetch, "kept.mp3", 2)
    assert answered(full) == "2"
    assert len(opened) == 3
    assert full.body != planted
    assert len(list(cache.glob("*"))) == 2
    for asked in (0, 1):
        assert (await fetch_peaks(jp_fetch, "kept.mp3", asked)).body == full.body
    assert len(opened) == 3


async def test_def_wave_57_the_answer_names_the_channels_of_the_file(
    jp_fetch, jp_root_dir
):
    # A 5.1 file with the 440 Hz half-scale tone in channel 2, the centre, only.
    t = np.arange(2 * RATE) / RATE
    wave = np.zeros((6, len(t)))
    wave[2] = np.where(t < 1, 0.5 * np.sin(2 * np.pi * 440 * t), 0)
    write(jp_root_dir / "surround.wav", wave, layout="5.1")
    # The second answer comes from the disk cache.
    for _ in range(2):
        response = await fetch_peaks(jp_fetch, "surround.wav")
        peaks = parse(response)[1]
        # Peaks of two channels, as wavesurfer draws two; the file has six.
        assert peaks.shape[0] == 2
        source = response.headers.get("X-Waveform-Source-Channels")
        assert source == "6"
        # The centre channel shows in both rows at least half its loudness.
        assert (peaks.max(axis=1) / 255 >= 0.5 / 2).all(), peaks.max(axis=1)


async def test_one_decode_serves_concurrent_requests_off_the_event_loop(
    jp_fetch, jp_root_dir, monkeypatch
):
    encode(jp_root_dir / "slow.wav")
    opened = []

    def slow_open(file, *args, **kwargs):
        opened.append(str(file))
        time.sleep(1)
        return _open(file, *args, **kwargs)

    monkeypatch.setattr(av, "open", slow_open)
    first = asyncio.ensure_future(fetch_peaks(jp_fetch, "slow.wav"))
    second = asyncio.ensure_future(fetch_peaks(jp_fetch, "slow.wav"))
    await asyncio.sleep(0.2)
    started = time.monotonic()
    await jp_fetch("api", "status")
    assert time.monotonic() - started < 0.5
    first, second = await asyncio.gather(first, second)
    assert second.body == first.body
    assert len(opened) == 1


def test_wave_139_byte_ranges_of_the_audio_answer_at_once_while_a_full_pass_runs(
    tmp_path,
):
    # The full pass of a 5-hour file decodes every packet for seconds.
    sparse_wav(tmp_path / "long.wav", 5 * 60 * 60)
    sparse_wav(tmp_path / "playing.wav", 10 * 60)

    def p95_of_byte_ranges(base):
        """p95 in seconds of 20 GETs of 1 MiB of the playing file through the
        lab's file handler, as playback and its seeks read it."""
        seconds = []
        for i in range(20):
            began = time.perf_counter()
            status, body = read(
                f"{base}/files/playing.wav",
                {"Range": f"bytes={i * 5 * MIB}-{(i * 5 + 1) * MIB - 1}"},
            )
            seconds.append(time.perf_counter() - began)
            assert (status, len(body)) == (206, MIB)
            time.sleep(0.02)
        return float(np.percentile(seconds, 95))

    with second_server(tmp_path) as base:
        p95_of_byte_ranges(base)
        idle = p95_of_byte_ranges(base)
        answer = []
        full = threading.Thread(
            target=lambda: answer.append(
                read(f"{base}/{'/'.join(ENDPOINT)}?path=long.wav&level=2", timeout=300)
            )
        )
        full.start()
        time.sleep(0.5)
        during = p95_of_byte_ranges(base)
        running = full.is_alive()
        full.join()

    print("PERF 139 " + json.dumps({"idle_p95_s": idle, "during_p95_s": during}))
    assert running, "the full pass ended before the byte ranges did"
    assert answer[0][0] == 200
    # The bar of ACC-WAVE-139-PLAY-FIRST; measured at a few milliseconds
    assert during <= idle + 0.1


async def test_def_wave_49_two_files_decode_one_after_the_other(
    jp_fetch, jp_root_dir, monkeypatch
):
    encode(jp_root_dir / "one.wav")
    encode(jp_root_dir / "two.wav")
    decode = routes.compute_peaks
    spans = []

    def timed(*args):
        start = time.monotonic()
        # Long enough for a second worker to start meanwhile
        time.sleep(0.5)
        result = decode(*args)
        spans.append((start, time.monotonic()))
        return result

    monkeypatch.setattr(routes, "compute_peaks", timed)
    await asyncio.gather(
        fetch_peaks(jp_fetch, "one.wav"), fetch_peaks(jp_fetch, "two.wav")
    )
    (_, first_end), (second_start, _) = sorted(spans)
    assert second_start >= first_end, "the two decodes overlapped"


async def test_def_wave_58_def_wave_66_a_started_decode_whose_request_closed_finishes_and_caches(
    jp_fetch, jp_root_dir, monkeypatch, opened, cache
):
    sparse_wav(jp_root_dir / "left.wav", 60 * 60)
    decode = routes.compute_peaks
    ends = []

    def timed(*args):
        result = decode(*args)
        # Keeps the decode running well past the request's close
        time.sleep(2)
        ends.append(time.monotonic())
        return result

    monkeypatch.setattr(routes, "compute_peaks", timed)
    # The client closes the connection when its timeout passes.
    with pytest.raises(HTTPClientError) as error:
        await fetch_peaks(jp_fetch, "left.wav", request_timeout=0.5)
    assert error.value.code == 599
    closed = time.monotonic()
    assert len(opened) == 1
    while not ends and time.monotonic() - closed < 60:
        await asyncio.sleep(0.05)
    assert ends, "the decode did not end"
    assert ends[-1] - closed > 1, "the decode stopped when its request closed"
    # The peaks were cached, so the next request answers without a decode.
    duration, peaks = parse(await fetch_peaks(jp_fetch, "left.wav"))
    assert duration == 60 * 60
    assert peaks.shape == (2, 20000)
    assert len(opened) == 1
    assert len(list(cache.glob("*"))) == 1
    assert not routes._pending


async def test_def_wave_66_a_queued_decode_whose_request_closed_never_starts(
    jp_fetch, jp_root_dir, monkeypatch, cache
):
    encode(jp_root_dir / "playing.wav")
    encode(jp_root_dir / "passed.wav")
    decode = routes.compute_peaks
    started = []

    def slow(path, *args):
        started.append(os.path.basename(path))
        # Holds the one decoder thread while the second request waits
        time.sleep(1.5)
        return decode(path, *args)

    monkeypatch.setattr(routes, "compute_peaks", slow)
    playing = asyncio.ensure_future(fetch_peaks(jp_fetch, "playing.wav"))
    await asyncio.sleep(0.2)
    with pytest.raises(HTTPClientError) as error:
        await fetch_peaks(jp_fetch, "passed.wav", request_timeout=0.5)
    assert error.value.code == 599
    await playing
    # Time for the queued decode to start, were it still queued
    await asyncio.sleep(0.5)
    assert started == ["playing.wav"], "the queued decode started"
    assert len(list(cache.glob("*"))) == 1
    assert not routes._pending


async def test_wave_118_peaks_need_the_labs_authentication(
    jp_fetch, jp_root_dir, opened
):
    encode(jp_root_dir / "private.wav")
    for authorization in ("", "token wrong"):
        # An API answers 403; a page would redirect to the login form.
        with pytest.raises(HTTPClientError) as error:
            await fetch_peaks(
                jp_fetch,
                "private.wav",
                headers={"Authorization": authorization},
                follow_redirects=False,
            )
        assert error.value.code == 403, authorization
    assert opened == []

    response = await fetch_peaks(jp_fetch, "private.wav")
    assert response.code == 200
    assert len(opened) == 1


async def test_wave_119_peaks_only_inside_the_root(
    jp_fetch, jp_root_dir, tmp_path, opened
):
    encode(jp_root_dir / "inside.wav")
    outside = tmp_path / "outside.wav"
    encode(outside)
    (jp_root_dir / "link.wav").symlink_to(outside)
    assert (await fetch_peaks(jp_fetch, "inside.wav")).code == 200
    assert len(opened) == 1

    for path in ("../outside.wav", str(outside), "link.wav"):
        with pytest.raises(HTTPClientError) as error:
            await fetch_peaks(jp_fetch, path)
        assert 400 <= error.value.code < 500, path
    with pytest.raises(HTTPClientError) as error:
        await fetch_peaks(jp_fetch, "missing.wav")
    assert error.value.code == 404
    assert len(opened) == 1


async def test_def_wave_53_a_playlist_named_as_audio_opens_no_file_outside_the_root(
    jp_fetch, jp_root_dir, tmp_path, opened
):
    outside = tmp_path / "outside.wav"
    encode(outside)
    (jp_root_dir / "link.wav").symlink_to(outside)
    playlist = "ffconcat version 1.0\nfile 'link.wav'\n"
    (jp_root_dir / "list.mp3").write_text(playlist)
    (jp_root_dir / "list.ffconcat").write_text(playlist)
    # FFmpeg opens the files of a playlist itself, out of sight of av.open, so
    # the kernel reports every open of the outside file (inotify IN_OPEN).
    libc = ctypes.CDLL(None, use_errno=True)
    watch = libc.inotify_init1(os.O_NONBLOCK)
    assert watch >= 0
    assert libc.inotify_add_watch(watch, bytes(outside), 0x20) >= 0
    codes = []
    try:
        for name in ("list.mp3", "list.ffconcat"):
            try:
                codes.append((await fetch_peaks(jp_fetch, name)).code)
            except HTTPClientError as error:
                codes.append(error.code)
        try:
            events = os.read(watch, 4096)
        except BlockingIOError:
            events = b""
    finally:
        os.close(watch)
    assert not events, "the decoder opened the file outside the root"
    assert codes == [422, 422]
    # A file with no audio extension is never opened.
    assert len(opened) == 1


async def test_def_wave_55_a_symlink_named_as_audio_gets_the_peaks_of_its_target(
    jp_fetch, jp_root_dir
):
    # The target has no extension, as in a store of content-addressed files.
    encode(jp_root_dir / "take1.mp3")
    (jp_root_dir / "take1.mp3").rename(jp_root_dir / "take1")
    (jp_root_dir / "sound.mp3").symlink_to("take1")

    response = await fetch_peaks(jp_fetch, "sound.mp3")

    assert response.code == 200
    duration, _ = parse(response)
    assert abs(duration - 2) < 0.1


async def test_a_contents_manager_without_a_local_root_answers_no_peaks(
    jp_fetch, jp_serverapp, jp_root_dir, monkeypatch, opened
):
    encode(jp_root_dir / "remote.wav")
    monkeypatch.setitem(
        jp_serverapp.web_app.settings,
        "contents_manager",
        ContentsManager(root_dir=str(jp_root_dir)),
    )
    with pytest.raises(HTTPClientError) as error:
        await fetch_peaks(jp_fetch, "remote.wav")
    assert error.value.code == 501
    assert opened == []


async def test_wave_121_a_damaged_wav_gets_an_error_status_not_peaks(
    jp_fetch, jp_root_dir
):
    intact = jp_root_dir / "intact.wav"
    encode(intact)
    data = bytearray(intact.read_bytes())
    data[:64] = bytes(64)
    (jp_root_dir / "damaged.wav").write_bytes(data)
    assert (await fetch_peaks(jp_fetch, "intact.wav")).code == 200

    with pytest.raises(HTTPClientError) as error:
        await fetch_peaks(jp_fetch, "damaged.wav")
    assert error.value.code == 422
    body = error.value.response.body.decode()
    assert "Traceback" not in body
    assert json.loads(body)["message"]


def test_wave_122_the_installed_package_enables_the_server_part(tmp_path):
    dist = metadata.distribution(NAME)
    required = {re.match(r"[\w.-]+", line).group().lower() for line in dist.requires}
    assert "av" in required
    configs = [
        file
        for file in dist.files
        if file.as_posix().endswith(f"etc/jupyter/jupyter_server_config.d/{NAME}.json")
    ]
    assert len(configs) == 1
    config = json.loads(configs[0].read_text())
    assert config["ServerApp"]["jpserver_extensions"] == {NAME: True}

    listing = subprocess.run(
        ["jupyter", "server", "extension", "list"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    # Without the colour codes FORCE_COLOR puts around "enabled" and "OK"
    output = re.sub(r"\x1b\[[0-9;]*m", "", listing.stdout + listing.stderr)
    assert re.search(rf"{NAME} enabled", output), output
    assert re.search(rf"{NAME} \S+ OK", output), output
