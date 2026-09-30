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

