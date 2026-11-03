"""ACC-MESH-109-PERF-SERVE: the server streams a large mesh with Range support.

The repository has no server extension, so the test starts a real
jupyter_server, as the criterion's test hint says. Three pieces of the
workstation image's configuration need countering on the command line: its
jupyter_lab_config.py pins the files handler path to $HOME/workspace, its
handler refuses an unauthenticated GET without a Referer as cross-origin, and
its server runtime directory must not be shared with the live lab. The port is
a free one, never 8888.
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

GIB = 1024**3
RSS_BUDGET = 200 * 1024**2
SAMPLE_SECONDS = 0.05


def free_port() -> int:
    while True:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        if port != 8888:
            return port


def rss_bytes(pid: int) -> int:
    with open(f"/proc/{pid}/status") as status:
        for line in status:
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    raise RuntimeError(f"no VmRSS for pid {pid}")


def wait_up(base: str, timeout: float) -> None:
    referer = urllib.request.Request(
        f"{base}/lab", headers={"Referer": f"{base}/lab"}
    )
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(referer, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"the server did not answer {base}/lab within {timeout} s")


@pytest.fixture
def server(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    scratch = tmp_path / "server"
    env = dict(os.environ)
    env.update(
        HOME=str(scratch / "home"),
        JUPYTER_CONFIG_DIR=str(scratch / "config"),
        JUPYTER_DATA_DIR=str(scratch / "data"),
        JUPYTER_RUNTIME_DIR=str(scratch / "runtime"),
    )
    port = free_port()
    log = open(tmp_path / "server.log", "wb")
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "jupyter_server",
            "--no-browser",
            "--ServerApp.ip=127.0.0.1",
            f"--ServerApp.port={port}",
            "--ServerApp.port_retries=0",
            "--ServerApp.token=",
            "--ServerApp.password=",
            "--ServerApp.open_browser=False",
            f"--ServerApp.root_dir={root}",
            # The image pins files_handler_params to $HOME/workspace; the
            # command line wins. The handler still follows a symlink only into
            # the root.
            "--ContentsManager.files_handler_params="
            + json.dumps(
                {
                    "path": str(root),
                    "allowed_symlink_directory": [str(root)],
                }
            ),
        ],
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        wait_up(base, 120)
        yield base, root, process.pid
    finally:
        process.terminate()
        try:
            process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            process.kill()
        log.close()


def test_a_range_request_returns_206_and_the_exact_bytes(server):
    base, root, _ = server
    payload = bytes(range(256)) * 16
    (root / "pattern.stl").write_bytes(payload)
    referer = {"Referer": f"{base}/lab"}
    request = urllib.request.Request(
        f"{base}/files/pattern.stl",
        headers={**referer, "Range": "bytes=1000-1999"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
        headers = {
            "status": response.status,
            "content_range": response.headers["Content-Range"],
            "content_length": response.headers["Content-Length"],
            "accept_ranges": response.headers["Accept-Ranges"],
        }
        assert response.status == 206
        assert headers["content_range"] == "bytes 1000-1999/4096"
        assert headers["content_length"] == "1000"
        assert headers["accept_ranges"] == "bytes"
        assert body == payload[1000:2000]

    beyond = urllib.request.Request(
        f"{base}/files/pattern.stl",
        headers={**referer, "Range": "bytes=4096-"},
    )
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(beyond, timeout=60)
    assert error.value.code == 416
    print(
        "PERF 109 range "
        + json.dumps(
            {
                **headers,
                "body_bytes": len(body),
                "matches_file": body == payload[1000:2000],
                "unsatisfiable": error.value.code,
            }
        )
    )


def test_a_full_gibibyte_download_grows_the_resident_size_by_under_200_mb(
    server, tmp_path
):
    base, root, pid = server
    large = root / "large.stl"
    with open(large, "wb") as handle:
        handle.truncate(GIB)
    referer = {"Referer": f"{base}/lab"}

    # Warm the lazy imports and the handler before the baseline is read.
    warm = urllib.request.Request(
        f"{base}/files/large.stl", headers={**referer, "Range": "bytes=0-1023"}
    )
    with urllib.request.urlopen(warm, timeout=60) as response:
        response.read()
    baseline = rss_bytes(pid)

    peak = baseline
    done = threading.Event()

    def sample() -> None:
        nonlocal peak
        while not done.is_set():
            peak = max(peak, rss_bytes(pid))
            time.sleep(SAMPLE_SECONDS)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    try:
        request = urllib.request.Request(
            f"{base}/files/large.stl", headers=referer
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            downloaded = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                downloaded += len(chunk)
    finally:
        done.set()
        sampler.join()

    assert downloaded == GIB
    print(
        "PERF 109 download "
        + json.dumps(
            {
                "bytes": downloaded,
                "baseline_rss_bytes": baseline,
                "peak_rss_bytes": peak,
                "growth_bytes": peak - baseline,
            }
        )
    )
    assert peak - baseline <= RSS_BUDGET, (
        f"the server grew by {peak - baseline} bytes while serving {downloaded}"
    )
