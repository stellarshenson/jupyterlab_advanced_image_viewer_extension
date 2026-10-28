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
  - evidence: platform fix owned by galaxalab (DownloadableFilesHandler sends 200 without byte ranges); this extension plays every file up to 100 MB from a downloaded blob, which seeks on that server, and files over 100 MB play from the URL and need the platform fix
  - attachment: defects/DEF-MEDIA-7-SEEK-files-range.md sha256:dd52194dfb6de9a6 edited:2026-10-28T14:19:59Z
  - repro: open a 60 s MP3 in the stock Audio Viewer on a server with the GalaxaLab config, set currentTime = 30 or click the middle of the seek bar; currentTime stays 0
  - test-tags: E2E
  - root-cause: 2026-10-28T14:06:54Z @kj GalaxaLab config sets c.ContentsManager.files_handler_class = DownloadableFilesHandler, a jupyter_server FilesHandler subclass, not AuthenticatedFileHandler; FilesHandler ignores Range, sends 200 chunked, no Accept-Ranges, no Content-Length; Chrome: MP3, FLAC, M4A, MP4, WebM seekable [0,0], seek returns to 0; WAV, OGG duration Infinity, a seek bar click lands at the wrong time
  - log: 2026-10-28T14:06:54Z @kj added
  - log: 2026-10-28T14:20:01Z @kj attached defects/DEF-MEDIA-7-SEEK-files-range.md sha256:dd52194dfb6de9a6
  - log: 2026-10-28T14:20:04Z @kj handed to the owner: fix is the DownloadableFilesHandler base class in the galaxalab repository, see the attached document
  - log: 2026-10-28T17:19:22Z @kj closed
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

