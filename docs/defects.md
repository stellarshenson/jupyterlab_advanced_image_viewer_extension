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
- [ ] `DEF-NAV-4` **Arrow keys use a stale list while the file browser is hidden** - MINOR; with the file browser sidebar collapsed, Left/Right skip images added to the folder after the collapse and still step onto images removed since; cause: DirListing re-sorts only while visible and marks itself dirty otherwise; `src/index.ts` navigate()
  - related: DEF-NAV-1 - introduced by its fix
  - repro: open an image, collapse the left sidebar, add an image to the folder from a terminal, press Right
  - test-tags: E2E
  - root-cause: 2026-09-30T12:40:15Z @kj listing.js re-sorts on model refresh only when isVisible, else sets _isDirty until onAfterShow; navigate() reads sortedItems() without checking
  - log: 2026-09-30T12:40:15Z @kj added
  - log: 2026-09-30T12:40:20Z @kj reported: review round 1 (wf_7ce58b06-5d1), deferred as MINOR - every fix adds surface to navigation; HEAD before b3e493e read the folder fresh on each key press
  - log: 2026-09-30T13:09:29Z @kj variant, review round 4 (wf_528ef1ee-5c3): with the sidebar visible, an image deleted outside the page stays listed until the next poll; Right is a no-op with a 404 console error for about 5.6 s, then continues

## Keyboard `KEYS`

Keyboard focus and key handling in the image viewer

- [ ] `DEF-KEYS-2` **Keys stop working after a toolbar click** - MAJOR; after clicking a toolbar button (+, -, Fit, refresh), clicking the image leaves focus on the button, so the stock keys and Left/Right do nothing; cause: ViewerController.onDown calls preventDefault() on mousedown, which also stops the click from focusing the viewer; `src/controller.ts`
  - related: ACC-STOCK-34 - stock keybindings work
  - repro: open an image, click Fit, click the image, press ]
  - test-tags: E2E
  - log: 2026-09-30T12:07:40Z @kj added
  - log: 2026-09-30T12:07:40Z @kj reported: found 2026-09-23 while verifying ACC-STOCK-35; after a Fit click document.activeElement stays the toolbar button and ] does not rotate

## Build and CI `BUILD`

Packaging, the Makefile and the GitHub Actions workflows

- [ ] `DEF-BUILD-3` **CI build fails at the endpoint-auth check** - MAJOR; Build job fails at 'Check that all endpoints are authenticated', so Integration tests and test_isolated are skipped; the package has no server extension; fix: remove the step and .github/scripts/check_auth.py; `.github/workflows/build.yml`
  - repro: push to main; Build run 36713954661, job build, step 'Check that all endpoints are authenticated'
  - test-tags: INTEGRATION
  - root-cause: 2026-09-30T12:23:19Z @kj template 4.6.5 (kind frontend-and-server) added check_auth.py, which loads the package as a server extension with reraise_server_extension_failures=True; __init__.py has no _load_jupyter_server_extension, so jupyter_server raises ExtensionLoadingError
  - lock: 2026-10-01T12:23:19Z @kj
  - log: 2026-09-30T12:23:19Z @kj added
  - log: 2026-09-30T12:23:19Z @kj reported: CI red on b3e493e; error '_load_jupyter_server_extension function was not found'

