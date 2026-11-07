"""ACC-WAVE-115 to ACC-WAVE-119, ACC-WAVE-121 and ACC-WAVE-122: the waveform endpoint.

The server runs in the test process (pytest-jupyter) on a free port with its
own temporary root and peaks cache. A decode is counted by wrapping av.open,
which the endpoint calls once per decode; the tests write their audio through
`_open`, the unwrapped function, so writing is not counted.
"""
import asyncio
import ctypes
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
    container_format, codec = FORMATS[path.suffix[1:]]
    t = np.arange(round((tone + silence) * RATE)) / RATE
    wave = np.where(t < tone, 0.5 * np.sin(2 * np.pi * 440 * t), 0)
    frame = av.AudioFrame.from_ndarray(
        np.vstack([wave] * av.AudioLayout(layout).nb_channels).astype(np.float32),
        format="fltp",
        layout=layout,
    )
    frame.sample_rate = RATE
    with _open(str(path), "w", format=container_format) as container:
        stream = container.add_stream(
            codec, rate=RATE, layout=layout, options={"strict": "experimental"}
        )
        for packet in [*stream.encode(frame), *stream.encode(None)]:
            container.mux(packet)


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


async def fetch_peaks(jp_fetch, path, **kwargs):
    return await jp_fetch(*ENDPOINT, params={"path": path}, **kwargs)


def parse(response):
    """Duration in seconds and the peaks as a channels x points array."""
    duration = float(response.headers["X-Waveform-Duration"])
    channels = int(response.headers["X-Waveform-Channels"])
    peaks = np.frombuffer(response.body, np.uint8).reshape(channels, -1)
    return duration, peaks


@pytest.fixture(autouse=True)
def cache(monkeypatch, tmp_path):
    """The folder of the peaks cache, empty for each test."""
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    return tmp_path / "cache" / NAME


def second_server_answer(root, path):
    """Status and body of a peaks request to a second server process."""
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
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/{'/'.join(ENDPOINT)}?path={path}",
        headers={"Authorization": "token second"},
    )
    try:
        for _ in range(300):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return response.status, response.read()
            except urllib.error.HTTPError as error:
                return error.code, error.read()
            except urllib.error.URLError:
                time.sleep(0.1)
        raise TimeoutError("the second server did not start in 30 s")
    finally:
        server.terminate()
        server.wait(10)


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
    assert peaks.shape == (2, 20 * 60 * 1000)
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


async def test_def_wave_57_the_answer_names_the_channels_of_the_file(
    jp_fetch, jp_root_dir
):
    encode(jp_root_dir / "quad.wav", layout="quad")
    # The second answer comes from the disk cache.
    for _ in range(2):
        response = await fetch_peaks(jp_fetch, "quad.wav")
        # Peaks of two channels, as wavesurfer draws two; the file has four.
        assert parse(response)[1].shape[0] == 2
        source = response.headers.get("X-Waveform-Source-Channels")
        assert source == "4"


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
    # 60 min of silence: about 5 s to decode in full.
    sparse_wav(jp_root_dir / "left.wav", 60 * 60)
    decode = routes.compute_peaks
    ends = []

    def timed(*args):
        result = decode(*args)
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
    assert peaks.shape == (2, 60 * 60 * 1000)
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
