# DEF-MEDIA-7-SEEK - Media cannot seek because /files/ ignores byte ranges

On GalaxaLab the browser cannot move playback in an audio or video file that JupyterLab serves. The platform configuration replaces JupyterLab's file handler with one that does not answer byte-range requests. A change of that handler's base class restores seeking. The fix belongs to the `galaxalab` repository, not to this extension.

## Cause

- `galaxalab/services/galaxalab/conf/etc/jupyter/jupyter_lab_config.py` lines 86-87 set `c.ContentsManager.files_handler_class = DownloadableFilesHandler`. The running container reads the installed copy `/galaxalab/etc/jupyter/jupyter_lab_config.py` (lines 116-117), which `/opt/conda/etc/jupyter/jupyter_lab_config.py` links to
- `DownloadableFilesHandler` in `galaxalab/services/galaxalab/conf/etc/jupyter/files_handler.py` subclasses `jupyter_server.files.handlers.FilesHandler`. It was added for galaxalab DEF-23, to add `allow-downloads` to the sandbox of `/files/` documents
- `FilesHandler.get` reads the whole file through the contents manager and writes it in one response. It ignores the `Range` request header, and it sends no `Accept-Ranges` and no `Content-Length`
- Chrome seeks in a media file only with byte ranges. Without them, MP3, FLAC, M4A, MP4 and WebM report a seekable range of 0 to 0, so every seek returns to the start. WAV and OGG report the duration as Infinity, so a click on the seek bar lands at the wrong time
- JupyterLab's default `/files/` handler for a file system contents manager is `jupyter_server.base.handlers.AuthenticatedFileHandler`, a tornado `StaticFileHandler`. It answers byte ranges
- The stock audio and video viewers set the media element's source to the `/files/` URL, so they inherit the failure

## Evidence

Two isolated servers loaded the platform configuration and served the same 60 s files. The server on port 8899 used the platform handler. The server on port 8898 only added `--ContentsManager.files_handler_class=jupyter_server.base.handlers.AuthenticatedFileHandler`. Port 8888 was not used. An independent agent repeated the HTTP check and got the same result.

HTTP check, `curl` with the header `Range: bytes=1000-1999`, for all seven files:

| Handler | Status | Accept-Ranges | Content-Range | Content-Length |
| --- | --- | --- | --- | --- |
| `DownloadableFilesHandler` (platform) | 200, chunked, the whole file | none | none | none |
| `AuthenticatedFileHandler` (JupyterLab default) | 206 | bytes | bytes 1000-1999/size | 1000 |

Browser check in the stock viewers, Playwright 1.64.1 with Chromium build 1248: `currentTime = 30`, then read back, and a click at 50% of the seek bar:

| Format | Platform handler | JupyterLab default handler |
| --- | --- | --- |
| MP3, FLAC, M4A | seekable 0 to 0; the seek returns to 0 s | seekable 0 to 60; the seek reaches 30 s |
| WAV, OGG | duration Infinity; the click lands at 14.5 s | duration 60; the click lands at 28.3 s |
| MP4, WebM | seekable 0 to 0; the seek returns to 0 s | seekable 0 to 60; the seek reaches 30 s |

The same bytes, loaded as a blob URL from the platform handler, seek correctly in all seven formats.

## Proposed fix

Change the base class in `galaxalab/services/galaxalab/conf/etc/jupyter/files_handler.py`, and the module docstring sentence that names `FilesHandler`:

```python
from jupyter_server.base.handlers import AuthenticatedFileHandler


class DownloadableFilesHandler(AuthenticatedFileHandler):
    """/files/ handler whose CSP sandbox carries the allow-downloads grant."""

    @property
    def content_security_policy(self):
        return super().content_security_policy + " allow-downloads"
```

`AuthenticatedFileHandler` keeps what DEF-23 relies on. I checked this in the jupyter_server 2.21.1 source:

- Its CSP ends with `; sandbox allow-scripts`, the same as `FilesHandler`, so the appended ` allow-downloads` still lands inside the sandbox directive
- `get` and `head` carry `@web.authenticated`, `@authorized` and the XSRF check
- It refuses hidden files unless `ContentsManager.allow_hidden` is set
- It sets the attachment header for `?download=1`

Differences to know:

- It reads files from the contents manager's root directory on disk, so it works only with a file system contents manager. The platform uses the default `AsyncLargeFileManager`, which is one
- It streams the file from disk instead of loading it whole into memory, so large downloads also use less server memory

## Check after the change

- `curl -H 'Range: bytes=1000-1999'` on a `/files/` URL returns 206 with a `Content-Range` header
- An MP3 in the audio viewer and an MP4 in the video viewer move playback to the clicked time
- A download link inside an HTML file opened from `/files/` still downloads (galaxalab DEF-23)

The change takes effect after the next GalaxaLab image rebuild. The running container reads the installed copy in `/galaxalab/etc/jupyter/`, which belongs to root.

## Effect on this extension's media viewers

- The audio viewer loads a file of up to 100 MB as a blob to draw the waveform, so it seeks on any server, with or without this fix
- The video viewer, and the audio viewer for files over 100 MB, play from the `/files/` URL, so they seek only after this fix
