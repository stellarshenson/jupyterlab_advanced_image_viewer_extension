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

## Keyboard `KEYS`

Keyboard focus and key handling in the image viewer

- [ ] `DEF-KEYS-2` **Keys stop working after a toolbar click** - MAJOR; after clicking a toolbar button (+, -, Fit, refresh), clicking the image leaves focus on the button, so the stock keys and Left/Right do nothing; cause: ViewerController.onDown calls preventDefault() on mousedown, which also stops the click from focusing the viewer; `src/controller.ts`
  - related: ACC-STOCK-34 - stock keybindings work
  - repro: open an image, click Fit, click the image, press ]
  - test-tags: E2E
  - log: 2026-09-30T12:07:40Z @kj added
  - log: 2026-09-30T12:07:40Z @kj reported: found 2026-09-23 while verifying ACC-STOCK-35; after a Fit click document.activeElement stays the toolbar button and ] does not rotate

