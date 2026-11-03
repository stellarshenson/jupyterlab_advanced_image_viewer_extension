# Defects - jupyterlab_advanced_image_viewer_extension

Observed wrong behaviour of the advanced image viewer, with the trail of what was tried against
each one. Written only through `pm-tools`; the acceptance criteria live in `acc-crit.md` beside
this file.

## Authors
- `@kj` Konrad Jelen

## Folder navigation `NAV`

Left and Right arrow keys stepping through the images of a folder

- [x] `DEF-NAV-1` **Arrow keys skip a file the file browser lists between two others** - MEDIUM; Right from `01-two-repeating-loops-beautified.svg` opens `01-two-repeating-loops.svg`, skipping `01-two-repeating-loops-beautified_print.svg` listed between them; fix: step through the file browser's own sorted list; `src/index.ts` navigate()
  - evidence: 2026-09-30 isolated JupyterLab 4.6.4 with jupyterlab_file_browser_sorting_extension: from 01-two-repeating-loops-beautified.svg, Right, Right, Left, Left visit beautified_print, loops, beautified_print, beautified in the listed order; with the name sort reversed, Right from aiv-nav-2.svg opens aiv-nav-1.svg; Galata spec 'arrow keys follow the order the file browser shows' added; jest 15/15, lint:check exit 0
  - related: ACC-NAV-21 - the arrow-key criterion this breaks
  - repro: folder with a.svg, a_x.svg, b.svg under the C-locale sort plugin; open a.svg, press Right
  - test-tags: E2E
  - root-cause: 2026-09-30T12:07:40Z @kj navigate() re-sorts the folder with localeCompare, which puts _ before .; jupyterlab_file_browser_sorting_extension sorts by code point (LC_COLLATE=C, on by default), which puts . before _
  - log: 2026-09-30T12:07:40Z @kj added
  - log: 2026-09-30T12:07:40Z @kj reported: in .images_stackrails_engineering_deck_16x9 the viewer switches between beautified.svg and loops.svg and ignores beautified_print.svg in between
  - log: 2026-09-30T12:11:28Z @kj closed: fixed: navigate() steps through the file browser's sorted list when it shows the folder, natural order otherwise
  - log: 2026-09-30T13:21:22Z @kj CI: Galata spec 'arrow keys follow the order the file browser shows' passed in Build run 36720399337 on c20ff79 (9 passed)
- [x] `DEF-NAV-4` **Arrow keys use a stale list while the file browser is hidden** - MINOR; with the file browser sidebar collapsed, Left/Right skip images added to the folder after the collapse and still step onto images removed since; cause: DirListing re-sorts only while visible and marks itself dirty otherwise; `src/index.ts` navigate()
  - evidence: 2026-09-30: navigate() re-sorts the listing before reading sortedItems(); Galata 'Right finds an image added while the file browser is hidden' passes, red with the re-sort removed once jupyterlab_file_browser_sorting_extension is disabled (it re-sorts hidden listings itself); Galata 30/30 local with and without that plugin
  - related: DEF-NAV-1 - introduced by its fix
  - repro: open an image, collapse the left sidebar, add an image to the folder from a terminal, press Right
  - test-tags: E2E
  - root-cause: 2026-09-30T12:40:15Z @kj listing.js re-sorts on model refresh only when isVisible, else sets _isDirty until onAfterShow; navigate() reads sortedItems() without checking
  - log: 2026-09-30T12:40:15Z @kj added
  - log: 2026-09-30T12:40:20Z @kj reported: review round 1 (wf_7ce58b06-5d1), deferred as MINOR - every fix adds surface to navigation; HEAD before b3e493e read the folder fresh on each key press
  - log: 2026-09-30T13:09:29Z @kj variant, review round 4 (wf_528ef1ee-5c3): with the sidebar visible, an image deleted outside the page stays listed until the next poll; Right is a no-op with a 404 console error for about 5.6 s, then continues
  - log: 2026-09-30T14:19:47Z @kj closed: fixed: navigate() awaits fileBrowser.model.refresh() and re-sorts the listing before reading sortedItems()
  - log: 2026-09-30T15:17:37Z @kj edited evidence "2026-09-30: Galata 'Right finds an image added while the file browser is hidden' passes and goes red with the refresh and sort removed; Galata 27/27 local" -> "2026-09-30: navigate() re-sorts the listing before reading sortedItems(); Galata 'Right finds an image added while the file browser is hidden' passes, red with the re-sort removed once jupyterlab_file_browser_sorting_extension is disabled (it re-sorts hidden listings itself); Galata 30/30 local with and without that plugin"
  - log: 2026-09-30T15:17:37Z @kj review round 1 (wf_2873d2c8-b81): the model.refresh() before the re-sort is removed, it reloaded the folder on every key press; deferred: for up to one poll (10 s) after an outside add or delete, Left/Right follow the file browser's own list, and Right onto a deleted image is a no-op with a 404; reason: records the deferred poll-window variant and why the refresh was removed
- [x] `DEF-NAV-5` **Left/Right slow in large folders with the file browser open** - MINOR; with the file browser showing the image's folder, each Left/Right step re-sorts and re-renders the whole listing: +140-160 ms per step in a 3000-image folder; `src/index.ts` navigate()
  - evidence: 2026-09-30: navigate() re-sorts only when !listing.isVisible; reviewer's 3000-image timing spec: visible step median 327-364 ms vs 338-344 ms with sort disabled (was 438-485 vs 317-323); DEF-NAV-4 spec red with the condition inverted (sort plugin disabled); Galata 30/30 local, both configs
  - related: DEF-NAV-4 - introduced by its fix
  - repro: open an image in a 3000-image folder with the file browser showing that folder, time each Right
  - test-tags: E2E, MANUAL
  - root-cause: 2026-09-30T16:11:32Z @kj navigate() called DirListing.sort() on every step; sort() re-renders every row and saves state, and is needed only while the listing is hidden, because a visible listing re-sorts itself on each refresh
  - log: 2026-09-30T16:11:32Z @kj added
  - log: 2026-09-30T16:11:38Z @kj reported: review round 3 (wf_b387b1a1-a98), measured with a 3000-image timing spec
  - log: 2026-09-30T16:11:38Z @kj closed: fixed: navigate() re-sorts only a hidden listing

## Keyboard `KEYS`

Keyboard focus and key handling in the image viewer

