# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## [1.2.7] - 2026-10-31

### Changed

- Apply the template files and packages the upgrade left out

## [1.2.5] - 2026-10-30

### Changed

- Upgrade to extension template v4.6.5 and Makefile 1.46

### Fixed

- Take the scoped @stellarshenson/jupyterlab-advanced-image-viewer-extension npm name

## [1.2.3] - 2026-10-28

### Changed

- No source changes since 1.2.2; this release follows 1.2.2

## [1.2.2] - 2026-10-28

### Changed

- The README images are 3840x2160 screenshots of the whole JupyterLab window - menu bar, file browser, tab bar, viewer and status bar - in the dark theme
- The README names the audio and video viewers in the intro, documents the help dialog and the 1 s minimum loop region, and says that seeking in a file over 100 MB needs a server that serves byte ranges
- The journal lives in `.agents/JOURNAL.md` with a `.claude/JOURNAL.md` symlink, and prettier skips it

### Fixed

- The integration tests pass on a stock JupyterLab: the media-key scope test types into a text file instead of a kernel-backed notebook, the context-menu test checks duplicate labels wherever a menu opens, and the video speed test waits for Plyr to apply the rate before reading it

## [1.2.1] - 2026-10-28

### Added

- Audio viewer on wavesurfer.js 8: the waveform, an overview strip that seeks anywhere in the file, a time ruler, the time under the mouse, a drag-marked loop region, a 0.5x to 2x speed choice and zoom with - / + / Fit
- Video viewer on Plyr 3.8: play and pause, a seek bar, the current time, mute, volume, speed, picture in picture and full screen, in a player fitted to the panel with the aspect ratio kept; the icon sprite and the blank video are bundled, so no request leaves the lab host
- Media keys in a focused audio or video tab: Space plays and pauses, Left and Right seek 5 s, and Page Up and Page Down open the previous or next file of the same kind in the folder; the folder navigation setting turns this off
- A help dialog for each media viewer, and a toolbar with Reload, the playback controls and the file details
- The extension disables JupyterLab's stock audio and video viewers, so a double-click on a media file opens these viewers

### Changed

- Folder navigation is shared by the image viewer and the media viewers, so Page Up and Page Down follow the file browser order too
- Audio and video files up to 100 MB are downloaded once and played from that copy, so seeking works on a server that serves `/files/` without byte ranges; larger files play from the file URL and need the platform's byte-range fix
- Versions 1.1.9 and 1.2.0 were local builds and are not published; this release follows 1.1.8

### Fixed

- Full screen fills the screen: the player's inline size no longer overrides the fullscreen layout
- The zoom buttons are disabled when a file over 100 MB is shown without a waveform, instead of doing nothing
- The unplayed waveform reaches the 3:1 contrast ratio the accessibility guideline asks of graphical content
- An unplayable file shows a plain sentence instead of the browser's raw media error, and the message line is announced to assistive technology
- Times of an hour or more read as `h:mm:ss` instead of unbounded minutes
- A slightly moving click on the waveform no longer arms a sub-second loop; a loop region needs at least 1 s

<!-- <END NEW CHANGELOG ENTRY> -->

## [1.1.8] - 2026-10-12

### Added

- Galata integration test that fails when a label appears twice in the context menu of an image's tab or of the image. It guards against a second "Show in File Browser" item, which `jupyterlab_terminal_show_in_file_browser_extension` before its version 1.0.27 put on every tab

### Changed

- Build tooling updated to Makefile 1.45: `make install` also installs the optional dependency groups of `pyproject.toml`
- Version 1.1.7 was a local build and is not published; this release follows 1.1.6

## [1.1.6] - 2026-10-05

### Changed

- Toolbar tooltips, command labels, the help link and the help dialog's title and button go through JupyterLab's translator, so a language pack can translate them. This adds `@jupyterlab/translation` as a dependency
- Each of the six commands declares that it takes no arguments (`describedBy`)
- The lint check passes with no warnings; it reported 22 since the update to extension template 4.6.5

## [1.1.5] - 2026-10-05

### Added

- AVIF images open in the image viewer, with pan, zoom, the toolbar, folder navigation, Copy to Clipboard and the stock rotate and flip keys. JupyterLab defines no `avif` file type, so a double-click on an `.avif` file ended in a File Load Error
- Galata integration test that opens an AVIF file by double-click, and the mixed-folder navigation test now steps onto an AVIF file

## [1.1.4] - 2026-09-30

### Added

- Galata integration tests for every acceptance criterion that can run in CI, 30 specs in all
- The Galata suite runs locally on the port set in `JUPYTER_TEST_PORT`, with its own settings folder, so it does not collide with a running JupyterLab

### Fixed

- The stock keys and Left/Right keep working after a click on a toolbar button (+, -, Fit, refresh) or on the image; before, the click left keyboard focus on the button
- Left and Right find an image added to the folder while the file browser sidebar is collapsed
- Left and Right no longer redraw the whole file browser listing on every step, which slowed each step in large folders

## [1.1.3] - 2026-09-30

### Added

- Galata integration test that reverses the file browser's name sort and checks that Right opens the image the file browser lists next

### Changed

- Updated to JupyterLab extension template 4.6.5: the extension builds with `@jupyter/builder` (Rspack) instead of the webpack-based builder, and lints with ESLint 9
- Requires JupyterLab 4.6 or later. Dependency floors are raised to the tested versions, and every CI job runs on Python 3.13

### Fixed

- Left and Right now step through the images in the order the file browser lists them. Under a sort plugin such as a C-locale sort, which lists `.` before `_`, the viewer used its own order and skipped a file the file browser showed between two others
- The CI build no longer fails on the template's endpoint-authentication check, which loads a server extension this package does not have

## [1.1.2] - 2026-09-23

### Changed

- Acceptance criteria for dragging at any zoom and for zoom, pan and Fit after a stock rotate are verified in a browser against 1.1.1 and recorded as met

## [1.1.1] - 2026-09-23

### Added

- WebP images open in the image viewer, with pan, zoom, the toolbar, folder navigation and the stock rotate and flip keys. JupyterLab defines a `webp` file type but binds no image viewer to it, so a `.webp` opened in the text editor and failed with "not UTF-8 encoded"
- Galata integration test that opens a WebP from the file browser and checks it decodes in the viewer

## [1.1.0] - 2026-09-02

### Added

- Galata integration tests covering the pan bound in every regime: smaller than the viewport, larger than it, after a zoom-out, and after a stock rotate

### Changed

- Panning is now bounded. An image smaller than the viewport drags flush to a border and no further, a larger one always keeps covering it, and the bound re-applies whenever the legal range shrinks - zooming out, resizing the panel, reloading the image, or rotating it with the stock keys. This replaces the unbounded canvas-style sliding introduced in 1.0.7

### Fixed

- Stock rotate and flip pivoted from the centre of the image instead of its top left. Wrapping the image in the pan layer stopped JupyterLab's own `.jp-ImageViewer > img` rule from matching, so the `transform-origin` it sets was silently lost; it is now restated on the wrapped image

## [1.0.11] - 2026-08-11

### Added

- Refresh button on the image viewer toolbar that reloads the image from disk, matching the control the HTML viewer provides

## [1.0.9] - 2026-07-03

### Added

- "Copy to Clipboard" context-menu item for raster images (PNG/JPG/GIF/BMP/WEBP) that copies the image to the system clipboard as PNG; hidden for SVG, which already has "Copy as PNG"

## [1.0.7] - 2026-06-16

### Changed

- Panning is now always available (canvas-style): the grab/hand cursor shows at any zoom and dragging moves the image even at fit, with no snap-back; the Fit control recenters