- [x] `DEF-KEYS-2` **Keys stop working after a toolbar click** - MAJOR; after clicking a toolbar button (+, -, Fit, refresh) the stock keys and Left/Right do nothing, and clicking the image does not restore them; causes: each ToolbarButton focuses itself on click, and ViewerController.onDown calls preventDefault() on mousedown, which also stops the click from focusing the viewer; `src/index.ts`, `src/controller.ts`
  - evidence: 2026-09-30: Galata 'the keys keep working after a toolbar click' presses ] and [ after +, -, Fit and refresh, red with noFocusOnClick removed from +; jest 'takes keyboard focus from a toolbar button when the image is pressed' red without the focus call; jest 16/16, Galata 30/30 local
  - root-cause: 2026-09-30T15:17:37Z @kj a ToolbarButton without noFocusOnClick calls event.target.focus() on every click (ui-components toolbar.js:692-716), so focus moves to the button; ViewerController.onDown preventDefault() also cancels the focus a click on the image gives
  - root-cause: 2026-09-30T14:19:47Z @kj ViewerController.onDown calls preventDefault() on mousedown to stop the native image drag, which also cancels the focus change a click makes, so focus stays on the last toolbar button
  - related: ACC-STOCK-34 - stock keybindings work
  - repro: open an image, click Fit, press ]
  - test-tags: E2E
  - log: 2026-09-30T12:07:40Z @kj added
  - log: 2026-09-30T12:07:40Z @kj reported: found 2026-09-23 while verifying ACC-STOCK-35; after a Fit click document.activeElement stays the toolbar button and ] does not rotate
  - log: 2026-09-30T14:19:47Z @kj closed: fixed: onDown focuses the viewer after preventDefault
  - log: 2026-09-30T15:17:37Z @kj amended text "after clicking a toolbar button (+, -, Fit, refresh), clicking the image leaves focus on the button, so the stock keys and Left/Right do nothing; cause: ViewerController.onDown calls preventDefault() on mousedown, which also stops the click from focusing the viewer; `src/controller.ts`" -> "MAJOR; after clicking a toolbar button (+, -, Fit, refresh) the stock keys and Left/Right do nothing, and clicking the image does not restore them; causes: each ToolbarButton focuses itself on click, and ViewerController.onDown calls preventDefault() on mousedown, which also stops the click from focusing the viewer; `src/index.ts`, `src/controller.ts`"; reason: review round 1 (wf_2873d2c8-b81) found the button itself takes focus
  - log: 2026-09-30T15:17:37Z @kj root-cause overridden; reason: second cause found in review round 1 (wf_2873d2c8-b81)
  - log: 2026-09-30T15:17:37Z @kj edited repro "open an image, click Fit, click the image, press ]" -> "open an image, click Fit, press ]"; evidence "2026-09-30: jest 'takes keyboard focus from a toolbar button when the image is pressed' and Galata 'the keys keep working after a toolbar click' pass; both go red with the focus call removed; jest 16/16, Galata 27/27 local" -> "2026-09-30: Galata 'the keys keep working after a toolbar click' presses ] and [ after +, -, Fit and refresh, red with noFocusOnClick removed from +; jest 'takes keyboard focus from a toolbar button when the image is pressed' red without the focus call; jest 16/16, Galata 30/30 local"
  - log: 2026-09-30T15:17:37Z @kj fixed again: the four toolbar buttons take noFocusOnClick; onDown keeps focusing the viewer

## Build and CI `BUILD`

Packaging, the Makefile and the GitHub Actions workflows

- [x] `DEF-BUILD-3` **CI build fails at the endpoint-auth check** - MAJOR; Build job fails at 'Check that all endpoints are authenticated', so Integration tests and test_isolated are skipped; the package has no server extension; fix: remove the step and .github/scripts/check_auth.py; `.github/workflows/build.yml`
  - evidence: CI on c20ff79: Build run 36720399337 green (build, test_isolated, Integration tests 9 passed in 26.1s, Check Links); Check Release run 36720399214 green
  - repro: push to main; Build run 36713954661, job build, step 'Check that all endpoints are authenticated'
  - test-tags: INTEGRATION
  - root-cause: 2026-09-30T12:23:19Z @kj template 4.6.5 (kind frontend-and-server) added check_auth.py, which loads the package as a server extension with reraise_server_extension_failures=True; __init__.py has no _load_jupyter_server_extension, so jupyter_server raises ExtensionLoadingError
  - log: 2026-09-30T12:23:19Z @kj added
  - log: 2026-09-30T12:23:19Z @kj reported: CI red on b3e493e; error '_load_jupyter_server_extension function was not found'
  - log: 2026-09-30T13:21:21Z @kj closed: fixed in c20ff79: check_auth step and script removed, template answer kind: frontend

## Context menu `MENU`

Items in the tab context menu and the image context menu

- [x] `DEF-MENU-6` **Two Show in File Browser items on the tab menu** - CRITICAL; with a terminal open, the image tab's context menu shows two enabled items labelled `Show in File Browser`; upper moves the file browser to the last-focused terminal's working directory, lower to the image; only one item with that label may exist; fix belongs in `jupyterlab_terminal_show_in_file_browser_extension`
  - evidence: spec `no context menu item appears twice on an image` red against terminal extension 1.0.26 as released, green against its rebuilt build; Galata 32/32 here and 4/4 in the terminal extension, port 8899, 2026-10-12
  - repro: open a terminal, open an image, right-click the image's tab: two `Show in File Browser` items
  - test-tags: E2E
  - root-cause: 2026-10-12T03:25:51Z @kj `jupyterlab_terminal_show_in_file_browser_extension` `schema/plugin.json` adds `terminal:show-in-file-browser` on selector `#jp-main-dock-panel .lm-DockPanel-tabBar .lm-TabBar-tab`, which matches every main-area tab; enabled whenever a terminal exists; same label as stock `docmanager:show-in-file-browser`
  - log: 2026-10-12T03:25:51Z @kj added
  - log: 2026-10-12T03:26:05Z @kj reported: "must be only one item with such name - critical defect"; "first one behaves bad", second one not checked; severity set by the reporter
  - log: 2026-10-12T03:26:05Z @kj measured on an isolated server, port 8899, one terminal open: upper item `terminal:show-in-file-browser` moved the file browser to the server root 3 of 3 clicks; lower item `docmanager:show-in-file-browser` moved it to the image 3 of 3 clicks; no single item alternated
  - log: 2026-10-12T03:44:01Z @kj closed: fixed: terminal extension shows its item only when the context menu was opened on a terminal's tab or inside a terminal (`isVisible` in its `src/index.ts`); uncommitted in both repositories, terminal extension release pending
  - log: 2026-10-12T04:31:18Z @kj terminal extension 1.0.27 released to npm and PyPI with the fix; its CI green on 5fa71b8 with 4 Galata tests

## Media viewers `MEDIA`

Audio and video playback in JupyterLab

- log: 2026-10-28T14:06:54Z @kj category created

- [x] `DEF-MEDIA-7-SEEK` **Stock audio viewer cannot seek** - MAJOR; owner: "sound doesn't allow to scroll the audio file"; stock Audio Viewer and Video Viewer seek bar fails: MP3, FLAC, M4A, MP4, WebM return to 0 s, WAV and OGG show no duration; fix: /files/ served with byte ranges, or the player given a blob URL; `/galaxalab/etc/jupyter/files_handler.py`
  - evidence: platform fix: /galaxalab/etc/jupyter/files_handler.py DownloadableFilesHandler now subclasses AuthenticatedFileHandler; measured 2026-11-03 on an isolated server, port 8899: Range: bytes=1000-1999 on /files/ answered 206 Partial Content with Content-Range for 7 of 7 media files; files up to 100 MB also play from a downloaded blob
  - attachment: defects/DEF-MEDIA-7-SEEK-files-range.md sha256:12c126e6926c7b7c edited:2026-11-02T17:27:13Z
  - repro: open a 60 s MP3 in the stock Audio Viewer on a server with the GalaxaLab config, set currentTime = 30 or click the middle of the seek bar; currentTime stays 0
  - test-tags: E2E
  - root-cause: 2026-10-28T14:06:54Z @kj GalaxaLab config sets c.ContentsManager.files_handler_class = DownloadableFilesHandler, a jupyter_server FilesHandler subclass, not AuthenticatedFileHandler; FilesHandler ignores Range, sends 200 chunked, no Accept-Ranges, no Content-Length; Chrome: MP3, FLAC, M4A, MP4, WebM seekable [0,0], seek returns to 0; WAV, OGG duration Infinity, a seek bar click lands at the wrong time
  - log: 2026-10-28T14:06:54Z @kj added
  - log: 2026-10-28T14:20:01Z @kj attached defects/DEF-MEDIA-7-SEEK-files-range.md sha256:dd52194dfb6de9a6
  - log: 2026-10-28T14:20:04Z @kj handed to the owner: fix is the DownloadableFilesHandler base class in the galaxalab repository, see the attached document
  - log: 2026-10-28T17:19:22Z @kj closed
  - log: 2026-11-02T17:27:09Z @kj platform fix proved: /galaxalab/etc/jupyter/files_handler.py now subclasses AuthenticatedFileHandler; on an isolated server on port 8899, with Range: bytes=1000-1999, all 7 files answered 206 with the right Content-Range and a Content-Security-Policy ending allow-downloads
  - log: 2026-11-02T17:27:25Z @kj refreshed attachment defects/DEF-MEDIA-7-SEEK-files-range.md sha256:dd52194dfb6de9a6 -> sha256:12c126e6926c7b7c
  - log: 2026-11-03T10:12:42Z @kj edited evidence "platform fix owned by galaxalab (DownloadableFilesHandler sends 200 without byte ranges); this extension plays every file up to 100 MB from a downloaded blob, which seeks on that server, and files over 100 MB play from the URL and need the platform fix" -> "platform fix: /galaxalab/etc/jupyter/files_handler.py DownloadableFilesHandler now subclasses AuthenticatedFileHandler; measured 2026-11-03 on an isolated server, port 8899: Range: bytes=1000-1999 on /files/ answered 206 Partial Content with Content-Range for 7 of 7 media files; files up to 100 MB also play from a downloaded blob"
- [x] `DEF-MEDIA-8-MEDIA` **Fullscreen keeps the panel-sized player** - MAJOR; Clicking Fullscreen on a video keeps the player at the panel-fit size on a black screen instead of filling the screen; the help dialog and the README promise a full screen
  - evidence: ACC-VIDEO-56-PLAYER asserts the .plyr container covers the viewport after the Fullscreen click and the fitted size returns on Escape, native fullscreen path, Galata 75/75
  - repro: open a video in a panel smaller than the screen and click the Plyr Fullscreen control; the player box keeps its pixel size instead of matching the viewport
  - test-tags: E2E
  - root-cause: 2026-10-28T16:40:40Z @kj fitVideo writes inline width and height in px on the Plyr container (src/video.ts L114-L117); inline values beat Plyr's stylesheet rule .plyr:fullscreen{width:100%;height:100%}
  - log: 2026-10-28T16:40:40Z @kj added
  - log: 2026-10-28T17:48:43Z @kj closed
- [x] `DEF-MEDIA-9-MEDIA` **Audio zoom buttons do nothing above 100 MB** - MEDIUM; For an audio file over 100 MB the minus, plus and Fit buttons stay enabled and do nothing, because the waveform is skipped and there is nothing to zoom
  - evidence: ACC-AUDIO-54-LARGE asserts the zoom buttons are disabled when the waveform is skipped, ACC-AUDIO-48-ZOOM asserts they are enabled otherwise, Galata 75/75
  - repro: open an audio file whose model size is over 100 MB, then click minus, plus or Fit; the view does not change and no message explains why
  - test-tags: E2E
  - root-cause: 2026-10-28T16:40:40Z @kj the over-limit branch of AudioViewer.load destroys the wavesurfer player and shows native controls; zoomBy returns when getDecodedData is null, while the shared addZoomButtons leaves the buttons enabled
  - log: 2026-10-28T16:40:40Z @kj added
  - log: 2026-10-28T17:48:43Z @kj closed
- [x] `DEF-MEDIA-10-MEDIA` **Unplayed waveform is 2.68:1 in the light theme** - MEDIUM; The unplayed part of the waveform renders at 2.68:1 against the white panel, below the 3:1 WCAG 1.4.11 asks of graphical content
  - evidence: ACC-AUDIO-45-WAVE computes the unplayed waveform contrast against the panel and asserts at least 3:1, Galata 75/75
  - repro: open an audio file in the light theme and read the wave colour: --jp-ui-font-color3 resolves to rgba(0,0,0,.38) on white, 2.68:1
  - test-tags: E2E
  - root-cause: 2026-10-28T16:40:41Z @kj the waveform colour comes from --jp-ui-font-color3 in AudioViewer.colours(); that token is a muted text colour, not a 3:1 graphics colour
  - log: 2026-10-28T16:40:41Z @kj added
  - log: 2026-10-28T17:48:43Z @kj closed
- [x] `DEF-MEDIA-11-MEDIA` **Unplayable file shows the browser's raw MediaError text** - MINOR; An unreadable media file shows the browser's raw MediaError message instead of a plain sentence; the message line is announced as of round 2 (role=status), so only the wording remains
  - evidence: ACC-AUDIO-55-ERROR asserts the plain sentence and no browser jargon, Galata 75/75
  - repro: open a file whose decode fails; the line reads e.g. 'Failed to load because no supported source was found' and nothing is announced
  - test-tags: E2E
  - root-cause: 2026-10-28T17:14:16Z @kj round 2 added role=status to the message element, so the line is now announced; the remaining cause is that the error listener interpolates media.error.message instead of a plain sentence
  - root-cause: 2026-10-28T16:41:01Z @kj the error listener interpolates media.error.message into the message element (src/media.ts L41-L48); the element carries no role or aria-live
  - log: 2026-10-28T16:41:01Z @kj added
  - log: 2026-10-28T17:14:16Z @kj edited title "Unplayable file shows raw MediaError text, never announced" -> "Unplayable file shows the browser's raw MediaError text"; text "An unreadable media file shows the browser's raw MediaError message, and the message line has no role or aria-live, so a screen reader is told nothing" -> "An unreadable media file shows the browser's raw MediaError message instead of a plain sentence; the message line is announced as of round 2 (role=status), so only the wording remains"; reason: the role=status attribute added in review round 2 closes the announced half; the raw MediaError text remains
  - log: 2026-10-28T17:48:43Z @kj closed
- [x] `DEF-MEDIA-12-MEDIA` **Times over an hour print as unbounded minutes** - MINOR; A 104 minute file prints 104:00 instead of 1:44:00 in the details, the status line, the ruler and the loop label
  - evidence: Jest 28/28, case 'uses hours for a total of an hour or more' pins 1:44:00.0 and 1:00:00
  - repro: open an audio file longer than 60 minutes and read the details line or the ruler; the minutes run past 59
  - test-tags: UNIT
  - root-cause: 2026-10-28T16:41:01Z @kj formatTime in src/mediautil.ts has no hours branch; it prints mm:ss with the minutes unbounded
  - log: 2026-10-28T16:41:01Z @kj added
  - log: 2026-10-28T17:48:43Z @kj closed
- [x] `DEF-MEDIA-13-MEDIA` **A slight drag arms a sub-second loop** - MINOR; A click on the waveform that moves three pixels or more creates a sub-second region and turns Loop on, so the click does not seek where it landed
  - evidence: ACC-AUDIO-50-LOOP asserts a 4 px jitter drag creates no region and Loop stays off while the deliberate 10 s drag survives, Galata 75/75
  - repro: press on the waveform, move 4 px and release; a region under a second appears, Loop turns on, and playback does not move to the clicked point
  - test-tags: E2E
  - root-cause: 2026-10-28T16:41:01Z @kj enableDragSelection passes no minLength (src/audio.ts L282-L284); the Region default is 0 and the drag threshold is 3 px
  - log: 2026-10-28T16:41:01Z @kj added
  - log: 2026-10-28T17:48:44Z @kj closed
- [x] `DEF-MEDIA-14-MEDIA` **Speed change keeps focus in the select, so the first Space opens it** - MINOR; After choosing a playback speed with the mouse the select keeps the focus: the first Space opens the speed dropdown instead of playing or pausing, and the media keys act again only after a click or Tab back to the viewer
  - evidence: not fixed by owner decision: one click or a Tab back to the viewer restores the media keys, and the only known fix (this.node.focus() on change) stopped keyboard users stepping the select more than once; reverted in review round 2
  - repro: open an audio file, change the speed with the mouse, then press Space; the speed dropdown opens and playback does not toggle
  - test-tags: E2E
  - root-cause: 2026-10-28T17:06:46Z @kj the speed select sits in the toolbar, outside the .jp-AdvancedMediaViewer selector the media key bindings match, and its change listener leaves the focus on the select; the round-1 fix (this.node.focus()) was reverted because it broke keyboard stepping of the select
  - log: 2026-10-28T17:06:46Z @kj added
  - log: 2026-10-28T17:19:22Z @kj closed
  - log: 2026-11-02T18:20:33Z @kj owner confirmed 2026-11-02: asked whether "not fixed by owner decision" was their decision, the owner answered "Yes, leave it unfixed"
- [x] `DEF-MEDIA-16-RELOAD-DELETED` **Audio and video Reload on a deleted file shows a dialog** - MINOR; the audio and video Reload buttons call context.revert() before viewer.load(), so a deleted file raises JupyterLab's File Load Error dialog and the old media and read-out stay, in place of the viewer's sentence; read from src/index.ts, not reproduced; the mesh Reload was the same and is fixed
  - root-cause: 2026-11-02T17:27:09Z @kj the audio and video Reload buttons awaited context.revert() before viewer.load(); on a deleted file revert() raises the File Load Error dialog and rejects, so viewer.load() never runs and the viewer's sentence never shows
  - evidence: media_audio.spec.ts and media_video.spec.ts DEF-MEDIA-16-RELOAD-DELETED pass in the three-spec Galata run (75 passed, 7.2 min, GALATA EXIT: 0, logs/mesh-galata-carry.log): the deleted file shows the sentence, no .jp-Dialog, no src, and the restored file plays
  - repro: open an audio or video file, delete it through the contents API, press Reload
  - test-tags: E2E
  - log: 2026-10-31T21:32:54Z @kj added
  - log: 2026-11-01T10:53:59Z @kj closed: fixed: Reload reads first and reverts only when the read succeeded
- [x] `DEF-MEDIA-17-CHECKPOINT` **Opening an audio, video or mesh file copies it into .ipynb_checkpoints** - MAJOR; opening an audio, video or mesh file writes a copy of the same size into .ipynb_checkpoints, so a 1 GiB file costs another 1 GiB of the user's disk
  - evidence: media_mesh.spec.ts, media_audio.spec.ts and media_video.spec.ts DEF-MEDIA-17-CHECKPOINT pass in the three-spec Galata run (75 passed, 7.2 min, GALATA EXIT: 0, logs/mesh-galata-carry.log): listCheckpoints returns [] and no read-only indicator shows
  - repro: open an audio, video or mesh file, then list its checkpoints through the contents API; one checkpoint is listed
  - test-tags: E2E
  - root-cause: 2026-10-31T23:53:26Z @kj _maybeCheckpoint(false) in @jupyterlab/docregistry/lib/context.js:733 creates a checkpoint when canSave holds, because MEDIA_PROVIDER returns a writable model
  - log: 2026-10-31T23:53:26Z @kj added
  - log: 2026-11-01T10:53:59Z @kj closed: fixed: MEDIA_PROVIDER.get returns writable false, so opening the file writes no checkpoint
- [x] `DEF-MEDIA-18-SAVE-EMPTIES` **Save empties an open audio, video or mesh file** - CRITICAL; Ctrl+S writes the empty document model over the file, so the file on disk becomes 0 bytes, and Save As writes a 0 byte copy; marking the model not writable (DEF-MEDIA-17-CHECKPOINT) blocks Ctrl+S on a newly opened file, and a rename while the tab is open makes it writable again
  - evidence: media_mesh.spec.ts, media_audio.spec.ts and media_video.spec.ts DEF-MEDIA-18-SAVE-EMPTIES pass in the three-spec Galata run (84 passed, 8.3 min, GALATA EXIT: 0, logs/mesh-galata-formats.log): after a rename through the contents API, Save As writes nothing and Ctrl+S keeps the file's bytes and the viewer content
  - repro: open an STL, rename it through the contents API while the tab is open, press Ctrl+S; the renamed file is 0 bytes. Before writable false, open and Ctrl+S alone emptied it, as measured on an STL
  - test-tags: E2E
  - root-cause: 2026-10-31T23:58:23Z @kj the media provider reads no content, so the document model is empty; context.save and context saveAs write that model through MEDIA_PROVIDER.save, and a rename updates the contents model from the server's answer, which says writable true
  - log: 2026-10-31T23:58:23Z @kj added; reason: found while checking the behaviour change of DEF-MEDIA-17-CHECKPOINT; outside the work list of the carry stage, so filed and not fixed
  - log: 2026-11-01T12:11:07Z @kj closed
  - log: 2026-11-01T12:29:02Z @kj regressed as DEF-MEDIA-18-SAVE-EMPTIES-1
- [x] `DEF-MEDIA-18-SAVE-EMPTIES-1` **Save empties an open audio, video or mesh file** - CRITICAL; Ctrl+S writes the empty document model over the file, so the file on disk becomes 0 bytes, and Save As writes a 0 byte copy; marking the model not writable (DEF-MEDIA-17-CHECKPOINT) blocks Ctrl+S on a newly opened file, and a rename while the tab is open makes it writable again
  - evidence: media_mesh.spec.ts, media_audio.spec.ts and media_video.spec.ts DEF-MEDIA-18-SAVE-EMPTIES pass in the three-spec Galata run (84 passed, 8.7 min, GALATA EXIT: 0, logs/mesh-galata-fix-formats-1.log): after a rename Ctrl+S and Save As write nothing, and after the renamed file is deleted outside the context Ctrl+S leaves it absent
  - root-cause: 2026-11-01T12:36:46Z @kj context._maybeSave falls back to the default contents provider when MEDIA_PROVIDER.get answers 404, and that provider writes the empty document model; MediaFactory now overrides context.save, and its refusal is what the save command treats as a cancelled save, so nothing is written and no checkpoint is added
  - test-tags: E2E
  - repro: open an audio, video or mesh file, rename it through the contents API, delete the renamed file outside the contents manager so no signal reaches the tab, press Ctrl+S; before the fix the file reappears with 0 bytes
  - log: 2026-11-01T12:29:02Z @kj regression of DEF-MEDIA-18-SAVE-EMPTIES: residual save path; reason: verifier round 1 of the formats stage: a rename then a delete outside the context still wrote a 0 byte file on Ctrl+S
  - log: 2026-11-01T12:29:13Z @kj edited repro added "open an audio, video or mesh file, rename it through the contents API, delete the renamed file outside the contents manager so no signal reaches the tab, press Ctrl+S; before the fix the file reappears with 0 bytes"; test-tags added "E2E"
  - log: 2026-11-01T12:36:46Z @kj closed; reason: fixed at the cause in MediaFactory.createNewWidget: context.save refuses before the context reaches its 404 fallback
- [x] `DEF-MEDIA-22-LARGE-VIDEO` **Video over 100 MB opens as a black box** - CRITICAL; a real 118.4 MiB H.264 and AAC MP4 opens as a 300x150 black box reading 00:00 / 00:00, with no picture, no Play button, no seek bar, no details and no message; tests only fake the size, so the file URL branch never ran on a real large file
  - evidence: accepted by the owner on 2026-11-03 without a retest of the video: "just accept, in worst case I will raise a defect"; tests DEF-MEDIA-22-LARGE-VIDEO in logs/media-r5-1b-named.log, 6 passed; partial-file measurement tmp/workflows/media-viewer/review5/24-partial-probe.json, 4 of 4 variants show the connection sentence; proxy failure net::ERR_HTTP2_PING_FAILED stays the likely cause, not reproduced
  - repro: open a real MP4 over 100 MB from the file browser on GalaxaLab; the player stays black at 00:00 / 00:00
  - test-tags: E2E
  - root-cause: 2026-11-02T20:46:40Z @kj likely cause of the failed request, not reproduced here: the owner's proxied connection (net::ERR_HTTP2_PING_FAILED). Proved in the viewer: over the limit load cleared Loading... at once, so a stalled request showed nothing, and a request that fails before the metadata gets code 4 with the text MEDIA_ELEMENT_ERROR: Format error, as a 404 or 502 does, so it read as a damaged file. Chromium gives MEDIA_ERR_NETWORK only after the metadata, after 30 retries in about 30 s
  - root-cause: 2026-11-02T19:59:33Z @kj likely cause: the /files/ request of the file died with net::ERR_HTTP2_PING_FAILED on the owner's proxied HTTPS connection, and MediaViewer.load clears Loading... right after it sets the source, so a stalled or failed request shows nothing; not yet reproduced
  - root-cause: 2026-11-02T19:54:33Z @kj cause unknown; ruled out so far: codec, index position, symlink, file corruption
  - log: 2026-11-02T19:54:33Z @kj added
  - log: 2026-11-02T20:46:40Z @kj root-cause overridden; reason: states the likely cause and the two proved viewer faults in one record
  - log: 2026-11-02T21:09:54Z @kj ruling 2026-11-02: MEDIA_ERR_NETWORK, or 'MEDIA_ELEMENT_ERROR: Format error' on a non-blob source, shows the connection sentence; anything else keeps the damaged-file sentence. Limits: a 404 or 502 on the file URL reads as a lost connection; other browsers keep the damaged-file sentence. Stays open for the owner's retest
  - log: 2026-11-02T21:17:25Z @kj measured: a file URL request that fails before the metadata shows the connection sentence: (a) 200, no body; (b) 200, 4 KiB; (c) 206, 4 KiB, each with code 4 and 'MEDIA_ELEMENT_ERROR: Format error'. (d) 200, 4 KiB, then silence: Loading... for 30 s, then the same. Log: logs/media-r5-1b-partial.log
  - log: 2026-11-02T21:17:25Z @kj limits of that measurement: localhost HTTP/1.1, Chromium only; every variant sent at most 4 KiB and made no retry, so a break after more of the file, before the metadata, is not measured. The proxy failure (net::ERR_HTTP2_PING_FAILED) stays the likely cause, not reproduced here
  - log: 2026-11-03T09:33:57Z @kj closed: closed: installed fix accepted by the owner without a retest of the video
  - log: 2026-11-03T10:19:33Z @kj verified: the owner's video played in Google Chrome 156 headless through the file URL branch on an isolated server over HTTP/1.1; loadedmetadata 172 ms after open, duration 194.833 s, seek bar to 120 s landed at 119.808 s and kept playing; the proxy path is not covered
- [x] `DEF-MEDIA-23-STALE-CHUNK` **Viewer code missing after an install shows a raw ChunkLoadError** - MAJOR; a page left open across an extension install asks for chunk names that no longer exist; the audio viewer prints the raw ChunkLoadError inside 'This file cannot be played', which blames a good file; a page reload clears it
  - evidence: tests DEF-MEDIA-23-STALE-CHUNK in media_audio.spec.ts and media_video.spec.ts, blocked chunks on a fresh page, failed in logs/media-r5-1b-red.log and passed in logs/media-r5-1b-named.log, 18 of 18
  - repro: open the lab, install a new build, open an audio file without reloading the page
  - test-tags: E2E
  - root-cause: 2026-11-02T20:46:40Z @kj Proved with blocked chunks on a fresh page: a missing chunk rejects with the name ChunkLoadError. In src/audio.ts that came after the downloaded flag, so it took the decode branch and showed 'The waveform could not be drawn.' over an empty native player. In src/video.ts the import sat outside any try, so it was an unhandled rejection and a blank tab
  - root-cause: 2026-11-02T19:59:33Z @kj the viewer chunks load through a lazy import inside the load try in src/audio.ts, so ChunkLoadError lands in the decode failure sentence; the import in src/video.ts sits outside any try
  - log: 2026-11-02T19:59:33Z @kj added
  - log: 2026-11-02T20:46:40Z @kj root-cause overridden; reason: the record names the failure in each viewer
  - log: 2026-11-02T21:09:54Z @kj closed: fixed: one ChunkLoadError check in MediaViewer.fail shows the reload sentence, with no player
- [x] `DEF-MEDIA-24-HASH-READ` **Media provider reads the whole file on every open and Reload** - MAJOR; the server reads and hashes the whole file on every open and Reload, and an unreadable file raises a dialog with no tab; fix hash false beside content false; `src/index.ts`
  - evidence: test ACC-MEDIA-71-STREAM in media_audio.spec.ts and media_video.spec.ts asserts hash=0; failed with hash=1 in logs/media-r5-1-red.log, passed in logs/media-r5-1-named.log, 9 of 9; src/index.ts unchanged after that run
  - repro: open a large audio file and watch the GET on /api/contents/: it carries hash=1
  - test-tags: E2E
  - root-cause: 2026-11-02T20:00:47Z @kj context.js:587 sets hash true for a base64 model and the provider forwards it; jupyter_server filemanager.py:427 and :904 read the whole file only when require_hash is set
  - log: 2026-11-02T20:00:47Z @kj added
  - log: 2026-11-02T21:09:53Z @kj closed: fixed: hash false beside content false in the media provider
- [x] `DEF-MEDIA-25-CLICK-SEEK` **A click that moves 3 px or more does not seek** - MAJOR; a press with a 4 px move on a 20 minute file at 1440 px loses the seek and arms Loop; on a short file it does nothing; fix 8 px threshold in enableDragSelection, and a short drag seeks to its start; `src/audio.ts`
  - evidence: tests ACC-AUDIO-50-LOOP 'a drag marks a loop region and Loop off removes it' and 'a drag under the shortest loop seeks to its start and leaves Loop off' passed in logs/media-r5-1b-named.log, 18 of 18; the first failed in logs/media-r5-1-red.log
  - repro: open a 20 minute audio file, press on the waveform, move 4 px, release: playback stays and Loop turns on
  - test-tags: E2E
  - root-cause: 2026-11-02T20:00:47Z @kj in wavesurfer 8.0.4 a press past the threshold is a drag and the drag suppresses the click; the DEF-MEDIA-13-MEDIA filter works in seconds while the drag decision works in pixels
  - log: 2026-11-02T20:00:47Z @kj added
  - log: 2026-11-02T21:09:53Z @kj closed: fixed: 8 px drag threshold, and a drag under MIN_LOOP seeks to its start
- [x] `DEF-MEDIA-26-NARROW-CONTROLS` **Video controls do not fit a narrow player, and a file with sound only shows no details** - MAJOR; seek bar 13 px at 353 px wide, Play off the box at 300 px, on portrait clips, in split panels and for sound-only WebM or MP4, which also show empty details; fix wrap the control row; `style/base.css`, `src/video.ts`
  - evidence: test DEF-MEDIA-26-NARROW-CONTROLS, seek bar at least 200 px with Play and Fullscreen inside the player, passed in logs/media-r5-1b-named.log, 18 of 18; sound-only details: voice.webm row of DEF-MEDIA-27-WEBM-DURATION in logs/media-r5-1-named.log
  - repro: open a video in a panel split beside another document: the seek bar is about 13 px wide
  - test-tags: E2E
  - root-cause: 2026-11-02T20:00:47Z @kj Plyr's control row needs about 402 px and never wraps; a file with sound only keeps the 300 px box because fitVideo has no frame size, and the details line was guarded on a frame size
  - log: 2026-11-02T20:00:47Z @kj added
  - log: 2026-11-02T21:09:53Z @kj closed: fixed: control row wraps, seek bar basis 200 px, details no longer need a frame size
- [x] `DEF-MEDIA-27-WEBM-DURATION` **A WebM without a duration in its header has a dead seek bar and no length** - MAJOR; browser recorder output reports duration Infinity, the read-out ends in --:--, and a click on the seek bar stays at 0; fix seek to 1e101, then back to 0 on durationchange; `src/video.ts`
  - evidence: test DEF-MEDIA-27-WEBM-DURATION 'a browser recording shows its length and seeks' failed in logs/media-r5-1-red2.log with --:-- and passed in logs/media-r5-1-named.log, 9 of 9; refresh() in src/video.ts unchanged after that run
  - repro: open a WebM recorded by MediaRecorder with a timeslice, such as start(200), and click the middle of the seek bar: currentTime stays 0
  - test-tags: E2E
  - root-cause: 2026-11-02T20:00:47Z @kj the header holds no duration, so media.duration is Infinity until a seek reaches the end; Plyr treats Infinity as 0, so a seek-bar click computes time 0
  - log: 2026-11-02T20:00:47Z @kj added
  - log: 2026-11-02T20:12:16Z @kj edited repro "open a WebM from MediaRecorder and click the middle of the seek bar: currentTime stays 0" -> "open a WebM recorded by MediaRecorder with a timeslice, such as start(200), and click the middle of the seek bar: currentTime stays 0"
  - log: 2026-11-02T20:12:16Z @kj measured: start() without a timeslice writes a finite duration into the file at 2.5, 12 and 22 s; start(200) stays Infinity at 2.5 and 12 s, and the scan resolves it in 2 to 21 ms
  - log: 2026-11-02T21:09:53Z @kj closed: fixed: seek to 1e101, then back to 0 on durationchange
  - log: 2026-11-02T21:43:55Z @kj limit: the duration scan in refresh() runs only on a blob: source, so only up to 100 MB; a recording over 100 MB keeps --:-- and a dead seek bar, filed as DEF-MEDIA-30-LARGE-RECORDING
- [x] `DEF-MEDIA-28-THEME-ERASE` **A theme change erases the main waveform** - MAJOR; a live theme change blanks the waveform and the ruler of the visible audio tab until Reload or a panel resize; fix repaint in the next frame; `src/audio.ts`
  - evidence: test ACC-AUDIO-45-WAVE asserts the main canvas over 100 px wide after a theme change; failed in logs/media-r5-1-red.log with 0, passed in logs/media-r5-1-named.log, 9 of 9; the observer in src/audio.ts unchanged after that run
  - repro: open an audio file and change the theme: the waveform disappears
  - test-tags: E2E
  - root-cause: 2026-11-02T20:00:48Z @kj thememanager.js:469-479 hides the host and queues its show frame in one synchronous step; the observer repainted in a microtask, before the show, so wavesurfer drew at no width
  - log: 2026-11-02T20:00:48Z @kj added
  - log: 2026-11-02T21:09:53Z @kj closed: fixed: theme observer repaints in the next frame
- [x] `DEF-MEDIA-29-DECODE-FAIL` **A failed waveform decode says the file cannot be played while it plays** - MAJOR; a long valid file under 100 MB, or a tab that loses the decode race, shows 'This file cannot be played' with the raw exception and no controls; fix native player and one sentence; `src/audio.ts`
  - evidence: test DEF-MEDIA-29-DECODE-FAIL 'a failed decode leaves a native player that seeks' failed in logs/media-r5-1-red.log and passed on the final build in logs/media-r5-1b-named.log, 18 of 18
  - repro: make decodeAudioData reject, or open several large audio files at once: the sentence prints the exception and no controls show
  - test-tags: E2E
  - root-cause: 2026-11-02T20:00:48Z @kj the downloaded branch of the load catch treats a decode failure as an unplayable file; wavesurfer 8.0.4 calls setSrc and waits for loadedmetadata before it decodes, so the element can already play
  - log: 2026-11-02T20:00:48Z @kj added
  - log: 2026-11-02T21:09:53Z @kj closed: fixed: failed decode leaves the native player and one sentence
- [-] `DEF-MEDIA-30-LARGE-RECORDING` **a WebM recording over 100 MB with no duration in its header shows --:-- and a dead seek bar** - MEDIUM; details end in --:--, the player reads 00:00 and a click on the seek bar stays at 0; cause the duration scan runs only on a blob: source; `src/video.ts`
  - repro: open a WebM browser recording over 100 MB with no duration in its header: details end in --:--, a click on the seek bar stays at 0
  - test-tags: E2E
  - root-cause: 2026-11-02T21:43:43Z @kj Over 100 MB the file plays from its /files/ URL and refresh() skips the duration scan, which would read the whole file from the server: 13.5 s at 12.5 MB/s for a 157 MB WebM with no cues. duration stays Infinity; keys still seek, seekBy clamps to Infinity
  - log: 2026-11-02T21:43:43Z @kj added
  - log: 2026-11-02T22:11:58Z @kj Left and Right now seek with focus anywhere in the tab: Plyr keyboard handling is off, so the viewer's bindings take the keys
  - log: 2026-11-02T22:11:59Z @kj a click on the seek bar moves the thumb, not the playback, while the read-out shows a total of 00:00
  - log: 2026-11-03T09:03:18Z @kj Plyr's keys are restored by the owner's decision of 2026-11-03, so with focus on a Plyr control Left and Right do nothing on that file type
  - log: 2026-11-03T09:03:18Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [x] `DEF-MEDIA-31-FILE-RELOAD` **File > Reload from Disk does not reload an audio or video tab** - MEDIUM; File > Reload Audio from Disk leaves the old file playing, and on a deleted file raises the File Load Error dialog in place of the viewer's sentence; cause the command calls context.revert(), which re-reads only the empty document model; fix context.revert = () => content.load(); `src/media.ts`
  - evidence: E2E media_audio.spec.ts DEF-MEDIA-31-FILE-RELOAD failed on the round 3 build (logs/media-r5-5-red.log, read-out stayed 01:00.0) and passes on the installed 1.2.7 build (logs/media-r5-5-named.log, 17 of 17)
  - repro: open an audio file, replace it on disk, run File > Reload Audio from Disk: the old file still plays
  - test-tags: E2E
  - log: 2026-11-03T09:03:03Z @kj added
  - log: 2026-11-03T09:15:28Z @kj closed: fixed: context.revert = () => this.load() in the MediaViewer constructor, src/media.ts
- [x] `DEF-MEDIA-32-SPEED-RELOAD` **After Reload the speed select shows the chosen speed while playback runs at 1x** - MEDIUM; choose 2x in the audio speed select and press Reload: the select still shows 2x and the audio plays at 1x, and choosing 2x again fires no change event; cause a new source resets playbackRate to defaultPlaybackRate; fix set defaultPlaybackRate as well in the change handler; `src/audio.ts`
  - evidence: E2E media_audio.spec.ts DEF-MEDIA-32-SPEED-RELOAD failed on the round 3 build (logs/media-r5-5-red.log, playbackRate 1, expected 2) and passes on the installed 1.2.7 build (logs/media-r5-5-named.log, 17 of 17)
  - repro: open an audio file, choose 2x, press Reload: media.playbackRate is 1
  - test-tags: E2E
  - log: 2026-11-03T09:03:04Z @kj added
  - log: 2026-11-03T09:15:28Z @kj closed: fixed: the speed change handler sets defaultPlaybackRate as well, src/audio.ts
- [x] `DEF-MEDIA-33-SAVE-TOAST` **The Save and Save As refusal shows no visible message** - MEDIUM; Save As, and Ctrl+S after a rename, refuse the save with only a change in the bell count; cause Notification.warning defaults autoClose to 0, which files the notification without a toast; fix { autoClose: 5000 }; `src/media.ts`
  - evidence: E2E toast assertion in DEF-MEDIA-18-SAVE-EMPTIES of media_audio.spec.ts and media_video.spec.ts failed on the round 3 build (logs/media-r5-5-red.log, toast not found) and passes on the installed 1.2.7 build (logs/media-r5-5-named.log, 17 of 17)
  - repro: open an audio file, rename it, press Ctrl+S: no toast shows and the bell count rises by 1
  - test-tags: E2E
  - log: 2026-11-03T09:03:04Z @kj added
  - log: 2026-11-03T09:15:28Z @kj closed: fixed: the save refusal passes { autoClose: 5000 } to Notification.warning, src/media.ts
- [-] `DEF-MEDIA-34-NATIVE-KEYS` **Media keys act on the native audio control after a click on it** - MINOR; after a click on the native audio bar of a file over 100 MB, Space and the arrows act on the native control until focus leaves it; Right moves 0.12 s, not 5 s; `src/audio.ts`
  - repro: open an audio file over 100 MB, click the native bar, press Right: playback moves 0.12 s
  - test-tags: E2E
  - log: 2026-11-03T09:03:04Z @kj added
  - log: 2026-11-03T09:03:04Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-35-PLYR-KEYS` **Keys on Plyr's own buttons and volume slider run the viewer's commands** - MINOR; Space on a focused Plyr button and Left or Right on the volume slider run the viewer commands instead: playback or a seek in place of the button press or the volume change; `src/video.ts`
  - repro: open a video, focus Mute with Tab, press Space: the video plays
  - test-tags: E2E
  - log: 2026-11-03T09:03:04Z @kj added
  - log: 2026-11-03T09:03:04Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-36-LOOP-TAIL` **A loop region that reaches the end of the file can stop instead of repeating** - MINOR; a loop region that reaches the end of the file can stop instead of repeating at speeds other than 1x, with Loop still pressed; cause ws.isPlaying() is false once media.ended is true; `src/audio.ts`
  - repro: drag a loop region to the right edge of the waveform, choose 1.5x, play: playback can stop at the end
  - test-tags: E2E
  - log: 2026-11-03T09:03:05Z @kj added
  - log: 2026-11-03T09:03:05Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-37-DECODE-QUEUE` **Several large audio tabs decoding at once can leave a tab with no waveform** - MINOR; several large audio tabs decoding at once can leave a tab with no waveform until Reload, and the browser peaks above 14 GB on four large tabs; the decodes are not queued; `src/audio.ts`
  - repro: open four audio files near 100 MB at once: one tab can show no waveform
  - test-tags: E2E
  - log: 2026-11-03T09:03:05Z @kj added
  - log: 2026-11-03T09:03:05Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-38-SYMLINK-SIZE` **The size check reads the symlink, not the file** - MINOR; the size check reads the symlink, so a symlinked file over 100 MB downloads in full and every symlink shows the wrong size; cause filemanager.py:282 and :836 use os.lstat; `src/media.ts`
  - repro: symlink an audio file over 100 MB and open the link: the whole file downloads
  - test-tags: E2E
  - log: 2026-11-03T09:03:05Z @kj added
  - log: 2026-11-03T09:03:05Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-39-ZOOM-BELOWFIT` **Zoom out below the fit is stored, so Plus does nothing for as many presses** - MINOR; zoom out below the fit is stored, so Plus does nothing visible for as many presses as Minus overshot; Fit recovers at once; `src/audio.ts`
  - repro: open an audio file, press Fit, press - three times, then +: the waveform does not change for three presses
  - test-tags: E2E
  - log: 2026-11-03T09:03:15Z @kj added
  - log: 2026-11-03T09:03:15Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-40-ABORT-FETCH` **Downloads of media tabs the user already left are not cancelled** - MINOR; downloads of media tabs the user already left are not cancelled and slow the file that replaced them: 13.2 s against 5.7 s for the last file at 20 MB/s; `src/media.ts`, `src/audio.ts`
  - repro: throttle the network to 20 MB/s, press Page Down through three large audio files: the last one loads in 13.2 s
  - test-tags: E2E
  - log: 2026-11-03T09:03:15Z @kj added
  - log: 2026-11-03T09:03:16Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-41-RESTORED-TABS` **Restored media tabs that are never shown still download their file** - MINOR; restored media tabs that are never shown still download their file on every lab reload, and audio tabs decode it; cause load() starts on context.ready, not on the first show; `src/media.ts`
  - repro: open three audio tabs, reload the page: all three files download
  - test-tags: E2E
  - log: 2026-11-03T09:03:16Z @kj added
  - log: 2026-11-03T09:03:16Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-42-SAVE-ADVICE` **Ctrl+S advises Save As, which this viewer refuses** - MINOR; Ctrl+S on a media tab shows JupyterLab's advice to use Save As, which this viewer also refuses; one wasted step, and the file is unchanged
  - repro: open an audio file, press Ctrl+S, then follow the advice and use Save As: it is refused
  - test-tags: E2E
  - log: 2026-11-03T09:03:16Z @kj added
  - log: 2026-11-03T09:03:16Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-43-MESSAGE-POSITION` **The video error sentence and Loading... sit at the panel foot** - MINOR; the video error sentence and Loading... sit at the panel foot in small grey text under a live-looking player, easy to miss in a tall window; `style/base.css`
  - repro: open a damaged video in a tall panel: the sentence shows in small grey text at the foot
  - test-tags: E2E
  - log: 2026-11-03T09:03:16Z @kj added
  - log: 2026-11-03T09:03:17Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-44-HELP-FOCUS` **After the help dialog closes the media keys do nothing until a click in the viewer** - MINOR; after the help dialog closes, the media keys do nothing until the user clicks the viewer, because focus does not return to the viewer; `src/index.ts`
  - repro: open an audio file, open help, close it, press Space: nothing plays
  - test-tags: E2E
  - log: 2026-11-03T09:03:17Z @kj added
  - log: 2026-11-03T09:03:17Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-45-RULER-CONTRAST` **Secondary ruler labels render at about 1.4:1 contrast** - MINOR; the secondary ruler labels of the audio waveform render at about 1.4:1 contrast; the hover label and the status line give the same time; `src/audio.ts`
  - repro: open an audio file and measure the contrast of the small ruler labels: about 1.4:1
  - test-tags: E2E
  - log: 2026-11-03T09:03:17Z @kj added
  - log: 2026-11-03T09:03:17Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-46-FOCUS-CUE` **The viewer has no visible focus cue although the media keys depend on focus** - MINOR; the media viewer shows no focus outline, so a keyboard user cannot see when the media keys act; read from the CSS, not measured; `style/base.css`
  - repro: open an audio file, press Tab into the viewer: no focus outline shows
  - test-tags: E2E
  - log: 2026-11-03T09:03:17Z @kj added
  - log: 2026-11-03T09:03:17Z @kj rejected: Known limit, accepted by the owner on 2026-11-03
- [-] `DEF-MEDIA-47-TWOVIEW-RELOAD` **File > Reload from Disk in an older view reloads only the newest view** - MINOR; after New View on a media file, File > Reload from Disk in the older view reloads only the newest view; once the newest view is closed it does nothing and shows no sentence; the toolbar Reload works in every view; `src/media.ts`
  - repro: open a media file, run New View, then File > Reload from Disk in the older view: only the newest view reloads
  - test-tags: E2E
  - log: 2026-11-03T09:33:33Z @kj added
  - log: 2026-11-03T09:33:35Z @kj rejected: Known limit, accepted by the owner on 2026-11-03

## Mesh viewer `MESH`

Wrong behaviour of the 3D viewer for STL, PLY, OBJ, 3MF, GLB and STEP files

- log: 2026-10-31T20:54:25Z @kj category created

- [x] `DEF-MESH-15-SEAMS` **Smooth shading shows seams on a mesh with facets 22.5 degrees apart** - MINOR; a globe of 8 rows and 16 columns keeps visible patch edges in Smooth; a globe with facets 15 degrees apart renders round
  - evidence: media_mesh.spec.ts DEF-MESH-15-SEAMS passes in the three-spec Galata run (75 passed, 7.2 min, GALATA EXIT: 0, logs/mesh-galata-carry.log): the smooth globe's largest step is under a quarter of the faceted one's
  - related: ACC-MESH-82-SMOOTH
  - repro: open a binary STL of a UV sphere with 8 rows and 16 columns; patch edges show on the surface in Smooth
  - test-tags: E2E
  - root-cause: 2026-10-31T20:54:25Z @kj three.js toCreasedNormals averages at a vertex only the faces within 30 degrees of each face's own normal; the diagonal neighbour is 31.8 degrees away, so faces that share a vertex get different normals
  - log: 2026-10-31T20:54:25Z @kj added
  - log: 2026-11-01T10:53:59Z @kj closed: fixed: CREASE raised from 30 to 40 degrees, so the 22.5 degree globe renders round
- [x] `DEF-MESH-19-LIMIT` **The 1 GiB limit admits mesh files no reader survives** - MAJOR; the advertised 1 GiB limit admits files no reader survives; a 1 GiB binary STL is 21.5 million triangles; STLLoader allocates 773 MB of positions and 773 MB of normals, toCreasedNormals adds about 3.6 GB more (515 MB face normals, 1.55 GB quantized array, 537 MB hash table, 258 MB vertex ids, 773 MB output), the download holds 1 GiB, so the tab needs about 6-7 GB and the main thread is blocked for the whole pass (847 ms was measured for 100 MB); text formats over about 512 MiB are refused as damaged because the decode exceeds the V8 string ceiling; the largest real file tested is 95.4 MB. Star Colonel decision 2026-11-01: keep the limit; the terminal fix is a campaign that moves the five non-STEP readers off the UI thread and replaces toCreasedNormals with a memory-bounded normal computation, and even then 1 GiB needs about 1.5 GB of GPU geometry, so the alternative is a product decision to lower the advertised limit
  - evidence: ui-tests/tests/media_mesh.spec.ts:3574 ACC-MESH-110/DEF-MESH-19 passed in logs/mesh-galata-verify-worker-1.log (42/42, exit 0): 1 GiB STL (21,464,352 triangles) opens and shows the model in 343,615 ms at a 2,401,078,132 B (2.24 GiB) page+worker heap peak, within the 4 GB budget; verifier probe 2,416,457,105 B
  - repro: open a binary STL near 1 GiB in the lab or generate 21.5 million triangles; the tab allocates about 6-7 GB and the UI thread blocks for minutes; an ASCII or OBJ file over about 512 MiB shows the damaged sentence
  - log: 2026-11-01T14:30:29Z @kj added; reason: the adjudicator plan requires the full measurement record for this deferred risk, so the text is longer than the 50-word default
  - log: 2026-11-01T21:36:29Z @kj closed
- [x] `DEF-MESH-20-COPY` **The lost-context sentence names a control that is never labeled** - MINOR; after a lost WebGL context the viewer says "The graphics context was lost, so press Reload to show the model again." The reload control is an icon with tooltip "Reload mesh from disk" and no visible label, and the help dialog does not list it, so the instruction sends the user looking for a word that is not on screen; the harm is a hover delay. Deferred by the review as a copy edit for a later toolbar or docs pass
  - evidence: src/mesh.ts:227 says 'press the refresh icon'; src/toolbar.ts:20 adds that icon as advanced-refresh with tooltip 'Reload mesh from disk' (attached at src/index.ts:674); ui-tests/tests/media_mesh.spec.ts:2910 asserts the same string; the installed bundle 763.338c901d69d081ec.js carries the new sentence once and zero 'press Reload'
  - repro: open a mesh, force a lost WebGL context, read the sentence, then look for a control labeled Reload
  - log: 2026-11-01T14:30:32Z @kj added; reason: the adjudicator plan requires the message text and the harm as filed, which runs past the 50-word default
  - log: 2026-11-01T22:56:12Z @kj closed: fixed: the sentence names the refresh icon the toolbar shows
- [x] `DEF-MESH-21-PMREM` **The Studio environment build holds the main thread 678-718 ms on every mesh open** - MAJOR; the viewer builds the Studio environment on the main thread in the frame after the renderer attaches. PMREMGenerator.fromScene measures 678 ms at 95 MB and 718 ms at 1 GiB on the lab's software renderer, so ACC-MESH-106 and ACC-MESH-110 miss the 200 ms longest-gap bar while their other bars pass: the 95 MB file reads out in 4.77 s at a 355 MB heap peak, the 1 GiB file in 351 s at a 2.40 GB heap peak. An attribution run places the read-out and the canvas at 3947-3949 ms and the 678 ms task at 3949 ms, so the block is the environment build, not the read.
  - evidence: logs/mesh-verify-51-galata-perf.log:279 ACC-MESH-106 on the 95 MB open: longest main-thread task 173 ms (tasks [[3965,173]]), max rAF gap 183.4 ms, no gap over 200 ms, 2 passed exit 0; the baked style/studio-env.bin replaced the 678-718 ms PMREM build (src/meshscene.ts:189)
  - repro: run ui-tests/tests/media_mesh.spec.ts -g ACC-MESH-106 through galata-bwrap.sh; PERF 95MB prints over [[4613,683]] with tasks [[3947,678],[4630,108]]
  - test-tags: E2E
  - root-cause: 2026-11-01T20:09:12Z @kj src/meshscene.ts environmentFor() builds the environment with PMREMGenerator.fromScene(new RoomEnvironment(), 0.04). three r187 clamps the cube size to MIN_SIZE 256 and convolves it with a 256-sample GGX pass; a warm second build still costs 667 ms, so it is fragment work, not shader compilation. Three offers no API to split or cache the build, and WebGLPrograms sets usePMREM for every MeshStandardMaterial, so a plain CubeTexture does not avoid it. The Studio style is required by ACC-MESH-101.
  - log: 2026-11-01T20:09:12Z @kj added; reason: the measurement and attribution record is needed to act on the defect
  - log: 2026-11-01T20:09:25Z @kj edited text "Every mesh open builds the Studio environment on the main thread in the frame after the renderer attaches. PMREMGenerator.fromScene measures 678 ms at 95 MB and 718 ms at 1 GiB on the lab's software renderer, so ACC-MESH-106 and ACC-MESH-110 miss the 200 ms longest-gap bar while their other bars pass: the 95 MB file reads out in 4.77 s at a 355 MB heap peak, the 1 GiB file in 351 s at a 2.40 GB heap peak. An attribution run places the read-out and the canvas at 3947-3949 ms and the 678 ms task at 3949 ms, so the block is the environment build, not the read." -> "Every mesh open builds the Studio environment on the main thread in the frame after the renderer attaches. PMREMGenerator.fromScene measures 678 ms at 95 MB and 718 ms at 1 GiB on the lab's software renderer, so ACC-MESH-106 and ACC-MESH-110 miss the 200 ms longest-gap bar while their other bars pass: the 95 MB file reads out in 4.77 s at a 355 MB heap peak, the 1 GiB file in 351 s at a 2.40 GB heap peak. An attribution run places the read-out and the canvas at 3947-3949 ms and the 678 ms task at 3949 ms, so the block is the environment build, not the read."; reason: the measurement and attribution record is needed to act on the defect
  - log: 2026-11-01T20:09:28Z @kj edited text "Every mesh open builds the Studio environment on the main thread in the frame after the renderer attaches. PMREMGenerator.fromScene measures 678 ms at 95 MB and 718 ms at 1 GiB on the lab's software renderer, so ACC-MESH-106 and ACC-MESH-110 miss the 200 ms longest-gap bar while their other bars pass: the 95 MB file reads out in 4.77 s at a 355 MB heap peak, the 1 GiB file in 351 s at a 2.40 GB heap peak. An attribution run places the read-out and the canvas at 3947-3949 ms and the 678 ms task at 3949 ms, so the block is the environment build, not the read." -> "the viewer builds the Studio environment on the main thread in the frame after the renderer attaches. PMREMGenerator.fromScene measures 678 ms at 95 MB and 718 ms at 1 GiB on the lab's software renderer, so ACC-MESH-106 and ACC-MESH-110 miss the 200 ms longest-gap bar while their other bars pass: the 95 MB file reads out in 4.77 s at a 355 MB heap peak, the 1 GiB file in 351 s at a 2.40 GB heap peak. An attribution run places the read-out and the canvas at 3947-3949 ms and the 678 ms task at 3949 ms, so the block is the environment build, not the read."; reason: the measurement and attribution record is needed to act on the defect
  - log: 2026-11-01T22:56:15Z @kj closed: fixed: longest main-thread task 173 ms on the 95 MB open, down from 678-718 ms

