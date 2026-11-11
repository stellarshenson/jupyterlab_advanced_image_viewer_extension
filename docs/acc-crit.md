# Acceptance Criteria - jupyterlab_advanced_image_viewer_extension

Project-wide acceptance criteria for the advanced image viewer, derived from what the feature
must do and from the stock viewer ground truth. Every criterion is measurable in DOM numbers or
in tab and keystroke effects, so a build is done only when it is checked with real measurements.

### Conventions

Assertions read the ACTIVE `.jp-ImageViewer` and its `<img>`; tolerance 2px unless stated;
"baseline" is a freshly opened image before any interaction; reference window 1500x950
(host ~918x853). Fit specifics, measured stock numbers and reference screenshots live in
`image_fit_reference.md` beside this file.

### Verification method

1. `make install`, then confirm the extension reports enabled OK
2. Playwright -> `http://localhost:8888/user/<user>/lab`, header `Authorization: token <JUPYTERHUB_API_TOKEN>`, viewport 1500x950
3. Reference files: `images_ip/03_growth_models.svg`, `images_ip/05_operations.svg`, `images_poc-dewarp-restoration-research/image-2.png`, `images_poc-dewarp-restoration-research/image-warping-correction-2.png`
4. For each: open, wait, read host and img rects, naturalW/H and transforms; assert the fit and health criteria with the actual numbers recorded, and compare screenshots against `fit-reference/stock/`
5. Drive wheel up/down, toolbar +/-, reset and drag; assert the zoom, reset and pan criteria with measured scales and offsets
6. Drive prev/next keys; assert the navigation criteria (tab count before and after, file browser unchanged); toggle settings and assert the settings criteria
7. Record the measured values beside each criterion and report met or not met per criterion, never a bare "works"

### Definition of done

Every criterion in this file verified with recorded measurements on the reference files. Any
tiny or fragment or off-position render, any inability to zoom out below fit, any new tab on
navigation, any pan that leaves the image outside its legal range, and any stock rotate or flip
that breaks zoom, pan or fit is an automatic fail.

## Authors

- `@kj` Konrad Jelen

## Fit and display `FIT`

Every image opens fitted to the panel, matching the stock viewer pixel for pixel

- [x] `ACC-FIT-1` **Fully visible, no fragment** - CRITICAL; baseline `img.rect` lies inside `host.rect` on all four edges (+-2px), never a fragment
  - evidence: 2026-09-30 A/B at 1500x950 vs stock on four reference files: identical img rects, max diff 0.0 px, all inside the host; Galata 'the image opens whole, at its aspect, and fits the host' asserts a 200x150 PNG and an 800x60 viewBox SVG lie inside the host, 30/30 local
  - test: open each reference file, read both rects, assert containment on four edges
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:04Z @kj edited evidence "JOURNAL entry 4 (v0.4.6): "all baselines render identity-transform, full-fit, matching stock numbers exactly (growth SVG 918x69, image-2 314x306 natural, warping 918x423)" - every rendered rect fits inside the recorded 918x853 host [/home/lab/workspace/private/jupyterlab/jupyterlab_advanced_image_viewer_extension/.claude/JOURNAL.md entry 4; host size from docs/image_fit_reference.md "window 1500x950, host 918x853"]" -> "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; every image fully inside the host at baseline"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; every image fully inside the host at baseline" -> "2026-09-30 A/B at 1500x950 vs stock on four reference files: identical img rects, max diff 0.0 px, all inside the host; Galata 'the image opens whole, at its aspect, and fits the host' asserts a 200x150 PNG and an 800x60 viewBox SVG lie inside the host, 30/30 local"
- [x] `ACC-FIT-2` **Aspect preserved** - CRITICAL; `img.rect.w / img.rect.h` equals the source aspect within 1%, where source aspect is `viewBox` for SVG and `naturalW/H` for raster
  - evidence: 2026-09-30 A/B at 1500x950 vs stock on four reference files: identical img rects, max diff 0.0 px, 1170x538.5 vs natural 2818x1297, 1170x87.8 vs viewBox 800x60; Galata 'the image opens whole, at its aspect, and fits the host' asserts both fixtures keep the source aspect within 1%, 30/30 local
  - test: open each reference file, compare rendered aspect against the source aspect
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:04Z @kj edited evidence "Recorded rendered rects against recorded source aspects: growth SVG 918x69 vs viewBox 800x60 (13.30 vs 13.33, 0.2% off), warping 918x423 vs natural 2818x1297 (2.170 vs 2.173, 0.1% off), image-2 314x306 equals its natural 314x306 [JOURNAL.md entry 4 (rendered numbers) and docs/image_fit_reference.md ground-truth table (viewBox and naturalW x H)]" -> "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; rendered aspect 1170x538.5 vs natural 2818x1297 and 1170x87.8 vs viewBox 800x60"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; rendered aspect 1170x538.5 vs natural 2818x1297 and 1170x87.8 vs viewBox 800x60" -> "2026-09-30 A/B at 1500x950 vs stock on four reference files: identical img rects, max diff 0.0 px, 1170x538.5 vs natural 2818x1297, 1170x87.8 vs viewBox 800x60; Galata 'the image opens whole, at its aspect, and fits the host' asserts both fixtures keep the source aspect within 1%, 30/30 local"
- [x] `ACC-FIT-3` **Contain fit** - HIGH; when the source exceeds the host, the image touches the host on exactly one axis (`abs(img.w-host.clientW)<=2` OR `abs(img.h-host.clientH)<=2`) and exceeds neither
  - evidence: 2026-09-30 A/B vs stock on four reference files: identical img rects, max diff 0.0 px; Galata 'the image opens whole, at its aspect, and fits the host' checks the SVG half, red when the img width is capped; raster half has no CI spec: CI lacks jupyterlab_fit_image_size_extension
  - test: open an SVG and an oversized raster, assert one axis flush and neither overflowing
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:04Z @kj edited evidence "JOURNAL entry 4 records growth SVG 918x69 and warping 918x423 - both flush to the host width 918 on one axis and under the host height 853 on the other [JOURNAL.md entry 4; host 918x853 in docs/image_fit_reference.md]" -> "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; wide PNG and both SVGs flush to the host width 1170, under the host height 829"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; wide PNG and both SVGs flush to the host width 1170, under the host height 829" -> "2026-09-30 A/B vs stock on four reference files: identical img rects, max diff 0.0 px; Galata 'the image opens whole, at its aspect, and fits the host' checks the SVG half, red when the img width is capped; raster half has no CI spec: CI lacks jupyterlab_fit_image_size_extension"
  - log: 2026-11-07T12:21:31Z @kj the image fit rule of jupyterlab_fit_image_size_extension 1.0.9 moves into this extension's stylesheet; the raster half gets a Galata test whose server disables @stellarshenson/jupyterlab-fit-image-size-extension in its own page config, filed as ACC-FIT-125-STANDALONE
- [x] `ACC-FIT-4` **No raster upscaling** - HIGH; a raster smaller than the host renders at natural size (`img.w==naturalW`, `img.h==naturalH`, +-1px) and is not enlarged
  - evidence: 2026-09-30 A/B vs stock: image-2.png renders at its natural 314x306, max diff 0.0 px; Galata 'the image opens whole, at its aspect, and fits the host' asserts a 200x150 PNG renders at 200x150 within 1 px, 30/30 local
  - test: open a raster smaller than the host, compare rendered size against natural size
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:04Z @kj edited evidence "JOURNAL entry 4: "image-2 314x306 natural" - the rendered rect equals the recorded naturalW x H of 314 x 306, so the small raster is not enlarged [JOURNAL.md entry 4; stock table row "image-2.png | raster | 314 x 306 | 314 x 306" in docs/image_fit_reference.md]" -> "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; image-2.png renders at its natural 314x306, not enlarged"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; image-2.png renders at its natural 314x306, not enlarged" -> "2026-09-30 A/B vs stock: image-2.png renders at its natural 314x306, max diff 0.0 px; Galata 'the image opens whole, at its aspect, and fits the host' asserts a 200x150 PNG renders at 200x150 within 1 px, 30/30 local"
- [x] `ACC-FIT-5` **Position matches stock** - MEDIUM; the baseline image is top-left (`img.x~=host.x`, `img.y~=host.y`), never pushed to centre or bottom
  - evidence: spec 'the image opens at the top-left of the viewer, untransformed' passes (Galata 27/27 local 2026-09-30), red when the initial offset is 30px; A/B vs stock on the 4 reference files: img at the host origin in both
  - test: open each reference file, compare img origin against host origin
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-FIT-6` **Baseline transform identity** - HIGH; the extension inline transform at open is `translate(0px,0px) scale(1)` or `none`, with no naturalWidth-derived scale and no centering translate
  - evidence: spec 'the image opens at the top-left of the viewer, untransformed' asserts layer translate(0px, 0px) scale(1) (Galata 29/29 local 2026-09-30), red when the initial offset is 30px; A/B shows the same identity layer on all 4 reference files
  - test: open each reference file, read the pan layer inline transform
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:04Z @kj edited evidence "Passing jest assertion "applies the transform to the layer, never to the image": expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)') and expect(img.style.transform).toBe('') - 6/6 tests passed in the make test run just executed [/home/lab/workspace/private/jupyterlab/jupyterlab_advanced_image_viewer_extension/src/__tests__/controller.spec.ts lines 44-49; make test output "Tests: 6 passed, 6 total"]" -> "spec 'the image opens at the top-left of the viewer, untransformed' asserts layer translate(0px, 0px) scale(1) (Galata 29/29 local 2026-09-30), red when the initial offset is 30px; A/B shows the same identity layer on all 4 reference files"
- [x] `ACC-FIT-7` **SVG parity regression gate** - CRITICAL; `03_growth_models.svg` (viewBox 800x60) renders ~918x69 full width and fully visible, matching stock within 2px, not ~131px and not offset down
  - evidence: 2026-09-30 A/B vs stock: 03_growth_models.svg and 05_operations.svg both 1170x87.8 in both, max diff 0.0 px; Galata 'the image opens whole, at its aspect, and fits the host' asserts a viewBox 800x60 SVG fills the host width at 800:60, red when the img width is capped
  - test: open `03_growth_models.svg`, read the img rect, compare against the recorded stock numbers
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:04Z @kj edited evidence "JOURNAL entry 4: "growth SVG 918x69" against the recorded stock value 918 x 68.8, and the same entry records the pre-fix failure it replaces ("scale(0.66) translate(0,178px)" giving 131px, shoved down) [JOURNAL.md entry 4; stock row "03_growth_models.svg | viewBox 0 0 800 60 | 300 x 23 (bogus) | 918 x 68.8" in docs/image_fit_reference.md]" -> "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; 03_growth_models.svg and 05_operations.svg both 1170x87.8 in both"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; 03_growth_models.svg and 05_operations.svg both 1170x87.8 in both" -> "2026-09-30 A/B vs stock: 03_growth_models.svg and 05_operations.svg both 1170x87.8 in both, max diff 0.0 px; Galata 'the image opens whole, at its aspect, and fits the host' asserts a viewBox 800x60 SVG fills the host width at 800:60, red when the img width is capped"
- [x] `ACC-FIT-8` **Edge: viewBox-only SVG ignores bogus intrinsic size** - HIGH; an SVG that reports a misleading `naturalWidth/Height` still fits by CSS, and no criterion is computed from its natural size
  - evidence: 2026-09-30 A/B vs stock: viewBox-only SVGs report natural 300x23 yet render 1170x87.8, same as stock; Galata 'the image opens whole, at its aspect, and fits the host' asserts the viewBox-only fixture fills the host width at 800:60, red when the img width is capped
  - test: open a viewBox-only SVG, assert the rendered size follows the host, not naturalWidth
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 4: a viewBox="0 0 800 60" image "reports a bogus naturalWidth=300,Height=23" yet the rewritten controller "never reads naturalWidth" and the file renders 918x69, matching the stock CSS fit [JOURNAL.md entry 4; corroborated by the measured 300 x 23 bogus intrinsic versus 918 x 68.8 rendered in docs/image_fit_reference.md]" -> "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; the viewBox-only SVGs report natural 300x23 yet render 1170x87.8 (viewBox 800:60), same as stock"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950 vs stock (this extension disabled) on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects, max diff 0.0 px; the viewBox-only SVGs report natural 300x23 yet render 1170x87.8 (viewBox 800:60), same as stock" -> "2026-09-30 A/B vs stock: viewBox-only SVGs report natural 300x23 yet render 1170x87.8, same as stock; Galata 'the image opens whole, at its aspect, and fits the host' asserts the viewBox-only fixture fills the host width at 800:60, red when the img width is capped"
- [x] `ACC-FIT-44` **AVIF opens in the image viewer** - HIGH; a `.avif` file opens in the image viewer by default, from the file browser, with pan, zoom, the toolbar and the stock keys; arrow-key navigation includes it and the context menu offers Copy to Clipboard on it
  - evidence: 2026-10-05: Galata 'an avif file opens in the image viewer by default' passes, 31/31 local with and without the sort plugin; red when the avif file type or the raster entry is removed; the user's 01-04.avif (209x240) opens in an isolated server, screenshot checked
  - test: upload a 200x150 AVIF, double-click it, assert the viewer shows it at 200x150 inside the pan layer
  - test-tags: E2E
  - mechanism: 2026-10-05T16:18:12Z @kj stock JupyterLab registers no avif file type; the extension adds one (image/avif, base64) bound to the stock Image factory, and lists .avif among the image and raster extensions
  - log: 2026-10-05T16:18:12Z @kj added
  - log: 2026-10-05T16:34:20Z @kj closed
- [x] `ACC-FIT-125-STANDALONE` **Viewer fits without the fit extension** - CRITICAL; with @stellarshenson/jupyterlab-fit-image-size-extension absent, an image larger than the viewer still opens in the contain fit: whole, at its aspect, flush to the host on one axis (ACC-FIT-1, ACC-FIT-2, ACC-FIT-3)
  - evidence: Galata image_fit.spec.ts 'the image viewer fits an image larger than the panel' and 'the fit rule comes from this extension alone' passed: logs/fit-named.log 37/37, logs/fit-suite.log 171/171, fit extension disabled in the test server, red without style/fit.css (logs/fit-red.log); A/B fit extension on vs off: 3000x2000 viewer image 1069.98x713.33 in both (tmp/workflows/image-fit/03-verify.json)
  - test: Galata server with @stellarshenson/jupyterlab-fit-image-size-extension disabled in its own page config; open generated 3000x300 and 300x3000 PNGs; assert each img rect inside the host rect, flush to host width or height within 2px, aspect within 1%
  - test-tags: E2E
  - mechanism: 2026-11-07T12:21:15Z @kj the .jp-ImageViewer img rule of jupyterlab_fit_image_size_extension 1.0.9 (max-width and max-height 100%, width and height auto, object-fit contain, all !important) ships verbatim in this extension's stylesheet; stock JupyterLab 4.6 has no fit rule for the viewer
  - log: 2026-11-07T12:21:15Z @kj added
  - log: 2026-11-07T13:32:36Z @kj closed: closed: whole Galata suite 171/171 with the fit extension disabled in the test server
- [x] `ACC-FIT-126-OUTPUT-IMG` **Notebook output image fits the output width** - HIGH; a raster image in a notebook output renders min(naturalW, output width) wide with its aspect kept: an image wider than the output shrinks to the output width, a narrower one keeps its natural size
  - evidence: Galata image_fit.spec.ts 'a notebook PNG output fits the output width' passed: logs/fit-named.log 37/37, logs/fit-suite.log 171/171, fit extension disabled in the test server, red without style/fit.css (logs/fit-red.log); A/B fit extension on vs off: 3000x2000 output PNG 967.98x645.33 of 968 wide, 200x150 kept, in both (tmp/workflows/image-fit/03-verify.json)
  - test: run a cell displaying a generated 3000x300 PNG and a 200x150 PNG; assert the large img rect is the .jp-OutputArea-output content width wide within 2px and 10:1 within 1%, the small img rect 200x150 within 1px
  - test-tags: E2E
  - mechanism: 2026-11-07T12:21:27Z @kj stock JupyterLab 4.6 .jp-RenderedImage img already sets max-width 100%, height auto; the migrated .jp-OutputArea-output img and .jp-RenderedImage img rules repeat it with !important, which also overrides the stock max-width: none of an unconfined image
  - log: 2026-11-07T12:21:27Z @kj added
  - log: 2026-11-07T13:32:36Z @kj closed: closed: whole Galata suite 171/171 with the fit extension disabled in the test server
- [x] `ACC-FIT-127-OUTPUT-SVG` **Notebook SVG output fits the output width** - HIGH; an SVG in a notebook output renders min(SVG width, output width) wide with its viewBox aspect kept: an SVG wider than the output shrinks to the output width, a narrower one keeps its size
  - evidence: Galata image_fit.spec.ts 'a notebook SVG output fits the output width' passed: logs/fit-named.log 37/37, logs/fit-suite.log 171/171, fit extension disabled in the test server, red without style/fit.css (logs/fit-red.log); A/B fit extension on vs off: 3000x300 SVG output 967.97x96.80 in both (tmp/workflows/image-fit/03-verify.json)
  - test: run a cell displaying generated SVGs of width 3000 height 300 viewBox 0 0 3000 300 and width 200 height 150; assert the large img rect is the .jp-OutputArea-output content width wide within 2px and 10:1 within 1%, the small img rect 200x150 within 1px
  - test-tags: E2E
  - mechanism: 2026-11-07T12:21:27Z @kj JupyterLab 4.6 renders an SVG output as an <img> inside .jp-RenderedSVG, which no stock rule fits; the migrated .jp-OutputArea-output img rule is its only fit
  - log: 2026-11-07T12:21:27Z @kj added
  - log: 2026-11-07T13:32:36Z @kj closed: closed: whole Galata suite 171/171 with the fit extension disabled in the test server
- [x] `ACC-FIT-128-MARKDOWN-IMG` **Markdown cell image fits the cell width** - HIGH; an image in a rendered markdown cell renders min(naturalW, cell width) wide with its aspect kept: an image wider than the cell shrinks to the cell width, a narrower one keeps its natural size
  - evidence: Galata image_fit.spec.ts 'a markdown cell image fits the cell width' passed: logs/fit-named.log 37/37, logs/fit-suite.log 171/171, fit extension disabled in the test server; A/B fit extension on vs off: 3000x2000 markdown image 940.98x627.33 in both (tmp/workflows/image-fit/03-verify.json)
  - test: upload a generated 3000x300 PNG and a 200x150 PNG, render a markdown cell showing both; assert the large img rect is the .jp-RenderedMarkdown content width wide within 2px and 10:1 within 1%, the small img rect 200x150 within 1px
  - test-tags: E2E
  - mechanism: 2026-11-07T12:21:27Z @kj stock JupyterLab 4.6 .jp-RenderedHTMLCommon img already sets max-width 100%, height auto; the migrated .jp-RenderedMarkdown img rule repeats it with !important
  - log: 2026-11-07T12:21:27Z @kj added
  - log: 2026-11-07T13:32:36Z @kj closed: closed: whole Galata suite 171/171 with the fit extension disabled in the test server
- [x] `ACC-FIT-129-HTML-IMG` **HTML output image fits the output width** - MEDIUM; an <img> in an HTML output renders min(naturalW, output width) wide with its aspect kept: an image wider than the output shrinks to the output width, a narrower one keeps its natural size
  - evidence: Galata image_fit.spec.ts 'an HTML output image fits the output width' passed: logs/fit-named.log 37/37, logs/fit-suite.log 171/171, fit extension disabled in the test server; A/B fit extension on vs off: 3000x2000 HTML output image 948x632 in both (tmp/workflows/image-fit/03-verify.json)
  - test: run a cell displaying HTML with <img> tags of a generated 3000x300 PNG and a 200x150 PNG; assert the large img rect is the .jp-OutputArea-output content width wide within 2px and 10:1 within 1%, the small img rect 200x150 within 1px
  - test-tags: E2E
  - mechanism: 2026-11-07T12:21:27Z @kj stock JupyterLab 4.6 .jp-RenderedHTMLCommon img already sets max-width 100%, height auto; the migrated .jp-RenderedHTMLCommon img and .jp-OutputArea-output img rules repeat it with !important
  - log: 2026-11-07T12:21:27Z @kj added
  - log: 2026-11-07T13:32:36Z @kj closed: closed: whole Galata suite 171/171 with the fit extension disabled in the test server

## Zoom `ZOOM`

Cursor-anchored wheel zoom and toolbar zoom, in and out, with no floor at the fit scale

- [x] `ACC-ZOOM-9` **Wheel up zooms in** - HIGH; scrolling the wheel up over the image increases the rendered scale above baseline
  - evidence: specs 'stock rotate composes with our zoom' (wheel up gives scale 1.x) and 'zoom in stops at a maximum' pass (Galata 29/29 local 2026-09-30)
  - test: open an image, wheel up once, compare rendered size against baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 4: "zoom-in 1.0->1.61"; the Galata spec dispatches a wheel event with deltaY -120 and asserts expect(layerStyle).toMatch(/scale\(1\.[0-9]/), and entry 9 records the 1.0.5 Build "fully green (build, test_isolated, integration-tests, check-links)" [JOURNAL.md entries 4 and 9; ui-tests/tests/advanced_image_viewer.spec.ts lines 86-99]" -> "specs 'stock rotate composes with our zoom' (wheel up gives scale 1.x) and 'zoom in stops at a maximum' pass (Galata 29/29 local 2026-09-30)"
- [x] `ACC-ZOOM-10` **Toolbar plus zooms in** - HIGH; clicking the zoom-in toolbar button increases scale by the configured `zoomStep`
  - evidence: spec 'toolbar plus and minus step the zoom' passes (Galata 29/29 local 2026-09-30; + gives 1.1 then 1.21), red when + steps by twice zoomStep
  - test: click the + button once, assert the scale delta equals zoomStep
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "Passing jest assertion c.zoomIn() then expect(layer.style.transform).toContain('scale(1.1)') with the controller constructed at zoomStep 0.1, and JOURNAL entry 5 records the measured toolbar sequence "wheel and toolbar +/-/Fit zoom (1.0->1.21->1.10->1.0)" [src/__tests__/controller.spec.ts lines 51-58 (6/6 passing in the make test run); JOURNAL.md entry 5]" -> "spec 'toolbar plus and minus step the zoom' passes (Galata 29/29 local 2026-09-30; + gives 1.1 then 1.21), red when + steps by twice zoomStep"
- [x] `ACC-ZOOM-11` **Cursor-anchored** - MEDIUM; wheel zoom keeps the point under the cursor approximately fixed, within a few px before and after a step
  - evidence: spec 'wheel zoom keeps the point under the cursor fixed' passes (Galata 27/27 local 2026-09-30), red when the wheel zooms about the viewer centre
  - test: note the pixel under the pointer, wheel one step, re-measure that pixel position
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:21:02Z @kj narrowed by the clamp: the point under the cursor cannot stay fixed on a zoom step where the clamp fires, which is entailed by ACC-PAN-38 and ACC-PAN-39; it holds on every step where the requested offset stays in range
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-ZOOM-12` **Upper bound** - MEDIUM; zoom-in saturates at a sane maximum with no infinite growth and no NaN, and the image stays rendered
  - evidence: spec 'zoom in stops at a maximum and the image stays rendered' passes (Galata 27/27 local 2026-09-30), red when the cap is raised to 1e9
  - test: wheel up far past the cap, assert scale stops at the cap and the img rect is finite
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-ZOOM-13` **Wheel down zooms out** - HIGH; scrolling the wheel down decreases the rendered scale
  - evidence: spec 'zoom out stops above zero with the image visible' passes (Galata 29/29 local 2026-09-30; 200 wheel-down notches reach a scale below 1)
  - test: open an image, wheel down once, compare rendered size against baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 4: "zoom-out to 0.239 below fit", and the passing jest test computes the layer scale after c.zoomOut() and asserts expect(scale).toBeLessThan(1) [JOURNAL.md entry 4; src/__tests__/controller.spec.ts lines 60-66]" -> "spec 'zoom out stops above zero with the image visible' passes (Galata 29/29 local 2026-09-30; 200 wheel-down notches reach a scale below 1)"
- [x] `ACC-ZOOM-14` **Toolbar minus zooms out** - HIGH; clicking zoom-out decreases scale by `zoomStep`
  - evidence: spec 'toolbar plus and minus step the zoom' passes (Galata 29/29 local 2026-09-30; - from 1.21 gives 1.1), red when + steps by twice zoomStep
  - test: click the - button once, assert the scale delta equals zoomStep
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 5 records the measured toolbar step down: "toolbar +/-/Fit zoom (1.0->1.21->1.10->1.0)" - 1.21 to 1.10 is one division by the configured zoomStep factor 1.1 [JOURNAL.md entry 5]" -> "spec 'toolbar plus and minus step the zoom' passes (Galata 29/29 local 2026-09-30; - from 1.21 gives 1.1), red when + steps by twice zoomStep"
- [x] `ACC-ZOOM-15` **Below-fit zoom-out is unlimited** - HIGH; zoom-out goes below the fit baseline (effective scale < 1, image smaller than fitted) with no floor at the fit scale, bottoming out only at a small epsilon
  - evidence: spec 'zoom out stops above zero with the image visible' passes (Galata 29/29 local 2026-09-30; floor below 1 with the image at least 5px each side), red when the floor is 1e-9
  - test: wheel down repeatedly, assert the scale falls below 1 and stops at the epsilon, not at 1
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 4: "removed the fit-scale floor so zoom-out is unlimited (MIN_SCALE=0.05)" with the measured "zoom-out to 0.239 below fit", repeated as "unlimited zoom-out below fit (0.239)" in entry 5 [JOURNAL.md entries 4 and 5; MIN_SCALE = 0.05 at src/controller.ts line 10]" -> "spec 'zoom out stops above zero with the image visible' passes (Galata 29/29 local 2026-09-30; floor below 1 with the image at least 5px each side), red when the floor is 1e-9"
- [x] `ACC-ZOOM-16` **Stays visible when zoomed out** - MEDIUM; at any zoom-out level the image remains within and visible in the host, never clipped to nothing
  - evidence: spec 'zoom out stops above zero with the image visible' passes (Galata 27/27 local 2026-09-30; at least 5px each side), red when the floor is 1e-9
  - test: wheel down to the epsilon, assert the img rect is non-zero and inside the host
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:02Z @kj closed

## Reset `RESET`

The Fit control returns the view to the untouched baseline from any state

- [x] `ACC-RESET-17` **Reset returns to baseline** - HIGH; the Fit action restores exactly the identity baseline and the same rendered rect as a freshly opened image, from any zoom or pan state
  - evidence: spec 'Fit returns the image to its opening position' passes (Galata 29/29 local 2026-09-30; after a drag and 3 zoom steps), red when reset leaves a 40px offset
  - test: zoom and pan, click Fit, compare the img rect and inline transform against the baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "Passing jest assertion: after c.zoomIn(), c.reset() gives expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)'), and JOURNAL entry 5 records the measured Fit step "1.10->1.0" [src/__tests__/controller.spec.ts lines 51-58; JOURNAL.md entries 4 ("reset to identity") and 5]" -> "spec 'Fit returns the image to its opening position' passes (Galata 29/29 local 2026-09-30; after a drag and 3 zoom steps), red when reset leaves a 40px offset"

## Pan `PAN`

Drag to move the image at any zoom, bounded so the image can touch a viewport border but never leave it or expose a gap

- [x] `ACC-PAN-18` **Drag pans at any zoom** - HIGH; press-and-drag moves the image at every scale, including at fit
  - evidence: 2026-09-23 isolated JupyterLab 4.6.4 running 1.1.1, 800x300 PNG: a +50,+50 drag at fit moved the pan layer from translate(0px, 0px) to translate(50px, 50px); at scale 1.4641 (four toolbar + clicks) the same drag moved it from translate(123.239px, 169.164px) to translate(173.239px, 219.164px); Galata drag specs green in CI run 35884503553
  - related: ACC-PAN-38, ACC-PAN-39 - the clamp that bounds this drag
  - test: at fit and at scale 1.5, drag 50px and read the pan layer transform
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T08:59:47Z @kj the 1.0.7 free-slide wording (unclamped offsets, no snap-back) is superseded by ACC-PAN-38 and ACC-PAN-39; dragging at any zoom stays true, the range is now bounded
  - log: 2026-09-02T12:21:02Z @kj held open: recorded evidence is from shipped 1.0.11, whose pan was unbounded; the uncommitted clamp changes the behaviour this was measured against, so it needs re-verification in a browser before it closes
  - log: 2026-09-23T16:13:56Z @kj closed
- [x] `ACC-PAN-19` **Grab cursor always** - MEDIUM; the viewer shows the `grab` cursor at rest and `grabbing` while dragging, regardless of zoom level
  - evidence: spec 'the cursor is grab at rest and grabbing while dragging' passes (Galata 27/27 local 2026-09-30), red when the cursor is forced to default
  - test: read the computed cursor at fit, during a drag, and while zoomed
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-PAN-20` **Fit recenters** - MEDIUM; the Fit action is the way back to the baseline position after any drag
  - evidence: spec 'Fit returns the image to its opening position' passes (Galata 27/27 local 2026-09-30), red when reset leaves a 40px offset
  - test: drag away from the baseline, click Fit, compare the img rect against the baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T08:59:47Z @kj Fit stays the way back to baseline, but is no longer the only guard against a lost image; the clamp in ACC-PAN-38 and ACC-PAN-39 is
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-PAN-38` **Small image never leaves the viewport** - HIGH; when the rendered image is smaller than the viewport on an axis, drag moves it until its edge is flush with a viewport border on that axis and no further, so no part of the image leaves the visible area
  - evidence: spec 'a small image drags flush to a border and no further' passes (Galata 27/27 local 2026-09-30; CI 9/9 on c20ff79)
  - test: at fit with a 120x80 raster in a ~918x853 host, drag 2000px in each direction, assert the img rect stays inside the host rect (+-1px) and reaches flush on the dragged edge
  - test-tags: UNIT, E2E
  - mechanism: 2026-09-02T12:21:02Z @kj the clamp is measured, not derived: apply() writes the transform, reads the host and img bounding rects, and adds the per-axis correction that keeps a smaller image inside the host and a larger one covering it, because the centre-origin layer scale and the stock rotate or flip move the rendered bounds away from any 0-to-(host minus image) offset formula
  - mechanism: 2026-09-02T08:59:30Z @kj one clamp per axis: the pan offset is held inside the interval between 0 and (host - image), which covers both regimes with a single formula because the baseline image renders top-left
  - log: 2026-09-02T08:59:30Z @kj added
  - log: 2026-09-02T12:21:02Z @kj implemented in src/controller.ts as an invariant inside apply(); jest suite green, 15 tests, controller.ts 93 percent statements; browser verification still outstanding
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-PAN-39` **Large image keeps covering the viewport** - HIGH; when the rendered image is larger than the viewport on an axis, drag moves it until its edge is flush with a viewport border and never inside it, so no empty gap can be dragged in
  - evidence: spec 'a zoomed image keeps covering the viewport when dragged' passes (Galata 27/27 local 2026-09-30; CI 9/9 on c20ff79)
  - test: zoom past fit, drag 2000px in each direction, assert the host rect stays fully covered on that axis and the image edge reaches flush
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:59:30Z @kj added
  - log: 2026-09-02T12:21:02Z @kj implemented in src/controller.ts as an invariant inside apply(); jest suite green, 15 tests, controller.ts 93 percent statements; browser verification still outstanding
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-PAN-40` **Zoom-out snaps an out-of-range offset back** - HIGH; after zooming in, panning to a limit and zooming back out, the offset is re-clamped as the legal range shrinks, so the image never stays outside it; the clamp is an invariant, not only a drag-time limit
  - evidence: spec 'zooming out snaps an out-of-range offset back into range' passes (Galata 27/27 local 2026-09-30; CI 9/9 on c20ff79)
  - related: ACC-PAN-38, ACC-PAN-39 - the two rules this re-applies when the range changes
  - test: zoom to 3x, drag to a corner limit, zoom back to fit, assert the img rect is inside the host rect (+-1px) without touching Fit
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:59:30Z @kj added
  - log: 2026-09-02T12:21:02Z @kj implemented in src/controller.ts as an invariant inside apply(); jest suite green, 15 tests, controller.ts 93 percent statements; browser verification still outstanding
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-PAN-41` **Edge: panel resize re-clamps** - MEDIUM; resizing the panel changes the legal range, and the stored offset is re-clamped against the new one, so the image never sits outside its range after a resize
  - evidence: spec 'shrinking the panel re-clamps the image' passes (Galata 27/27 local 2026-09-30), red without the ResizeObserver on the viewer
  - test: pan to a limit, resize the browser window smaller and larger, assert the clamp holds after each resize
  - test-tags: E2E
  - log: 2026-09-02T08:59:30Z @kj added
  - log: 2026-09-02T12:21:02Z @kj implemented in src/controller.ts as an invariant inside apply(); jest suite green, 15 tests, controller.ts 93 percent statements; browser verification still outstanding
  - log: 2026-09-30T14:20:03Z @kj closed
- [x] `ACC-PAN-42` **Edge: reload of a differently sized image re-clamps** - MEDIUM; refreshing to an image of a different rendered size re-clamps the stored offset against the new size rather than keeping an offset that was legal for the old one
  - evidence: spec 'refreshing to a larger image re-clamps the image' passes (Galata 27/27 local 2026-09-30), red without the image load listener
  - related: ACC-NAV-27 - the refresh that loads the new size
  - test: pan to a limit, swap the file on disk for a differently sized image, click refresh, assert the clamp holds
  - test-tags: E2E
  - log: 2026-09-02T08:59:30Z @kj added
  - log: 2026-09-02T12:21:02Z @kj implemented in src/controller.ts as an invariant inside apply(); jest suite green, 15 tests, controller.ts 93 percent statements; browser verification still outstanding
  - log: 2026-09-30T14:20:03Z @kj closed
- [x] `ACC-PAN-43` **Edge: rotated or flipped image clamps on its rendered bounds** - MEDIUM; after a stock rotate or flip the clamp is computed from what is actually rendered, so a rotated image can still be dragged flush to a border and no further
  - evidence: spec 'a rotated image clamps on its rendered bounds' passes (Galata 27/27 local 2026-09-30; CI 9/9 on c20ff79)
  - mechanism: 2026-09-02T12:21:02Z @kj getBoundingClientRect on the img already includes the stock rotate and flip, so the clamp reads rendered bounds for free; the trigger is a MutationObserver on the img style attribute, because a stock transform changes no layout box and fires neither the ResizeObserver nor a load event
  - related: ACC-STOCK-35 - the stock transforms this must compose with
  - test: rotate with ] so the rendered bounds swap axes, drag 2000px each way, assert the same containment or coverage rule holds
  - test-tags: E2E
  - log: 2026-09-02T08:59:30Z @kj added
  - log: 2026-09-02T12:21:02Z @kj implemented in src/controller.ts as an invariant inside apply(); jest suite green, 15 tests, controller.ts 93 percent statements; browser verification still outstanding
  - log: 2026-09-30T14:20:02Z @kj closed

## Folder navigation `NAV`

Left and Right arrows step through the images in the same folder inside one viewer tab

- [x] `ACC-NAV-21` **Arrow keys advance** - HIGH; Left and Right open the previous and next image in the same folder, in the order the file browser lists them when it shows that folder, natural name order otherwise
  - evidence: 2026-09-30 isolated JupyterLab 4.6.4 with the sorting plugin: Right, Right, Left, Left in the deck folder follow the listed order; Galata 'arrow keys follow the order the file browser shows' (Right, reversed sort) and 'navigation stops at the first and the last image' (Left) pass, 30/30 local
  - test: open the middle image of a folder, press Right then Left, assert the paths
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T12:11:28Z @kj amended text "Left and Right open the previous and next image in the same folder, ordered naturally" -> "HIGH; Left and Right open the previous and next image in the same folder, in the order the file browser lists them when it shows that folder, natural name order otherwise"
  - log: 2026-09-30T12:11:28Z @kj reopened: reopened: order rule changed by DEF-NAV-1; the 1.0.11 evidence covers the old natural-order wording; evidence retired: JOURNAL entry 5 (v0.4.7): "real Left/Right arrow keys advancing within one tab (viewer focusable, confirmed both directions)" [JOURNAL.md entry 5; entry 4 records the same for ArrowRight]
  - log: 2026-09-30T12:11:28Z @kj closed
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 isolated JupyterLab 4.6.4 with jupyterlab_file_browser_sorting_extension: from 01-two-repeating-loops-beautified.svg, Right, Right, Left, Left visit beautified_print, loops, beautified_print, beautified in the listed order; with the name sort reversed, Right from aiv-nav-2.svg opens aiv-nav-1.svg; Galata spec 'arrow keys follow the order the file browser shows' added" -> "2026-09-30 isolated JupyterLab 4.6.4 with the sorting plugin: Right, Right, Left, Left in the deck folder follow the listed order; Galata 'arrow keys follow the order the file browser shows' (Right, reversed sort) and 'navigation stops at the first and the last image' (Left) pass, 30/30 local"
- [x] `ACC-NAV-22` **Single tab, no stacking** - HIGH; navigating does not increase the open image-tab count, so one image tab advances
  - evidence: spec 'navigation skips files that are not images' asserts one image tab after the step (Galata 29/29 local 2026-09-30), red when the previous tab is not disposed
  - test: count image tabs before and after three navigations
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 4: "ArrowRight advances within a single tab", and entry 5: "Left/Right arrow keys advancing within one tab" - the tab count does not grow because "nav opens next image and disposes the previous widget so one tab advances" [JOURNAL.md entries 4 and 5]" -> "spec 'navigation skips files that are not images' asserts one image tab after the step (Galata 29/29 local 2026-09-30), red when the previous tab is not disposed"
- [x] `ACC-NAV-23` **File browser untouched** - MEDIUM; navigation never moves the file browser to another folder or changes its selection; JupyterLab itself selects each image it opens when the browser lists that image's folder
  - evidence: spec 'navigation leaves the file browser folder and selection alone' passes (Galata 27/27 local 2026-09-30), red when navigation moves the browser to the root folder
  - test: open 1 of 3 images, move the file browser to the parent folder, press Right twice, assert its folder and selection are unchanged
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T13:56:18Z @kj amended text "navigation does not change the file browser selection or current directory" -> "MEDIUM; navigation does not change the file browser's current folder, and leaves its selection to JupyterLab, which selects each image it opens in the listed folder"; reason: measured 2026-09-30 on JupyterLab 4.6.4 with every other extension disabled: a plain docmanager:open of a file in the listed folder selects that file, so the old wording 'does not change the selection' cannot hold for any opener
  - log: 2026-09-30T13:56:18Z @kj edited test "note the file browser path and selection, navigate twice, re-read both" -> "open 1 of 3 images, press Right twice, assert the folder is unchanged and only the opened image is selected"
  - log: 2026-09-30T14:12:08Z @kj amended text "navigation does not change the file browser's current folder, and leaves its selection to JupyterLab, which selects each image it opens in the listed folder" -> "MEDIUM; navigation never moves the file browser to another folder or changes its selection; JupyterLab itself selects each image it opens when the browser lists that image's folder"
  - log: 2026-09-30T14:12:08Z @kj edited test "open 1 of 3 images, press Right twice, assert the folder is unchanged and only the opened image is selected" -> "open 1 of 3 images, move the file browser to the parent folder, press Right twice, assert its folder and selection are unchanged"
  - log: 2026-09-30T14:20:03Z @kj closed
- [x] `ACC-NAV-24` **Ends clamp** - MEDIUM; at the first and last image, previous and next respectively are a no-op with no wrap and no error
  - evidence: 2026-09-30: Galata 'navigation stops at the first and the last image' passes, 30/30 local: Left on the first and Right on the last keep the tab, open no dialog and log no error naming the extension; red when navigation wraps around
  - test: open the first image, press Left, assert the path is unchanged and no error is raised
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:03Z @kj closed
  - log: 2026-09-30T15:17:53Z @kj edited evidence "spec 'navigation stops at the first and the last image' passes (Galata 27/27 local 2026-09-30), red when navigation wraps around" -> "2026-09-30: Galata 'navigation stops at the first and the last image' passes, 30/30 local: Left on the first and Right on the last keep the tab, open no dialog and log no error naming the extension; red when navigation wraps around"
- [x] `ACC-NAV-25` **Image files only** - MEDIUM; only png, jpg, jpeg, gif, bmp, svg, webp and avif files participate, and other files in the folder are skipped
  - evidence: 2026-10-05: Galata 'navigation skips files that are not images' passes, 31/31 local: Right from a.svg skips b.txt, opens c.webp, then d.avif, one image tab; red when .txt counts as an image and when .avif is removed from the image list
  - test: place a .txt between two images, navigate across it, assert it is skipped
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:03Z @kj closed
  - log: 2026-10-05T16:18:12Z @kj amended text "only png, jpg, jpeg, gif, bmp, svg and webp files participate, and other files in the folder are skipped" -> "MEDIUM; only png, jpg, jpeg, gif, bmp, svg, webp and avif files participate, and other files in the folder are skipped"; reason: AVIF support added 2026-10-05
  - log: 2026-10-05T16:34:20Z @kj edited evidence "spec 'navigation skips files that are not images' passes (Galata 27/27 local 2026-09-30; .txt skipped, .webp included), red when .txt counts as an image" -> "2026-10-05: Galata 'navigation skips files that are not images' passes, 31/31 local: Right from a.svg skips b.txt, opens c.webp, then d.avif, one image tab; red when .txt counts as an image and when .avif is removed from the image list"
- [x] `ACC-NAV-26` **Copy to clipboard for raster** - MEDIUM; the image-viewer context menu offers Copy to Clipboard on raster images and hides it on SVG, copying source pixels as PNG rather than the on-screen view
  - evidence: 2026-09-30: Galata 'Copy to Clipboard is offered on a PNG and hidden on an SVG' passes, 30/30 local: after toolbar + the clipboard PNG is 200x150, the source size; the SVG menu opens without the item; red when the copy takes the on-screen size
  - test: right-click a PNG and an SVG, assert the item is visible then hidden, and read the clipboard back after clicking it
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 12 (v1.0.9): "Verified live via Playwright: item visible on image-2.png, lm-mod-hidden on the SVG, and a real menu click overwrote a seeded sentinel with a 219 KB image/png (confirmed by clipboard read-back)" [JOURNAL.md entry 12; commit f61484d "feat: copy raster image to clipboard from context menu"]" -> "spec 'Copy to Clipboard is offered on a PNG and hidden on an SVG' passes (Galata 29/29 local 2026-09-30; image/png read back from the clipboard), red when the item shows on an SVG"
  - log: 2026-09-30T15:17:53Z @kj edited evidence "spec 'Copy to Clipboard is offered on a PNG and hidden on an SVG' passes (Galata 29/29 local 2026-09-30; image/png read back from the clipboard), red when the item shows on an SVG" -> "2026-09-30: Galata 'Copy to Clipboard is offered on a PNG and hidden on an SVG' passes, 30/30 local: after toolbar + the clipboard PNG is 200x150, the source size; the SVG menu opens without the item; red when the copy takes the on-screen size"
- [x] `ACC-NAV-27` **Refresh reloads from disk** - MEDIUM; the toolbar refresh button reloads the image from disk in place, without closing the tab
  - evidence: spec 'refreshing to a larger image re-clamps the image' passes (Galata 29/29 local 2026-09-30; naturalWidth 200 to 400 in the same tab after the refresh button)
  - test: change the file on disk, click refresh, assert naturalWidth changes to the new content
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:41Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 13 (v1.0.11): "Verified live via Playwright: raster reload 120x80 <-> 300x200 and SVG viewBox 400x100 -> 200x300, with the jp-AdvancedImageViewer-panlayer wrapper, single <img>, grab cursor and scale(1.4641) zoom all surviving" [JOURNAL.md entry 13; commit d71f946 "feat: add refresh button to image viewer toolbar"]" -> "spec 'refreshing to a larger image re-clamps the image' passes (Galata 29/29 local 2026-09-30; naturalWidth 200 to 400 in the same tab after the refresh button)"

## Settings `SET`

The settings schema exposes navigation and zoom-step, and changes take effect live

- [x] `ACC-SET-28` **Schema present** - MEDIUM; the extension contributes a settings schema with `navEnabled` and `zoomStep`, and the navigation keys are fixed Left and Right rather than a setting
  - evidence: spec 'the settings schema holds navEnabled and zoomStep only' passes (Galata 27/27 local 2026-09-30; keys fixed to ArrowLeft/ArrowRight), red when a key property is added to the schema
  - test: open Settings, assert both fields are listed and no key fields are
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:03Z @kj closed
- [x] `ACC-SET-29` **navEnabled toggles** - MEDIUM; with `navEnabled=false` the arrow keys do nothing
  - evidence: spec 'turning navEnabled off stops the arrow keys' passes (Galata 27/27 local 2026-09-30), red when the setting is ignored
  - test: set navEnabled false, press Right, assert the path is unchanged
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:03Z @kj closed
- [x] `ACC-SET-30` **zoomStep applies** - MEDIUM; changing `zoomStep` changes the per-step zoom delta
  - evidence: spec 'zoomStep sets the toolbar zoom step' passes (Galata 27/27 local 2026-09-30; + gives scale 1.25 at 0.25), red when the setting is ignored
  - test: set zoomStep to 0.25, click +, assert the scale delta matches
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:03Z @kj closed

## Health `HEALTH`

The extension installs cleanly and adds no regression against the stock viewer

- [x] `ACC-HEALTH-31` **Labextension OK** - CRITICAL; `jupyter labextension list` shows the extension enabled OK
  - evidence: 2026-09-30 jupyter labextension list: jupyterlab_advanced_image_viewer_extension enabled OK; CI build job greps the same line (green on c20ff79)
  - test: run `jupyter labextension list` and grep the extension name
  - test-tags: FUNCTIONAL
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:42Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "JOURNAL entry 3: "jupyter labextension list shows v0.1.1 enabled OK", and entry 9 records the 1.0.5 Build "fully green (build, test_isolated, integration-tests, check-links)" where the Galata spec asserts the activation console message appears exactly once [JOURNAL.md entries 3 and 9; ui-tests/tests/jupyterlab_advanced_image_viewer_extension.spec.ts lines 15-24]" -> "2026-09-30 jupyter labextension list: jupyterlab_advanced_image_viewer_extension enabled OK; CI build job greps the same line (green on c20ff79)"
- [x] `ACC-HEALTH-32` **No fit regression against stock** - HIGH; the fit criteria match the stock reference numbers in `image_fit_reference.md` within tolerance for all four reference files
  - evidence: 2026-09-30 A/B at 1500x950, extension enabled vs disabled, on four reference files: identical img rects (max diff 0.0 px), contain fit, top-left, layer translate(0px, 0px) scale(1); no CI spec, the reference files exist only on this workstation
  - test: run the fit assertions on all four reference files and diff against the recorded stock numbers
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:02Z @kj closed
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-30 A/B at 1500x950, extension enabled vs disabled, on image-warping-correction-2.png, image-2.png, 03_growth_models.svg, 05_operations.svg: identical img rects (max diff 0.0 px), contain fit, top-left, layer translate(0px, 0px) scale(1)" -> "2026-09-30 A/B at 1500x950, extension enabled vs disabled, on four reference files: identical img rects (max diff 0.0 px), contain fit, top-left, layer translate(0px, 0px) scale(1); no CI spec, the reference files exist only on this workstation"
- [x] `ACC-HEALTH-33` **No new console errors** - MEDIUM; opening an image and zooming, panning or navigating produces no new uncaught errors attributable to the extension
  - evidence: spec 'an interaction pass raises no error from the extension' passes (Galata 27/27 local 2026-09-30; zoom, pan, toolbar, refresh, stock keys, navigation), red when the wheel handler logs an error
  - test: capture the console during a full interaction pass and diff the error set against a stock session
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:03Z @kj closed

## Stock keybinding coexistence `STOCK`

The standard image-viewer keys keep working, and this extension composes with them

- [x] `ACC-STOCK-34` **Stock keybindings work** - HIGH; `]` and `[` rotate clockwise and counter-clockwise, `h` and `v` flip horizontal and vertical, `0` resets stock orientation and `i` inverts colours, each updating the image's own transform
  - evidence: spec 'the stock keys rotate, flip, invert and reset the image' passes (Galata 27/27 local 2026-09-30), red when apply() clears the img transform
  - test: press each key and read `img.style.transform` and `img.style.filter`
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-30T14:20:02Z @kj closed
- [x] `ACC-STOCK-35` **Functionality composes after stock keys** - HIGH; after any stock keybinding, wheel and toolbar zoom, drag-pan and Fit all still operate while the rotation or flip stays applied, with the stock image transform and the pan-layer transform not clobbering each other
  - evidence: 2026-09-23 isolated JupyterLab 4.6.4, 800x300 PNG: after ] the img keeps matrix(0, 1, -1, 0, 0, 0) through wheel zoom, toolbar +, drag and Fit, which resets the layer to translate(0px, 0px) scale(1); Galata 'stock rotate composes with our zoom (transforms do not clobber)' asserts the same, 30/30 local 2026-09-30
  - test: rotate with `]`, then zoom, pan and Fit, asserting both transforms survive each step
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:21:02Z @kj held open: wrapping the img in the pan layer dropped the stock transform-origin top left, because .jp-ImageViewer > img is a direct-child selector, so rotate and flip pivoted from the centre in 1.0.7 through 1.0.11; restated on .jp-AdvancedImageViewer-panlayer > img in style/base.css and awaiting browser re-verification
  - log: 2026-09-23T16:13:56Z @kj closed
  - log: 2026-09-30T15:17:53Z @kj edited evidence "2026-09-23 isolated JupyterLab 4.6.4 running 1.1.1, 800x300 PNG: after ] the img keeps scale(1) matrix(0, 1, -1, 0, 0, 0) translate(0%, -100%) with transform-origin 0px 0px through wheel zoom (layer scale 1.1), toolbar + (scale 1.21), a -40,+30 drag (ty +30, tx held by the clamp at the left border) and Fit (layer back to translate(0px, 0px) scale(1)); the rotated rect is anchored at the host top-left" -> "2026-09-23 isolated JupyterLab 4.6.4, 800x300 PNG: after ] the img keeps matrix(0, 1, -1, 0, 0, 0) through wheel zoom, toolbar +, drag and Fit, which resets the layer to translate(0px, 0px) scale(1); Galata 'stock rotate composes with our zoom (transforms do not clobber)' asserts the same, 30/30 local 2026-09-30"

## Help link `HELP`

A help link on the toolbar lists the controls this extension adds and the stock keys it composes with

- [x] `ACC-HELP-36` **Accent help link** - LOW; the toolbar shows a help link, not a "?" button, rendered in the accent colour at the right end of the toolbar
  - evidence: spec 'wraps the image in a pan layer and shows an accent help link' passes (Galata 29/29 local 2026-09-30; link text help, colour equals --jp-brand-color1)
  - test: read the link element and its computed colour against the resolved brand colour
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:42Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "Galata spec asserts expect(help).toHaveText('help') on .jp-AdvancedImageViewer-help-link and expect(color).toBe(brand) against a probe resolving var(--jp-brand-color1), plus expect(color).not.toBe('rgb(0, 0, 0)') [ui-tests/tests/advanced_image_viewer.spec.ts lines 39-58; right-end placement measured in JOURNAL.md entry 7 ("right 1203 vs toolbar 1209, past Fit")]" -> "spec 'wraps the image in a pan layer and shows an accent help link' passes (Galata 29/29 local 2026-09-30; link text help, colour equals --jp-brand-color1)"
- [x] `ACC-HELP-37` **Help popup** - MEDIUM; clicking the link opens a dialog listing the extension controls and the standard viewer keys it composes with, each control listed once
  - evidence: spec 'wraps the image in a pan layer and shows an accent help link' passes (Galata 29/29 local 2026-09-30; the dialog lists previous / next image, rotate clockwise, flip horizontal)
  - test: click the link, read the dialog text, assert every control appears exactly once
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T12:20:42Z @kj closed: closed on recorded evidence from the shipped 1.0.11 verification
  - log: 2026-09-30T14:28:05Z @kj edited evidence "Galata spec clicks the link and asserts the dialog contains 'previous / next image', 'rotate clockwise' and 'flip horizontal'; JOURNAL entry 10 records the duplicate removal so each control is listed once ("replaced the + / - / Fit line ... so zoom shows once") [ui-tests/tests/advanced_image_viewer.spec.ts lines 60-68; JOURNAL.md entry 10]" -> "spec 'wraps the image in a pan layer and shows an accent help link' passes (Galata 29/29 local 2026-09-30; the dialog lists previous / next image, rotate clockwise, flip horizontal)"

## Audio viewer `AUDIO`

Audio files open in a waveform player built on wavesurfer.js

- log: 2026-10-28T13:59:51Z @kj category created

- [x] `ACC-AUDIO-45-WAVE` **Waveform view** - HIGH; an audio file opens in one tab with its waveform drawn by wavesurfer.js, the played part in the accent colour, a playback line, and a time ruler above the waveform
  - evidence: 1 test titled ACC-AUDIO-45-WAVE in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open a generated 60 s WAV, assert the waveform, the ruler and the playback line render with non-zero size
  - test-tags: E2E
  - log: 2026-10-28T13:59:51Z @kj added
  - log: 2026-10-28T16:14:52Z @kj closed
  - log: 2026-11-03T10:12:12Z @kj edited evidence "ACC-AUDIO-45-WAVE waveform, ruler and playback line in the accent colour passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-45-WAVE in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-46-SEEK` **Click seeks** - CRITICAL; a click anywhere on the waveform moves playback to the time under the click within 0.5 s, paused or playing, at every point from the start to the end of the file
  - evidence: 1 test titled ACC-AUDIO-46-SEEK in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: click at 25% and 75% of a 60 s WAV, assert currentTime 15 s and 45 s within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T13:59:51Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:27Z @kj edited evidence "ACC-AUDIO-46-SEEK a click on the waveform seeks on a server without byte ranges passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-46-SEEK in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-47-OVERVIEW` **Overview seeks the whole file** - HIGH; a strip above the waveform shows the whole file with the zoomed part outlined; a click or a drag on it moves playback to that point of the file and scrolls the waveform to show it
  - evidence: 1 test titled ACC-AUDIO-47-OVERVIEW in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: zoom in, click the strip at 90% of a 60 s WAV, assert currentTime 54 s within 0.5 s and the playback line inside the waveform view
  - test-tags: E2E
  - log: 2026-10-28T13:59:51Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-AUDIO-47-OVERVIEW the overview strip seeks the whole file and scrolls the waveform passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-47-OVERVIEW in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-48-ZOOM` **Waveform zoom** - MEDIUM; the mouse wheel over the waveform and the toolbar - and + buttons zoom the waveform out and in; Fit shows the whole file; during playback the view scrolls to keep the playback line visible
  - evidence: 1 test titled ACC-AUDIO-48-ZOOM in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: press + twice, assert the shown duration shrinks; press Fit, assert it equals the file duration
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-AUDIO-48-ZOOM plus, minus, Fit and the wheel zoom the waveform passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-48-ZOOM in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-49-HOVER` **Time under the mouse** - LOW; hovering over the waveform shows the time under the mouse pointer
  - evidence: 1 test titled ACC-AUDIO-49-HOVER in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: hover at 50% of a 60 s WAV, read 00:30 within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-AUDIO-49-HOVER hovering shows the time under the mouse passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-49-HOVER in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-50-LOOP` **Loop a region** - MEDIUM; a drag on the waveform marks a region and turns Loop on; with Loop on, playback returns to the region start when it reaches the region end; turning Loop off removes the region
  - evidence: 2 tests titled ACC-AUDIO-50-LOOP in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: drag from 10 s to 20 s, play from 18 s, assert currentTime between 10 s and 13 s after 3 s; click Loop, assert no region
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-AUDIO-50-LOOP a drag marks a loop region and Loop off removes it passes, Galata 76/76 local" -> "2 tests titled ACC-AUDIO-50-LOOP in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-51-CONTROLS` **Playback controls** - HIGH; a control row under the waveform holds Back 5 s, a 40 px Play/Pause in --jp-brand-color1 and Forward 5 s in the centre, and mute, volume and the speed choice 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x at the right, each acting on the open file; the toolbar holds none of them; after a click on any control under the waveform, Space, Left and Right still act on the viewer; in a 360 px wide panel the rows wrap and no control leaves the panel
  - evidence: Galata media_audio.spec.ts:635 'ACC-AUDIO-51-CONTROLS the control row under the waveform plays, seeks and sets the speed, and the toolbar holds none of them', :734 'ACC-AUDIO-51-CONTROLS Space, Left and Right still act on the viewer after a click on a control under the waveform', :776 'ACC-AUDIO-51-CONTROLS in a 360 px wide panel the rows wrap and every control stays inside the panel' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: from 10 s click Forward 5 seconds twice, assert 20 s; pick 2x, assert playbackRate 2; assert no Play, Back, Forward or speed in the toolbar; click Play then press Right, assert currentTime 5 s further; at 360 px wide assert every control inside the panel
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-AUDIO-51-CONTROLS play, back, forward, loop and speed act on the file passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-51-CONTROLS in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
  - log: 2026-11-06T16:03:04Z @kj amended text "the toolbar has Play/Pause, back 5 s, forward 5 s, Loop and a speed choice of 0.5x, 0.75x, 1x, 1.25x, 1.5x and 2x, each acting on the open file" -> "a control row under the waveform holds Back 5 s, a 40 px Play/Pause in --jp-brand-color1 and Forward 5 s in the centre, and mute, volume and the speed choice 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x at the right, each acting on the open file; the toolbar holds none of them; after a click on any control under the waveform, Space, Left and Right still act on the viewer; in a 360 px wide panel the rows wrap and no control leaves the panel"; reason: Star Colonel decision of 2026-11-06: audio layout B moves the playback controls under the waveform; the row, the keys after a click and the 360 px panel are one layout
  - log: 2026-11-06T16:03:04Z @kj edited test "from 10 s click forward twice, assert 20 s; pick 2x, assert playbackRate 2" -> "from 10 s click Forward 5 seconds twice, assert 20 s; pick 2x, assert playbackRate 2; assert no Play, Back, Forward or speed in the toolbar; click Play then press Right, assert currentTime 5 s further; at 360 px wide assert every control inside the panel"; reason: Star Colonel decision of 2026-11-06: audio layout B
  - log: 2026-11-06T16:03:04Z @kj reopened: Star Colonel decision of 2026-11-06: audio layout B moves Play, Back 5 s, Forward 5 s and the speed menu under the waveform and adds mute and volume; evidence retired: 1 test titled ACC-AUDIO-51-CONTROLS in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-AUDIO-52-TIME` **Current time and duration** - MEDIUM; the viewer shows the current time and the duration, updated during playback and after every seek
  - evidence: Galata media_audio.spec.ts:834 'ACC-AUDIO-52-TIME the time row shows the played time at the left and the length at the right, updated on a seek and during playback' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: seek to 15 s in a 60 s WAV, read 00:15.0 at the left and 01:00.0 at the right of the time row
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-AUDIO-52-TIME the current time and the duration update on a seek passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-52-TIME in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
  - log: 2026-11-06T16:03:04Z @kj edited test "seek to 15 s in a 60 s WAV, read 00:15.0 / 01:00.0" -> "seek to 15 s in a 60 s WAV, read 00:15.0 at the left and 01:00.0 at the right of the time row"; reason: Star Colonel decision of 2026-11-06: audio layout B splits the status line into a time row
  - log: 2026-11-06T16:03:04Z @kj reopened: Star Colonel decision of 2026-11-06: audio layout B puts the played time and the file length at the two ends of a time row; the old test read them joined in the status line; evidence retired: 1 test titled ACC-AUDIO-52-TIME in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-AUDIO-53-DETAILS` **Audio file details** - LOW; the toolbar shows the format taken from the file extension, the channel count, the file size and the duration
  - evidence: 1 test titled ACC-AUDIO-53-DETAILS in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open the 60 s mono WAV, read WAV, mono, its size and 01:00
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-AUDIO-53-DETAILS the toolbar shows format, channels, size and duration passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-53-DETAILS in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-54-LARGE` **Audio waveform from the server peaks** - HIGH; every audio file, of any size, shows the waveform, overview strip, time ruler, time under the mouse, zoom and loop region from peaks the server computes; the browser never downloads or decodes the whole file and plays it from the file URL; with no peaks, the control row and the seek slider stay, as ACC-WAVE-121-FALLBACK states
  - evidence: Galata 'ACC-AUDIO-54-LARGE every audio file shows the waveform from the peaks of the server and is never downloaded' passes with no decodeAudioData call and no fetch or XHR of the file URL, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0
  - related: ACC-WAVE-121-FALLBACK - the control row and the seek slider when no peaks come
  - related: DEF-MEDIA-37-DECODE-QUEUE - no file decodes in the browser any more
  - mechanism: 2026-11-06T16:11:09Z @kj the package's new server extension decodes the file with PyAV and answers its peaks; wavesurfer draws them over the file URL without decoding
  - test: open the 60 s WAV, size not faked: one waveform request for its path; waveform, overview strip and ruler draw; hover reads 00:30 at 50%; + narrows the shown range; a drag makes a loop region; no fetch or XHR of the file URL and no decodeAudioData call
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "Jest the waveform limit suite and ACC-AUDIO-54-LARGE a file over 100 MB plays without a waveform and seeks pass, Galata 76/76 local" -> "Jest the waveform limit suite in mediautil.spec.ts passed, logs/media-close5-test.log 48/48; 1 test titled ACC-AUDIO-54-LARGE in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
  - log: 2026-11-06T16:03:04Z @kj amended text "a file over 100 MB is not decoded in the browser; it opens and plays with a working seek bar and a line saying that the waveform is skipped above 100 MB" -> "a file over 100 MB is not decoded in the browser; it opens and plays with no browser audio control, with a line saying that the waveform is skipped above 100 MB, and with a seek slider over the whole file in the middle of the time row; the slider follows playback, and a click or a drag on it moves playback there"; reason: Star Colonel decision of 2026-11-06: audio layout B replaces the browser audio control with the viewer's own seek slider
  - log: 2026-11-06T16:03:04Z @kj edited test "unit test the size limit; open a file reported over the limit, assert the seek bar works and the line shows" -> "unit test the size limit; open a file reported over the limit, assert no controls attribute, click the seek slider at 50%, assert currentTime 30 s within 0.5 s, assert the line shows"; reason: Star Colonel decision of 2026-11-06: audio layout B
  - log: 2026-11-06T16:03:05Z @kj reopened: Star Colonel decision of 2026-11-06: audio layout B hides the browser audio control and adds the viewer's own seek slider above 100 MB; evidence retired: Jest the waveform limit suite in mediautil.spec.ts passed, logs/media-close5-test.log 48/48; 1 test titled ACC-AUDIO-54-LARGE in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - log: 2026-11-06T16:11:09Z @kj amended text "a file over 100 MB is not decoded in the browser; it opens and plays with no browser audio control, with a line saying that the waveform is skipped above 100 MB, and with a seek slider over the whole file in the middle of the time row; the slider follows playback, and a click or a drag on it moves playback there" -> "a file over 100 MB shows the waveform, overview strip, time ruler, time under the mouse, zoom and loop region as a file under 100 MB does, from peaks the server computes; the browser never downloads or decodes the whole file and plays it from the file URL; with no peaks, the control row and the seek slider stay, as ACC-WAVE-121-FALLBACK states"; reason: Star Colonel decision of 2026-11-06: the server waveform above 100 MB, decided after a 115 MB WAV opened in the browser's own audio control; the seek slider moved to ACC-AUDIO-113-SEEKBAR
  - log: 2026-11-06T16:11:09Z @kj edited test "unit test the size limit; open a file reported over the limit, assert no controls attribute, click the seek slider at 50%, assert currentTime 30 s within 0.5 s, assert the line shows" -> "unit test the size limit; open the 60 s WAV reported over 100 MB, assert the waveform, overview strip and ruler draw, hover reads 00:30 at 50%, + narrows the shown range, a drag makes a loop region; record requests, assert no fetch or XHR of the file URL"; reason: Star Colonel decision of 2026-11-06: the server waveform above 100 MB
  - log: 2026-11-06T16:11:09Z @kj mechanism recorded; reason: Star Colonel decision of 2026-11-06: PyAV decoder in a new server extension
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T14:22:15Z @kj amended title "Large audio file" -> "Audio waveform from the server peaks"; text "a file over 100 MB shows the waveform, overview strip, time ruler, time under the mouse, zoom and loop region as a file under 100 MB does, from peaks the server computes; the browser never downloads or decodes the whole file and plays it from the file URL; with no peaks, the control row and the seek slider stay, as ACC-WAVE-121-FALLBACK states" -> "every audio file, of any size, shows the waveform, overview strip, time ruler, time under the mouse, zoom and loop region from peaks the server computes; the browser never downloads or decodes the whole file and plays it from the file URL; with no peaks, the control row and the seek slider stay, as ACC-WAVE-121-FALLBACK states"; reason: owner decision of 2026-11-07: the server waveform serves every audio file, not only files over 100 MB
  - log: 2026-11-07T14:22:15Z @kj edited test "unit test the size limit; open the 60 s WAV reported over 100 MB, assert the waveform, overview strip and ruler draw, hover reads 00:30 at 50%, + narrows the shown range, a drag makes a loop region; record requests, assert no fetch or XHR of the file URL" -> "open the 60 s WAV, size not faked: one waveform request for its path; waveform, overview strip and ruler draw; hover reads 00:30 at 50%; + narrows the shown range; a drag makes a loop region; no fetch or XHR of the file URL and no decodeAudioData call"; test-tags "UNIT, E2E" -> "E2E"; reason: owner decision of 2026-11-07: no size is faked; the Jest waveform limit goes with WAVEFORM_LIMIT
  - log: 2026-11-07T14:22:15Z @kj reopened: owner decision of 2026-11-07: every audio file gets its waveform from the server peaks; closed again on the streaming runs; evidence retired: Galata media_audio.spec.ts:1161 'ACC-AUDIO-54-LARGE a file over 100 MB shows the waveform from the peaks of the server and is never downloaded' passed; Jest 'the waveform limit' in src/__tests__/mediautil.spec.ts passed (Jest 50/50 in logs/audio-w-final-test.log); whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - log: 2026-11-07T14:22:15Z @kj related DEF-MEDIA-37-DECODE-QUEUE removed, line read "DEF-MEDIA-37-DECODE-QUEUE - files over 100 MB no longer decode in the browser; files under 100 MB still do" - the related text said files under 100 MB still decode in the browser
  - log: 2026-11-07T14:22:23Z @kj related DEF-MEDIA-37-DECODE-QUEUE removed, line read "DEF-MEDIA-37-DECODE-QUEUE - no file decodes in the browser any more" - the related text said files under 100 MB still decode in the browser
  - log: 2026-11-07T14:22:36Z @kj the removal at 2026-11-07T14:22:23Z was a rerun of the spec script; the same related line was written again at once; nothing changed
  - log: 2026-11-07T15:10:19Z @kj closed
- [x] `ACC-AUDIO-55-ERROR` **Unreadable audio** - MEDIUM; every audio file type JupyterLab registers opens in this viewer; a file the browser cannot decode shows an error line in the viewer, never an empty or stuck panel
  - evidence: 1 test titled ACC-AUDIO-55-ERROR in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open a WAV and a corrupt .mp3, assert the waveform and the error line
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-AUDIO-55-ERROR every audio type opens here and an unreadable file shows an error passes, Galata 76/76 local" -> "1 test titled ACC-AUDIO-55-ERROR in media_audio.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-AUDIO-112-VOLUME` **Mute and volume** - MEDIUM; a mute button toggles media.muted, shows the plyr-volume icon, or plyr-muted while muted or at volume 0, and is named Mute, or Unmute while muted or at volume 0; a Volume slider from 0 to 1 sets media.volume, follows volumechange, shows 0 while muted and unmutes when moved above 0; both act as in the video viewer and hold after Reload, as the speed does
  - evidence: Galata ACC-AUDIO-112-VOLUME 'mute and the volume slider act as in the video viewer and hold after Reload' passes in logs/audio-r4-named.log (media_audio 55/55), the button named Unmute at volume 0; failed before in logs/audio-r4-red.log
  - test: click Mute, assert media.muted, the name Unmute and the slider at 0; set the slider to 0.3, assert media.volume 0.3 and not muted; set media.volume 0.6, assert the slider 0.6; mute, click Reload, assert media.muted and media.volume 0.6
  - test-tags: E2E
  - log: 2026-11-06T16:03:05Z @kj added; reason: Star Colonel decision of 2026-11-06: audio layout B adds mute and volume; the Plyr behaviour is spelt out so it can be tested
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T00:01:00Z @kj amended text "a mute button toggles media.muted, shows the plyr-volume icon, or plyr-muted while muted or at volume 0, and is named Mute, or Unmute while muted; a Volume slider from 0 to 1 sets media.volume, follows volumechange, shows 0 while muted and unmutes when moved above 0; both act as in the video viewer and hold after Reload, as the speed does" -> "a mute button toggles media.muted, shows the plyr-volume icon, or plyr-muted while muted or at volume 0, and is named Mute, or Unmute while muted or at volume 0; a Volume slider from 0 to 1 sets media.volume, follows volumechange, shows 0 while muted and unmutes when moved above 0; both act as in the video viewer and hold after Reload, as the speed does"; reason: DEF-MEDIA-64-MUTE-NAME: only the Unmute clause gains 'or at volume 0'; the rest of the criterion is kept word for word
  - log: 2026-11-07T00:25:06Z @kj reopened: reopened: text amended for DEF-MEDIA-64-MUTE-NAME, closed again on the round 4 runs; evidence retired: Galata media_audio.spec.ts:893 'ACC-AUDIO-112-VOLUME mute and the volume slider act as in the video viewer and hold after Reload' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - log: 2026-11-07T00:25:06Z @kj closed
- [x] `ACC-AUDIO-113-SEEKBAR` **Seek slider without a waveform** - HIGH; an audio file with no waveform, of any size, has no browser audio control; the seek slider of the time row covers the whole file, follows playback, and a click or a drag on it moves playback there
  - evidence: Galata 'ACC-AUDIO-113-SEEKBAR a file with no waveform plays without the browser control and seeks with the slider of the time row' passes, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0
  - related: DEF-MEDIA-34-NATIVE-KEYS - the browser audio control it names is no longer shown
  - related: DEF-MEDIA-9-MEDIA - -, + and Fit stay disabled while no waveform shows
  - test: open the 60 s WAV with its peaks request answered 404; assert no controls attribute; click the slider at 50%, assert currentTime 30 s within 0.5 s; drag it to 75%, assert 45 s; play 1 s, assert the slider moved
  - test-tags: E2E
  - log: 2026-11-06T16:10:46Z @kj added; reason: Star Colonel decision of 2026-11-06: audio layout B replaces the browser audio control with the viewer's own seek slider; moved here from ACC-AUDIO-54-LARGE, which now states the server waveform
  - log: 2026-11-06T18:45:46Z @kj amended text "an audio file over 100 MB with no waveform has no browser audio control; the middle of the time row shows a seek slider over the whole file in place of the shown range; the slider follows playback, and a click or a drag on it moves playback there" -> "an audio file with no waveform, of any size, has no browser audio control; the seek slider of the time row covers the whole file, follows playback, and a click or a drag on it moves playback there"
  - log: 2026-11-06T18:45:46Z @kj covers every file with no waveform, of any size: a failed decode under 100 MB showed two seek bars, the browser control and the slider
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T14:22:16Z @kj edited test "open the 60 s WAV reported over 100 MB, its peaks request, if any, answered 404; assert no controls attribute; click the slider at 50%, assert currentTime 30 s within 0.5 s; drag it to 75%, assert 45 s; play 1 s, assert the slider moved" -> "open the 60 s WAV with its peaks request answered 404; assert no controls attribute; click the slider at 50%, assert currentTime 30 s within 0.5 s; drag it to 75%, assert 45 s; play 1 s, assert the slider moved"; reason: owner decision of 2026-11-07: no size is faked, every file takes the file URL path
  - log: 2026-11-07T15:10:20Z @kj edited evidence "Galata media_audio.spec.ts:964 'ACC-AUDIO-113-SEEKBAR a file over 100 MB plays without a waveform or the browser control and seeks with the slider of the time row' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log" -> "Galata 'ACC-AUDIO-113-SEEKBAR a file with no waveform plays without the browser control and seeks with the slider of the time row' passes, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0"
- [x] `ACC-AUDIO-123-SEEKBAR-ALWAYS` **Seek bar for every audio file** - HIGH; every audio file, with or without a waveform, has a seek slider over the whole file in the time row between the played time and the length; it follows playback; a click or a drag moves playback there; the shown range moves to the left cell of the control row
  - evidence: Galata ACC-AUDIO-123-SEEKBAR-ALWAYS and the updated ACC-AUDIO-51-CONTROLS, ACC-AUDIO-52-TIME, ACC-AUDIO-54-LARGE, ACC-AUDIO-113-SEEKBAR pass, media_audio.spec.ts 44/44 in logs/audio-c-named.log; red before the change in logs/audio-c-red.log (slider hidden); verifier rerun 10/10 in logs/audio-c-verify.log
  - related: ACC-AUDIO-113-SEEKBAR - the same slider, now shown for every file
  - test: open a 60 s WAV under 100 MB; assert the slider between the two times; click it at 50%, assert currentTime 30 s within 0.5 s; drag to 75%, assert 45 s; play 1 s, assert it moved; assert the shown range in the control row
  - test-tags: E2E
  - log: 2026-11-06T17:42:13Z @kj added
  - log: 2026-11-06T18:41:53Z @kj closed
- [x] `ACC-AUDIO-124-SETTINGS-CARRY` **Volume, mute and speed carry over** - MEDIUM; volume, mute and speed carry to the next audio file and across a page reload, as in the video viewer
  - evidence: Galata DEF-MEDIA-61-AUDIO-SETTINGS ACC-AUDIO-124-SETTINGS-CARRY passes in logs/audio-r3-named.log (84/84); failed before with volume 1, unmuted, 1x in logs/audio-r3-red-client.log
  - related: DEF-MEDIA-61-AUDIO-SETTINGS - the defect this criterion states the fix of
  - test: set the volume to 0.4, mute, pick 1.5x, press Page Down: assert volume 0.4, muted, 1.5x; reload the page: assert the same
  - test-tags: E2E
  - mechanism: 2026-11-06T22:37:43Z @kj one localStorage key holds volume, muted and speed, written on each change and applied when an audio viewer opens, inside try/catch
  - log: 2026-11-06T22:37:43Z @kj added
  - log: 2026-11-06T23:04:48Z @kj met in the tree: Galata DEF-MEDIA-61-AUDIO-SETTINGS ACC-AUDIO-124-SETTINGS-CARRY failed before (logs/audio-r3-red-client.log), passed after, media_audio and media_video 84/84 (logs/audio-r3-named.log)
  - log: 2026-11-06T23:13:03Z @kj closed
  - log: 2026-11-07T07:31:34Z @kj accepted by the owner on 2026-11-07
- [x] `ACC-AUDIO-132-BUFFERED` **Buffered amount on the audio seek slider** - MEDIUM; the seek slider of the time row draws every range of media.buffered as a fill behind the played part, updated on progress and on every seek; the fill reaches 3:1 against the unbuffered track and against the played part, in the light and the dark theme
  - evidence: Jest describe 'bufferedParts' 4 cases pass, 52/52 in logs/media-stream-test.log; Galata 'ACC-AUDIO-132-BUFFERED the seek slider shows the buffered parts past the played part, at 3:1 against the track and the played part' passes, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0; failed before the change with one buffered range [0, 20] in logs/media-stream-red.log
  - related: ACC-AUDIO-123-SEEKBAR-ALWAYS - the slider that draws the fill
  - test: first file request answered 206 with 0-20 s of the 60 s WAV, later ones 64 KiB or held; seek to 40 s, back to 10 s; slider pixels at points from media.buffered: fill against track and against played at least 3:1, both themes; Jest the fill helper
  - test-tags: UNIT, FUNCTIONAL
  - log: 2026-11-07T14:22:12Z @kj added; reason: owner decision of 2026-11-07: streaming and the buffered amount, one rule per item
  - log: 2026-11-07T15:10:19Z @kj closed; reason: names each test title and the run that proves it

## Video viewer `VIDEO`

Video files open in a Plyr player

- log: 2026-10-28T13:59:53Z @kj category created

- [x] `ACC-VIDEO-56-PLAYER` **Plyr player** - HIGH; a video file opens in one tab in a Plyr player with its control bar: play, seek bar, current time, mute, volume, speed menu, picture-in-picture and full screen
  - evidence: 1 test titled ACC-VIDEO-56-PLAYER in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open the video fixture, assert the Plyr control bar and each of these buttons
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-VIDEO-56-PLAYER the video opens in one tab in a Plyr player with its control bar passes, Galata 76/76 local" -> "1 test titled ACC-VIDEO-56-PLAYER in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-VIDEO-57-SEEK` **Video seek** - CRITICAL; a click on the seek bar moves playback to the time under the click within 0.5 s, at every point from the start to the end of the file
  - evidence: 1 test titled ACC-VIDEO-57-SEEK in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: click the seek bar at 50% of the fixture, assert currentTime half the duration within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-VIDEO-57-SEEK a click on the seek bar moves playback to that point passes, Galata 76/76 local" -> "1 test titled ACC-VIDEO-57-SEEK in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-VIDEO-58-FIT` **Video fit** - MEDIUM; the whole frame is visible and centred at every panel size, with the aspect ratio kept
  - evidence: 1 test titled ACC-VIDEO-58-FIT in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: resize the panel twice, assert the video rect inside the panel and the aspect ratio within 1%
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-VIDEO-58-FIT the whole frame is visible and centred at every panel size passes, Galata 76/76 local" -> "1 test titled ACC-VIDEO-58-FIT in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-VIDEO-59-DETAILS` **Video file details** - LOW; the toolbar shows the format taken from the file extension, the frame size in pixels, the file size and the duration
  - evidence: 1 test titled ACC-VIDEO-59-DETAILS in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open the fixture, read its format, frame size, file size and duration
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-VIDEO-59-DETAILS the toolbar shows format, frame size, size and duration passes, Galata 76/76 local" -> "1 test titled ACC-VIDEO-59-DETAILS in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-VIDEO-60-ACCENT` **Accent colour** - LOW; the played part of the seek bar and the highlighted Plyr buttons use --jp-brand-color1 in the light and the dark theme
  - evidence: 1 test titled ACC-VIDEO-60-ACCENT in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: compare the computed colour with the resolved --jp-brand-color1 in both themes
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-VIDEO-60-ACCENT the seek bar and the highlighted buttons use the brand colour passes, Galata 76/76 local" -> "1 test titled ACC-VIDEO-60-ACCENT in media_video.spec.ts passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-VIDEO-133-BUFFERED` **Buffered amount on the video seek bar** - MEDIUM; the Plyr seek bar shows its buffer bar up to the end of the first range of media.buffered; the bar is visible and reaches 3:1 against the unbuffered track and against the played part, in the light and the dark theme
  - evidence: Galata 'ACC-VIDEO-133-BUFFERED the seek bar shows its buffer bar, at 3:1 against the track and the played part' passes, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0
  - related: ACC-VIDEO-60-ACCENT - the played part the fill is measured against
  - test: first request of clip.mp4 answered 206 with 96 KiB, three blocks of 32 KiB, the rest held; play past 2 s, pause; .plyr__progress__buffer visible, value within 2 of buffered.end(0) / duration x 100; bar pixels: fill against track and against played at least 3:1, both themes
  - test-tags: FUNCTIONAL
  - log: 2026-11-07T14:22:12Z @kj added; reason: owner decision of 2026-11-07: streaming and the buffered amount, one rule per item
  - log: 2026-11-07T15:10:19Z @kj edited test "first request of clip.mp4 answered 206 with a third of the file, the rest held, seek to 2 s; .plyr__progress__buffer visible, value within 2 of buffered.end(0) / duration x 100; bar pixels: fill against track and against played at least 3:1, both themes" -> "first request of clip.mp4 answered 206 with 96 KiB, three blocks of 32 KiB, the rest held; play past 2 s, pause; .plyr__progress__buffer visible, value within 2 of buffered.end(0) / duration x 100; bar pixels: fill against track and against played at least 3:1, both themes"; reason: Chromium plays only whole 32 KiB blocks, so a third of the file stalled playback at 1.75 s, and a seek aborted the held read and made Chromium count the whole file as buffered
  - log: 2026-11-07T15:10:19Z @kj closed

## Media keys `KEYS`

Keyboard control of a focused audio or video tab

- log: 2026-10-28T13:59:55Z @kj category created

- [x] `ACC-KEYS-61-ARROWS` **Arrow keys seek** - HIGH; in a focused audio or video tab, Left and Right move playback 5 s back and forward, once per key press, stopping at the start and the end
  - evidence: 2 tests titled ACC-KEYS-61-ARROWS, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: from 10 s press Right, assert 15 s; press Left twice, assert 5 s; in an audio and a video tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-KEYS-61-ARROWS Left and Right move playback 5 s and stop at the ends, and the video variant once per press, pass, Galata 76/76 local" -> "2 tests titled ACC-KEYS-61-ARROWS, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-KEYS-62-SPACE` **Space plays and pauses** - MEDIUM; Space toggles play and pause in a focused audio or video tab
  - evidence: 2 tests titled ACC-KEYS-62-SPACE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: press Space twice, assert playing then paused
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-KEYS-62-SPACE Space plays and pauses passes in the audio and the video viewer, Galata 76/76 local" -> "2 tests titled ACC-KEYS-62-SPACE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-KEYS-63-PAGE` **Page keys change file** - HIGH; Page Up and Page Down open the previous and next file of the same kind, audio or video, in the folder, in the order the file browser lists them, inside one tab, stopping at the first and the last file; the folder navigation setting turns this off
  - evidence: 2 tests titled ACC-KEYS-63-PAGE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: with three WAV files press Page Down twice and Page Up once, assert the paths and one audio tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:58Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-KEYS-63-PAGE Page Up and Page Down open the previous and next audio file, and the video variant, pass, Galata 76/76 local" -> "2 tests titled ACC-KEYS-63-PAGE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-KEYS-64-SCOPE` **Keys stay in media tabs** - HIGH; these keys act only in a focused audio or video tab; notebooks, editors and the image viewer keep their behaviour, and Left and Right still change the image in the image viewer
  - evidence: 2 tests titled ACC-KEYS-64-SCOPE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: press Left and Space in a notebook cell, assert normal editing; press Right in the image viewer, assert the next image
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:58Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-KEYS-64-SCOPE the media keys act only in a focused media tab, and the video variant, pass, Galata 76/76 local" -> "2 tests titled ACC-KEYS-64-SCOPE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"

## Media integration `MEDIA`

How the audio and video viewers fit into JupyterLab

- log: 2026-10-28T13:59:55Z @kj category created

- [x] `ACC-MEDIA-65-STOCK` **Stock viewers disabled** - HIGH; while this extension is installed, @jupyterlab/audio-extension:plugin and @jupyterlab/video-extension:plugin are disabled; a double click opens the new viewer, and Open With on an audio or video file lists only the new viewer
  - evidence: 2 tests titled ACC-MEDIA-65-STOCK, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: read the widget factories for a .wav and a video path, assert one each, from this extension
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-MEDIA-65-STOCK the stock audio and video viewers are disabled and the stock video viewer is disabled pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-65-STOCK, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-66-TOOLBAR` **Toolbar matches the image viewer** - MEDIUM; the media toolbar starts with the image viewer's Reload button and ends with the help link at the right end; the audio toolbar holds Reload, -, +, Fit, Loop, a spacer, the file details and help, in that order, with the image viewer's -, + and Fit tooltips
  - evidence: Galata media_audio.spec.ts:1775 'ACC-MEDIA-66-TOOLBAR the audio toolbar matches the image viewer toolbar and holds Reload, -, +, Fit, Loop, the details and help in that order', media_video.spec.ts:721 'ACC-MEDIA-66-TOOLBAR the video toolbar starts with Reload and ends with help' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: compare the toolbar items of an audio, a video and an image tab; assert the audio items in their order
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-MEDIA-66-TOOLBAR the audio toolbar matches the image viewer toolbar and the video toolbar starts with Reload and ends with help pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-66-TOOLBAR, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
  - log: 2026-11-06T16:03:05Z @kj amended text "the media toolbar starts with the same Reload button as the image viewer, waveform zoom uses the same -, + and Fit buttons with the same tooltips, and the help link sits at the right end" -> "the media toolbar starts with the image viewer's Reload button and ends with the help link at the right end; the audio toolbar holds Reload, -, +, Fit, Loop, a spacer, the file details and help, in that order, with the image viewer's -, + and Fit tooltips"; reason: Star Colonel decision of 2026-11-06: audio layout B moves Play, Back 5 s, Forward 5 s and the speed menu out of the audio toolbar
  - log: 2026-11-06T16:03:05Z @kj edited test "compare the toolbar items of an audio, a video and an image tab" -> "compare the toolbar items of an audio, a video and an image tab; assert the audio items in their order"; reason: Star Colonel decision of 2026-11-06: audio layout B
  - log: 2026-11-06T16:03:05Z @kj reopened: Star Colonel decision of 2026-11-06: audio layout B changes the audio toolbar items; evidence retired: 2 tests titled ACC-MEDIA-66-TOOLBAR, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-MEDIA-67-HELP` **Help link as in the image viewer** - LOW; the toolbar shows an underlined help text link in the accent colour at the right end, never a ? icon; it opens a dialog listing the media controls and keys, each once, with a Close button
  - evidence: 2 tests titled ACC-MEDIA-67-HELP, in media_audio.spec.ts (Seek bar row asserted once) and media_video.spec.ts, passed; audio test failed before the change in logs/audio-d-red.log, passed in logs/audio-d-named.log 44/44; both rerun in logs/audio-d-verify.log 3/3, exit 0
  - test: read the link text, colour and position; open the dialog and count each control once
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-MEDIA-67-HELP the help link lists each media control once and each video control and key once pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-67-HELP, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
  - log: 2026-11-06T18:45:42Z @kj reopened: the seek slider of ACC-AUDIO-123 has no help row; evidence retired: 2 tests titled ACC-MEDIA-67-HELP, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - log: 2026-11-06T19:00:29Z @kj closed
- [x] `ACC-MEDIA-68-RELOAD` **Reload from disk** - LOW; Reload reads the file again, so a changed file shows its new waveform or picture and its new duration
  - evidence: 2 tests titled ACC-MEDIA-68-RELOAD, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: overwrite the 60 s WAV with a 30 s one, click Reload, assert 00:30.0
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:30Z @kj edited evidence "ACC-MEDIA-68-RELOAD Reload reads the changed file again passes in the audio and the video viewer, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-68-RELOAD, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-69-RESTORE` **Tab restore** - MEDIUM; open audio and video tabs open again after a page reload, on the same files
  - evidence: 2 tests titled ACC-MEDIA-69-RESTORE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open an audio and a video tab, reload the page, assert both tabs and their paths
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-MEDIA-69-RESTORE an audio tab and a video tab open again after a page reload pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-69-RESTORE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-70-LOCAL` **No third-party requests** - HIGH; opening and using the viewers sends requests only to the lab's own server; the Plyr icons and its blank video are bundled
  - evidence: 2 tests titled ACC-MEDIA-70-LOCAL, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: record every page request while opening and playing audio and video, assert each URL is on the lab origin
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-MEDIA-70-LOCAL opening and playing audio and video requests only the lab pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-70-LOCAL, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-71-STREAM` **No content download through the contents API** - HIGH; opening a media file never fetches its content through the contents API; the player reads the file from its file URL
  - evidence: 2 tests titled ACC-MEDIA-71-STREAM, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: open a video, assert no /api/contents request with content=1 for its path
  - test-tags: E2E
  - log: 2026-10-28T13:59:57Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-MEDIA-71-STREAM the file is never read through the contents API passes in the audio and the video viewer, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-71-STREAM, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-72-CLOSE` **Closing stops playback** - MEDIUM; closing a playing audio or video tab stops the sound and removes its media element
  - evidence: 2 tests titled ACC-MEDIA-72-CLOSE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: play, close the tab, assert no media element is left playing
  - test-tags: E2E
  - log: 2026-10-28T13:59:57Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
  - log: 2026-11-03T10:12:29Z @kj edited evidence "ACC-MEDIA-72-CLOSE closing a playing tab stops it and removes its element passes in the audio and the video viewer, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-72-CLOSE, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-73-MENU` **One item per label** - CRITICAL; the context menus of an audio tab, a video tab and their content show each label once
  - evidence: 2 tests titled ACC-MEDIA-73-MENU, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - test: extend 'no context menu item appears twice' to an audio and a video tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:57Z @kj added
  - log: 2026-10-28T16:15:02Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-MEDIA-73-MENU no context menu item appears twice on an audio tab, and the video variant, pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-73-MENU, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
- [x] `ACC-MEDIA-74-BUFFER` **Small files seek without byte ranges** - CRITICAL; audio and video files up to 100 MB are downloaded once from the file URL and played from the downloaded copy, so seeking works on a server without byte ranges; larger files play from the file URL
  - evidence: 2 tests titled ACC-MEDIA-74-BUFFER, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0
  - related: DEF-MEDIA-7-SEEK - the seek failure this works around for files up to 100 MB
  - overridden-by: ACC-MEDIA-131-STREAM-ALL
  - test: serve /files/ as status 200 without Accept-Ranges through page.route, open a WAV and the video fixture, seek to 50%, assert currentTime within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T14:26:15Z @kj added
  - log: 2026-10-28T16:15:02Z @kj closed
  - log: 2026-11-03T10:12:28Z @kj edited evidence "ACC-MEDIA-74-BUFFER audio and video up to 100 MB are downloaded once and seek without byte ranges pass, Galata 76/76 local" -> "2 tests titled ACC-MEDIA-74-BUFFER, 1 in media_audio.spec.ts and 1 in media_video.spec.ts, passed, re-proved 2026-11-03 in logs/media-r5-final-suite.log, whole Galata suite 144/144, exit 0"
  - log: 2026-11-07T14:22:16Z @kj owner decision of 2026-11-07: every file streams from its file URL and no file is downloaded first; overridden by ACC-MEDIA-131-STREAM-ALL; its two Galata tests are deleted; stays closed with its evidence
- [x] `ACC-MEDIA-114-SPINNER` **Loading spinner** - MEDIUM; from the start of a load until the file can play, the centre of an audio or video tab shows a spinner with Loading... under it, in place of the Loading... line at the panel foot; the spinner goes when the file can play or when an error sentence shows
  - evidence: Galata media_audio.spec.ts:1415 'ACC-MEDIA-114-SPINNER a spinner with Loading... under it shows in the centre of the audio viewer until the file can play, and goes on an error', media_video.spec.ts:1215 'ACC-MEDIA-114-SPINNER a spinner with Loading... under it shows in the centre of the video viewer until the file can play' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - related: DEF-MEDIA-43-MESSAGE-POSITION - Loading... leaves the panel foot for the centre; the error sentence keeps its place
  - test: hold the file URL answer with page.route, open a WAV, assert the spinner and Loading... centred in the viewer and no Loading... at the foot; release it, assert no spinner once the file can play; repeat with the video fixture; open a corrupt .mp3, assert the error sentence and no spinner
  - test-tags: E2E
  - log: 2026-11-06T16:10:46Z @kj added; reason: Star Colonel decision of 2026-11-06: a spinner in the centre of the audio and video viewers replaces the Loading... line at the panel foot
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-MEDIA-130-DOWNLOAD-RETRY` **Download tried again after a network failure** - MEDIUM; an audio or video file up to 100 MB is downloaded again once after a network failure (fetch or blob() rejects with TypeError), not after an HTTP error status; a second network failure shows 'The connection to the server was lost; press Reload to try again.'
  - evidence: Jest downloadBlob in src/__tests__/mediautil.spec.ts: 'tries a request that got no answer once more', 'does not try an HTTP error status again', 'rejects with the TypeError when the second request fails too', 'tries again when the body breaks off', 54/54 in logs/media-retry-test2.log; Galata DEF-MEDIA-67-NO-RETRY ACC-MEDIA-130-DOWNLOAD-RETRY: 'an audio file request on a dropped connection is tried once more and the file plays', 'a video file request on a dropped connection is tried once more and the file plays', 'an audio file request that fails on both tries says the connection was lost, and Reload plays the file', media_audio and media_video 89/89 in logs/media-retry-galata.log, exit 0
  - related: DEF-MEDIA-67-NO-RETRY - the defect this fixes
  - overridden-by: ACC-MEDIA-134-LOST-CONNECTION
  - test: Jest downloadBlob with a mocked fetch; Galata: abort the first file request with 'connectionfailed', the file plays after two requests; abort every request, the lost-connection sentence shows
  - test-tags: UNIT, FUNCTIONAL
  - mechanism: 2026-11-07T13:33:46Z @kj downloadBlob in src/mediautil.ts runs fetch and blob() and on a TypeError runs both once more at once, on the new connection the browser opens; MediaViewer.fail maps a TypeError to the lost-connection sentence
  - log: 2026-11-07T13:33:46Z @kj added
  - log: 2026-11-07T13:45:04Z @kj closed; reason: the evidence names the 4 Jest cases and the 3 Galata test titles
  - log: 2026-11-07T14:22:16Z @kj owner decision of 2026-11-07: downloadBlob and its retry are removed, the browser's media player handles the network; overridden by ACC-MEDIA-134-LOST-CONNECTION; its 4 Jest cases and 3 Galata tests are deleted; stays closed with its evidence
- [x] `ACC-MEDIA-131-STREAM-ALL` **Every file streams from its file URL** - HIGH; every audio and video file, of any size, plays from its /files/ URL, never a blob: copy, and no fetch or XHR reads it; playback starts before the whole file arrives; the first file request carries Range: bytes=0-, answered with Accept-Ranges: bytes; the audio waveform comes from the waveform endpoint, never a browser decode
  - evidence: Galata 'ACC-MEDIA-131-STREAM-ALL every audio file plays from its file URL with byte ranges', 'ACC-MEDIA-131-STREAM-ALL playback starts before the whole audio file arrives' and 'ACC-MEDIA-131-STREAM-ALL every video file plays from its file URL with byte ranges' pass, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0; the audio test failed before the change on src blob: in logs/media-stream-red.log
  - overrides: ACC-MEDIA-74-BUFFER
  - related: ACC-AUDIO-54-LARGE - the server waveform of every audio file
  - related: ACC-MEDIA-71-STREAM - the file URL, never the contents API
  - related: DEF-MEDIA-7-SEEK - seeking at every size rests on the byte ranges of /files/
  - related: DEF-MEDIA-30-LARGE-RECORDING - a recording with no length in its header shows --:-- at every size, accepted
  - test: 60 s WAV and clip.mp4, size not faked, page.on request and response: src not blob:, every file request resourceType media, first Range bytes=0- with Accept-Ranges bytes, one waveform request, no decodeAudioData call; first request answered 206 with a quarter of the file, the rest held: Play advances currentTime
  - test-tags: FUNCTIONAL
  - mechanism: 2026-11-07T14:22:12Z @kj MediaViewer.load sets media.src to the getDownloadUrl URL for every file and the browser streams it with byte ranges; AudioViewer asks the server part for the peaks of every file; downloadBlob, the blob URL and the size branch go
  - log: 2026-11-07T14:22:12Z @kj added; reason: owner decision of 2026-11-07: streaming and the buffered amount, one rule per item
  - log: 2026-11-07T15:10:19Z @kj closed; reason: names each test title and the run that proves it
- [x] `ACC-MEDIA-134-LOST-CONNECTION` **Lost connection while streaming** - MEDIUM; the viewer never requests the file again itself; when the media element's file request fails, before or after the metadata, the tab shows 'The connection to the server was lost; press Reload to try again.', and Reload plays the file
  - evidence: Galata 'DEF-MEDIA-22-LARGE-VIDEO ACC-MEDIA-134-LOST-CONNECTION a failed audio file request says the connection was lost, and Reload plays the file' with route.abort failed and connectionfailed, 'DEF-MEDIA-22-LARGE-VIDEO ACC-MEDIA-134-LOST-CONNECTION a failed file request says the connection was lost, and Reload plays the file' and 'DEF-MEDIA-22-LARGE-VIDEO ACC-MEDIA-134-LOST-CONNECTION a connection lost after the metadata says so, and Reload plays the file' pass, media_audio and media_video 88/88 in logs/media-stream-galata.log, exit 0
  - overrides: ACC-MEDIA-130-DOWNLOAD-RETRY
  - overrides: DEF-MEDIA-67-NO-RETRY
  - related: DEF-MEDIA-22-LARGE-VIDEO - the ruling that maps a failed file request to this sentence
  - test: abort every file request with 'failed', then with 'connectionfailed': the sentence shows; unroute, Reload, the file plays; clip.mp4 answered 32 KiB then aborted, seek to 15 s: the sentence within 45 s
  - test-tags: FUNCTIONAL
  - log: 2026-11-07T14:22:12Z @kj added; reason: owner decision of 2026-11-07: streaming and the buffered amount, one rule per item
  - log: 2026-11-07T15:10:19Z @kj closed; reason: names each test title and the run that proves it

## Mesh viewer `MESH`

STL, PLY, OBJ, 3MF, GLB and STEP files open in a 3D viewer built on three.js

- log: 2026-10-31T19:54:51Z @kj category created

- [x] `ACC-MESH-75-OPEN` **Opens by double-click** - CRITICAL; a double-click on a .stl, .ply, .obj, .3mf, .glb, .step or .stp file opens one tab in the mesh viewer with a mesh icon; Open With lists Mesh Viewer
  - evidence: media_mesh.spec.ts ACC-MESH-75-OPEN: one tab, mesh icon in the title and tab, Open With lists Mesh Viewer, all seven extensions open with covered > 5000; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: generate one file of each format, double-click, assert one viewer tab and model pixels in the canvas
  - test-tags: E2E
  - log: 2026-10-31T19:54:51Z @kj added
  - log: 2026-11-01T12:51:04Z @kj closed
- [x] `ACC-MESH-76-STL` **STL renders** - CRITICAL; binary and ASCII STL both render; the read-out shows the file's triangle count
  - evidence: media_mesh.spec.ts ACC-MESH-76-STL: binary and ASCII STL both render with covered > 5000 and the read-out shows exactly 256 triangles; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: generate a binary and an ASCII STL of known triangle count, assert model pixels and the count
  - test-tags: E2E
  - log: 2026-10-31T19:54:51Z @kj added
  - log: 2026-11-01T12:51:04Z @kj closed
- [x] `ACC-MESH-77-PLY` **PLY renders** - HIGH; PLY with faces renders as a surface with its vertex colours; PLY with vertices only renders as points and the read-out says points
  - evidence: media_mesh.spec.ts ACC-MESH-77-PLY: the surface shows its vertex colours (warm > 200) with 12 triangles, the point cloud shows 1,024 points with material size 2 x device ratio and no attenuation; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: generate both, assert model pixels, a vertex colour in the pixels, and the read-out text
  - test-tags: E2E
  - log: 2026-10-31T19:54:51Z @kj added
  - log: 2026-11-01T12:51:04Z @kj closed
- [x] `ACC-MESH-78-OBJ` **OBJ renders** - HIGH; OBJ geometry renders in the default material; a mtllib line is ignored, with no request for the .mtl file and no error
  - evidence: media_mesh.spec.ts ACC-MESH-78-OBJ: renders with covered > 5000 and warm < 10, sends no .mtl request; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: generate an OBJ with a mtllib line, assert model pixels, no request for the .mtl, no error message
  - test-tags: E2E
  - log: 2026-10-31T19:54:51Z @kj added
  - log: 2026-11-01T12:51:04Z @kj closed
- [x] `ACC-MESH-79-GLB` **GLB renders** - HIGH; GLB renders with its embedded materials and textures; a file using Draco, meshopt or KTX2 compression shows a sentence naming the unsupported compression
  - evidence: media_mesh.spec.ts ACC-MESH-79-GLB: authored colour and embedded texture both warm > 200; Draco, meshopt and KTX2 each show the exact unsupported-compression sentence; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: generate a GLB with a base colour and an embedded PNG texture, assert the colours in the pixels; generate one declaring KHR_draco_mesh_compression, assert the sentence
  - test-tags: E2E
  - log: 2026-10-31T19:55:13Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-80-STEP` **STEP renders** - CRITICAL; .step and .stp render with part colours; the read runs in a Web Worker, so the lab stays usable during it; the WASM file is served by the lab
  - evidence: media_mesh.spec.ts ACC-MESH-80-STEP: .step and .stp both show STEP details, warm > 100, a page worker and the lab-hosted occt-import-js.wasm response; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: open tests/fixtures/cube.stp under both extensions, assert model pixels, a worker created by the page, and the WASM response from the lab host
  - test-tags: E2E
  - log: 2026-10-31T19:55:13Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-81-QUALITY` **Rendering quality** - CRITICAL; a model renders with generated environment light and a camera light, antialiased edges and the device pixel ratio; both faces are drawn, so an open mesh shows no holes
  - evidence: media_mesh.spec.ts ACC-MESH-81-QUALITY: colours > 500, mixed outline rows > 0.8, drawing ratio 2, environment on, one camera light, each light changes the picture, both faces > 50,000 covered; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: render a generated mesh, assert many distinct shades on the surface, intermediate colours along the outline, and pixels on the far side of an open surface
  - test-tags: E2E
  - log: 2026-10-31T19:55:13Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-82-SMOOTH` **Shading toggle** - HIGH; Shading is on by default and rounds a coarse mesh while edges sharper than 40 degrees stay sharp; the toggle shows its pressed state and, turned off, shows the flat facets; the Shading and Wireframe states both stick across Reload and Page Down
  - evidence: media_mesh.spec.ts ACC-MESH-82-SMOOTH Shading is on at open, off shows the flat facets, and on again restores the smooth surface passed; ACC-MESH-82-SMOOTH ACC-MESH-83-WIRE Shading and Wireframe keep their pressed state after Reload and Page Down passed; Galata 181/181, logs/toolbar-finish-galata.log
  - test: render a coarse sphere and a cube; assert the sphere's shade count falls with Shading off and returns with it on, and a cube edge stays sharp with Shading on
  - test-tags: E2E
  - log: 2026-10-31T19:55:13Z @kj added
  - log: 2026-10-31T23:56:15Z @kj amended text "Smooth is the default and rounds a coarse mesh while edges sharper than 30 degrees stay sharp; a toolbar button switches to Flat, which shows the facets, and shows its pressed state" -> "Smooth is the default and rounds a coarse mesh while edges sharper than 40 degrees stay sharp; a toolbar button switches to Flat, which shows the facets, and shows its pressed state"; reason: main session ruling on DEF-MESH-15-SEAMS: 40 degrees rounds the 22.5 degree globe and keeps an 8-sided column sharp
  - log: 2026-11-01T12:51:05Z @kj closed
  - log: 2026-11-11T15:06:01Z @kj edited title "Flat and Smooth shading" -> "Shading toggle"; text "Smooth is the default and rounds a coarse mesh while edges sharper than 40 degrees stay sharp; a toolbar button switches to Flat, which shows the facets, and shows its pressed state" -> "HIGH; Shading is on by default and rounds a coarse mesh while edges sharper than 40 degrees stay sharp; the toggle shows its pressed state and, turned off, shows the flat facets; the Shading and Wireframe states both stick across Reload and Page Down"; test "render a coarse sphere and a cube; assert the sphere's shade count falls in Flat, and a cube edge stays sharp in Smooth" -> "render a coarse sphere and a cube; assert the sphere's shade count falls with Shading off and returns with it on, and a cube edge stays sharp with Shading on"
  - log: 2026-11-11T15:42:28Z @kj edited evidence "media_mesh.spec.ts ACC-MESH-82-SMOOTH: Flat lowers the shade count and raises the largest step, a cube edge stays sharp at 40 degrees, pressed state asserted, both stick after Reload and Page Down; Galata 84 passed, logs/mesh-galata-verify-formats-2.log" -> "media_mesh.spec.ts ACC-MESH-82-SMOOTH Shading is on at open, off shows the flat facets, and on again restores the smooth surface passed; ACC-MESH-82-SMOOTH ACC-MESH-83-WIRE Shading and Wireframe keep their pressed state after Reload and Page Down passed; Galata 181/181, logs/toolbar-finish-galata.log"; reason: evidence names the two passing test titles
- [x] `ACC-MESH-83-WIRE` **Wireframe** - MEDIUM; a toolbar button shows triangle edges in place of the surface, shows its pressed state, and restores the surface on a second press
  - evidence: media_mesh.spec.ts ACC-MESH-83-WIRE: wireframe lowers covered below 0.6, a second press restores the exact count, pressed state asserted; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: toggle twice; assert covered pixels fall, then return to the first count
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-84-ORBIT` **Orbit, pan and zoom** - CRITICAL; left drag orbits around the model, right drag pans with no JupyterLab context menu, wheel zooms toward the pointer
  - evidence: media_mesh.spec.ts ACC-MESH-84-ORBIT: left drag changes the view and keeps the model centred, right drag moves it with no context menu, the wheel grows it about the pointer; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: for each gesture, assert the pixels change as the gesture requires: bounding box moves on pan, grows on wheel up; assert no context menu after right drag
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-85-FIT` **Fit and zoom buttons** - HIGH; a model opens centred and filling the panel; the Fit button restores that view after any camera move; -, + and Fit read the same as in the image viewer; a panel resize keeps the model undistorted
  - evidence: media_mesh.spec.ts ACC-MESH-85-FIT three tests: centred with at least half the shorter side, + and - grow and shrink, tooltips equal the image viewer's, resize keeps the ratio within 3 percent, a 0.001 cube framed; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: assert bounding box centred and at least 50 percent of the shorter side after open and after Fit; assert + grows and - shrinks it; assert tooltips equal the image viewer's
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-86-UP` **Up axis** - MEDIUM; STL, PLY, 3MF and STEP open with Z up; OBJ and GLB open with Y up
  - evidence: src/__tests__/meshutil.spec.ts table gives stl/ply/3mf/step z and obj/glb y; media_mesh.spec.ts ACC-MESH-86-UP: Z-tall STL and pyramid stand, Y-tall GLB stands taller than wide; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: meshutil table in Jest; a Z-tall STL and a Y-tall GLB each render taller than wide in Galata
  - test-tags: UNIT, E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-87-READOUT` **File read-out** - MEDIUM; the toolbar shows format, triangle count, three dimensions with no unit, and file size
  - evidence: src/__tests__/meshutil.spec.ts formatDimensions cases; media_mesh.spec.ts ACC-MESH-87-READOUT exact text 'STL · 12 triangles · 12.4 × 8.0 × 3.1 · 684 B'; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: assert the exact text for a generated file of known size and extents
  - test-tags: UNIT, E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-88-RELOAD` **Reload** - HIGH; the Reload button reads the file again and shows the new content, keeping the camera unless the kept camera cannot show the new model, and then it frames the model; a reload while one is running replaces it
  - evidence: media_mesh.spec.ts ACC-MESH-88-RELOAD three tests: new 256 count with the camera kept, a superseded held download never shows, an out-of-view model is framed, a panned-to-limit camera stays; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: open a file, overwrite it with a different triangle count, press Reload, assert the new count; orbit first and assert the view angle stays
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-10-31T23:56:15Z @kj amended text "the Reload button reads the file again and shows the new content, keeping the camera; a reload while one is running replaces it" -> "the Reload button reads the file again and shows the new content, keeping the camera unless the kept camera cannot show the new model, and then it frames the model; a reload while one is running replaces it"; reason: main session ruling: keep the framing the third fix stage added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-89-HELP` **Help** - MEDIUM; the help link at the right end of the toolbar opens a dialog listing the mouse controls and keys
  - evidence: media_mesh.spec.ts ACC-MESH-89-HELP: the dialog names orbit, pan, zoom, Page Up and Page Down, and the link sits at the right end of the toolbar; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: open the dialog, assert it names orbit, pan, zoom, Page Up and Page Down
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:06Z @kj closed
- [x] `ACC-MESH-90-NAV` **Folder navigation** - HIGH; with the viewer focused, Page Up and Page Down open the previous or next mesh file in file browser order in the same tab, also after a drag on the model; the folder navigation setting turns this off
  - evidence: media_mesh.spec.ts ACC-MESH-90-NAV two tests: order a/c/e skipping other types, one tab, works after a drag, the setting stops it, follows the file browser's descending order; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: folder of three STL files with other files between them; assert order, one tab, and no step with the setting off
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:06Z @kj closed
- [x] `ACC-MESH-91-ERROR` **Failures show a sentence** - HIGH; a damaged file, an empty file, missing WebGL and a file over the 1 GiB limit each show one plain sentence, never a raw exception or a silent blank panel; a file over the limit is not downloaded
  - evidence: src/__tests__/meshutil.spec.ts limit 1 GiB exact; media_mesh.spec.ts ACC-MESH-91-ERROR two tests: damaged, empty, 403, deleted, no WebGL, lost context, over-limit not downloaded, one plain sentence for every format; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: open a damaged and an empty file of each format family, assert the sentence has no exception text; meshutil limit in Jest
  - test-tags: UNIT, E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-92-LARGE` **Large file** - HIGH; a 100 MB binary STL of 2,000,000 triangles opens and renders
  - evidence: media_mesh.spec.ts ACC-MESH-92-LARGE: a 95.4 MB binary STL of 2,000,000 triangles shows the count and model pixels; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: upload through the contents API, assert the triangle count and model pixels
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-93-TABS` **Many tabs** - HIGH; a hidden tab holds no WebGL context and renders nothing; 20 open mesh tabs all show their model with the camera kept when selected again; closing a tab frees its GPU and CPU data
  - evidence: media_mesh.spec.ts ACC-MESH-93-TABS: one live context and one canvas across 20 tabs, both ends show pixels with the camera kept, closing frees geometry and leaves live 0; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: open 20 tabs, select the first and the last, assert model pixels and no context lost; count live contexts through a page hook
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-94-RESTORE` **Tab restore** - MEDIUM; an open mesh tab returns after a page reload
  - evidence: media_mesh.spec.ts ACC-MESH-94-RESTORE: after a page reload the mesh tab returns with 12 triangles and model pixels; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: open a file, reload the page, assert the viewer shows model pixels
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-95-THEME` **Theme** - MEDIUM; the background follows the JupyterLab theme with no reload, and the model stays readable in light and dark themes
  - evidence: media_mesh.spec.ts ACC-MESH-95-THEME: the background pixel equals --jp-layout-color0 with no reload and the model stays visible in both themes; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: switch theme, assert the background pixel equals --jp-layout-color0 and model pixels stay
  - test-tags: E2E
  - log: 2026-10-31T19:55:14Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-96-LAZY` **Loads on first use** - MEDIUM; three.js loads only when the first mesh file opens; the STEP WASM loads only when a STEP file opens
  - evidence: media_mesh.spec.ts ACC-MESH-96-LAZY: no three chunk before the first open, three after, no WASM for an STL and a lab WASM response for STEP; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: record requests: no three chunk at lab start, no WASM when an STL opens
  - test-tags: E2E
  - log: 2026-10-31T19:55:15Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-97-LOCAL` **No outside requests** - HIGH; opening any format sends no request to a host other than the lab
  - evidence: media_mesh.spec.ts ACC-MESH-97-LOCAL: opening all six formats sends only lab-origin, blob: and data: requests, with /files/ used; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: record every request while opening each format, assert one host
  - test-tags: E2E
  - log: 2026-10-31T19:55:15Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-98-PACKAGE` **Wheel contents** - HIGH; the wheel holds the STEP WASM file as a separate file and the occt-import-js and OCCT LGPL-2.1 licence texts
  - evidence: unzip -l dist/jupyterlab_advanced_image_viewer_extension-1.2.7-py3-none-any.whl: occt-import-js.wasm is a separate 7,604,031-byte file, license.occt-import-js.txt and license.occt.txt (LGPL-2.1) are in labextension/static and the share copy, third-party-licenses.json names occt-import-js; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: build the wheel and list it
  - test-tags: MANUAL
  - log: 2026-10-31T19:55:15Z @kj added
  - log: 2026-11-01T12:51:07Z @kj closed
- [x] `ACC-MESH-99-DOCS` **README** - MEDIUM; the README names the mesh viewer in the intro, lists formats, controls, keys, the 1 GiB limit and the LGPL-2.1 STEP reader, and shows whole-lab screenshots at 3840x2160 in the dark theme through repository-relative paths
  - evidence: README.md '## Mesh viewer' lists formats (STL, PLY, OBJ, 3MF, GLB, STEP), controls, Page Up/Page Down keys, the 1 GiB limit and the LGPL-2.1 occt-import-js STEP reader; .resources/mesh-viewer.png measured 3840x2160, dark-theme whole window with globe.stl visible; all four README image paths repository-relative and 3840x2160
  - test: read README.md; open each image path from the repository root
  - test-tags: MANUAL
  - log: 2026-10-31T19:55:15Z @kj added
  - log: 2026-11-01T13:16:10Z @kj closed
- [x] `ACC-MESH-100-THREEMF` **3MF renders** - HIGH; 3MF renders with the colours the file sets
  - evidence: media_mesh.spec.ts ACC-MESH-100-THREEMF: the orange 3MF renders with warm > 200 and 12 triangles; Galata 84 passed, logs/mesh-galata-verify-formats-2.log
  - test: generate a 3MF with one coloured object, assert model pixels and that colour in the pixels
  - test-tags: E2E
  - log: 2026-10-31T19:56:12Z @kj added
  - log: 2026-11-01T12:51:05Z @kj closed
- [x] `ACC-MESH-101-LIGHTS` **Lighting styles** - HIGH; three lighting styles - Studio (the environment light, the default), Neutral (a hemisphere fill plus a camera light) and Three-point (key, fill and rim) - switched from the toolbar; the model redraws at once and the style follows the tab and the next file in the folder like the shading
  - evidence: media_mesh.spec.ts ACC-MESH-101-LIGHTS: every cube face and torus interior >= 3:1 both themes, three styles differ, Three-point rim brighter, Neutral lifts the darkest face 12.7 percent, carried on Page Down; meshutil.spec.ts rig membership; Galata 39 passed, logs/mesh-galata-verify-features-1.log
  - test: open a curved mesh and a cube, screenshot each style in both themes; assert the three renders differ, Three-point shows a brighter rim than Studio and Neutral lifts the darkest face
  - test-tags: E2E
  - mechanism: 2026-11-01T14:15:51Z @kj the scene swaps between three light rigs and the material's unlit flag; the toolbar sets it and the shading call re-renders
  - log: 2026-11-01T14:15:51Z @kj added
  - log: 2026-11-01T14:49:11Z @kj amended text "three lighting styles - Studio (the environment light, the default), Headlight (light from the camera) and Unlit (a flat colour) - switched from the toolbar; the model redraws at once and the style follows the tab and the next file in the folder like the shading" -> "three lighting styles - Studio (the environment light, the default), Neutral (a hemisphere fill plus a camera light) and Three-point (key, fill and rim) - switched from the toolbar; the model redraws at once and the style follows the tab and the next file in the folder like the shading"; reason: aligned with the researched convention in tmp/workflows/mesh-viewer/20-feature-research.md: named light rigs cost no bytes and no dependency, and Unlit is a material mode rather than a lighting style
  - log: 2026-11-01T14:49:14Z @kj edited test "open a mesh, screenshot under each style in both themes; assert the three renders differ and Unlit shows one shade across a curved face" -> "open a curved mesh and a cube, screenshot each style in both themes; assert the three renders differ, Three-point shows a brighter rim than Studio and Neutral lifts the darkest face"
  - log: 2026-11-01T18:13:28Z @kj closed
- [x] `ACC-MESH-102-GRID` **Background grid** - MEDIUM; a ground grid behind and below the model, off by default, toggled from the toolbar; it never hides the model, its lines meet 3:1 against the panel in both themes, and the toggle follows the tab and the next file in the folder
  - evidence: media_mesh.spec.ts ACC-MESH-102-GRID: 45564 grid pixels at 7.46:1 light and 8.13:1 dark, model interior byte-identical, off restores every pixel, on after Page Down and Reload; Galata 39 passed, logs/mesh-galata-verify-features-1.log
  - test: toggle the grid on and off; assert grid pixels appear outside the model silhouette, the model pixels are unchanged and the grid lines reach 3:1 in both themes
  - test-tags: E2E
  - mechanism: 2026-11-01T14:15:55Z @kj a grid helper sits in the scene under the model; the toolbar sets its visibility and the camera fit ignores it
  - log: 2026-11-01T14:15:55Z @kj added
  - log: 2026-11-01T18:13:30Z @kj closed
- [x] `ACC-MESH-103-PROJ` **Orthographic and perspective** - HIGH; a toolbar toggle between perspective (the default) and orthographic projection; the switch keeps the model the same size and centred in the panel
  - evidence: media_mesh.spec.ts ACC-MESH-103-PROJ: width -6.8 percent, height -2.5 percent, centre 8.1 percent, isOrthographicCamera true, pressed state, back within 1 px; Galata 39 passed, logs/mesh-galata-verify-features-1.log
  - test: open a model, toggle projection; assert the model's bounding box stays within 10 percent of its size and centre
  - test-tags: E2E
  - mechanism: 2026-11-01T14:15:55Z @kj two camera projections share one position and target; the toggle swaps the projection and re-fits at the same distance
  - log: 2026-11-01T14:15:55Z @kj added
  - log: 2026-11-01T18:13:33Z @kj closed
- [x] `ACC-MESH-104-VIEWS` **Standard views** - HIGH; a view control with top, bottom, front, back, left, right and the four isometric corners; each names a camera direction, puts the named side towards the camera without rolling the model, and fits it to the panel
  - evidence: media_mesh.spec.ts ACC-MESH-104-VIEWS: ten views, named faces > 50000 px and absent < 5000, corner and pole quadrants, fit within 8 percent, camera.up unchanged; meshutil.spec.ts unit directions; Galata 39 passed, logs/mesh-galata-verify-features-1.log
  - test: open an asymmetric cube, pick each of the ten views, screenshot; assert the expected face faces the camera and the model stays fitted
  - test-tags: E2E, UNIT
  - mechanism: 2026-11-01T14:15:59Z @kj a table of ten unit direction vectors and their up vectors sets the camera and re-fits; one view at a time, the previous view is not remembered across files
  - log: 2026-11-01T14:15:59Z @kj added
  - log: 2026-11-01T18:13:35Z @kj closed
- [x] `ACC-MESH-105-REALFILE` **Supplied real model opens** - HIGH; the binary STL the Star Colonel supplied on 2026-11-01, 630884 bytes and 12616 triangles, opens from the file browser and renders lit with its silhouette visible; the read-out names 12616 triangles and its dimensions; Reload, a standard view, the grid and the projection toggle each keep it on screen
  - evidence: media_mesh.spec.ts ACC-MESH-105-REALFILE: 630884-byte fixture reads 12,616 triangles and 144.4 x 93.3 x 12.8, on show after open, Reload, Front, Grid and Orthographic; Galata 39 passed, logs/mesh-galata-verify-features-1.log
  - test: open ui-tests/tests/fixtures/all-clamp-and-toes.stl; assert model pixels, the read-out triangle count, and the model after Reload, a view, the grid and the projection toggle
  - test-tags: E2E
  - log: 2026-11-01T14:24:12Z @kj added
  - log: 2026-11-01T18:13:37Z @kj closed
- [x] `ACC-MESH-106-PERF-UI` **Opening a large mesh never blocks the UI** - HIGH; opening a 95 MB binary STL keeps the browser answering: no main-thread task over 200 ms from the first byte to the model, measured by a requestAnimationFrame gap probe during the open
  - evidence: ui-tests/tests/media_mesh.spec.ts:3466 ACC-MESH-106 passed in logs/mesh-galata-verify-worker-1.log (42/42, exit 0): longest rAF gap 116.6 ms, no gap over 200 ms, model read-out in 4,289 ms; verifier probe 183.3 ms and 4,487 ms
  - test: open a 95 MB STL while a rAF probe records gaps; assert the longest gap is at most 200 ms and the model appears within 20 s
  - test-tags: E2E
  - log: 2026-11-01T14:34:29Z @kj added
  - log: 2026-11-01T21:36:23Z @kj closed
- [x] `ACC-MESH-107-PERF-FPS` **Large model orbits at frame rate** - MEDIUM; a model of about one million triangles orbits and zooms at 25 frames per second or better and stops rendering when nothing moves: at most two frames in three idle seconds; the viewer picks its triangle level by measuring the drawn frame interval, so the rate holds on a software rasterizer as well as on a GPU
  - evidence: ui-tests/tests/media_mesh.spec.ts:3817 ACC-MESH-107-PERF-FPS passed in logs/mesh-galata-verify-lod-2.log (44 of 44 tests, exit 0): 165 drawn frames in 5000.2 ms = 33.0 fps against the 25 fps bar, drawn-interval median 33.3 ms; the level was chosen by measurement and settled at level 3 with 15,624 triangles, levelFits true and floorMiss false; at rest level 0 with the 1,000,000-triangle mesh visible and the proxy hidden; idle 180 ticks / 0 frames / 0 draws in 3003.1 ms; the independent probe measured 32.89 fps with the same 0 idle frames
  - test: orbit a 1M-triangle model for 5 s and count frames, then idle 3 s and count frames; assert 25 fps or better and at most two idle frames; assert the triangle level was chosen by measurement, not a constant
  - test-tags: E2E
  - log: 2026-11-01T14:34:30Z @kj added
  - log: 2026-11-01T22:55:28Z @kj measured
  - log: 2026-11-01T22:56:07Z @kj measured: 2.51 fps over 5.97 s (15 drawn frames), drawn-interval median 366.7 ms, idle 180 ticks / 0 frames / 0 draws in 3.00 s; renderer ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), the only WebGL renderer here. An environment limit, not a pass: the 30 fps bar stays unverified. logs/mesh-verify-51-galata-perf.log:314; reason: the renderer string, the drawn intervals and the idle counts are the evidence that the fps bar is an environment limit, not a pass
  - log: 2026-11-02T10:16:15Z @kj amended text "a model of about one million triangles orbits and zooms at 30 frames per second or better and stops rendering when nothing moves: at most two frames in three idle seconds" -> "a model of about one million triangles orbits and zooms at 25 frames per second or better and stops rendering when nothing moves: at most two frames in three idle seconds; the viewer picks its triangle level by measuring the drawn frame interval, so the rate holds on a software rasterizer as well as on a GPU"; reason: Star Colonel set the comfortable rate at 25 fps on 2026-11-02 and required adaptive runtime simplification
  - log: 2026-11-02T10:25:13Z @kj edited test "orbit a 1M-triangle model for 5 s and count frames, then idle 3 s and count frames; assert 30 fps or better and at most two idle frames" -> "orbit a 1M-triangle model for 5 s and count frames, then idle 3 s and count frames; assert 25 fps or better and at most two idle frames; assert the triangle level was chosen by measurement, not a constant"; reason: the Star Colonel set 25 fps on 2026-11-02 and the test now asserts the measured level
  - log: 2026-11-02T12:14:53Z @kj closed; reason: y
  - log: 2026-11-02T12:14:58Z @kj reopened; evidence retired: x; reason: verifier argument check applied the close; reopened until the round-2 gates finish
  - log: 2026-11-02T12:21:55Z @kj closed; reason: round-2 verifier gate run: install, jest, pytest, lint and the full 44-test Galata suite all passed
  - log: 2026-11-06T19:28:43Z @kj failed once in logs/audio-w-suite.log while another project's Galata suite loaded the machine, passed 3 of 3 alone in logs/audio-w-mesh107.log
- [x] `ACC-MESH-108-PERF-MEM` **Large mesh fits the memory budget** - HIGH; a 95 MB binary STL opens with a JS heap peak of 1.5 GB or less, and closing the tab returns the WebGL context and the heap
  - evidence: ui-tests/tests/media_mesh.spec.ts:3501 ACC-MESH-108 passed in logs/mesh-galata-verify-worker-1.log (42/42, exit 0): page+worker heap peak 359,910,869 B (0.34 GiB), workerPeak 290,538,319 B, context lost and 8,098,824 B heap returned; verifier probe 310,618,392 B
  - test: open a 95 MB STL, sample performance.memory during the open, close the tab; assert the heap peak and that the WebGL context is lost
  - test-tags: E2E
  - log: 2026-11-01T14:34:32Z @kj added
  - log: 2026-11-01T21:36:25Z @kj closed
- [x] `ACC-MESH-109-PERF-SERVE` **Server streams a large mesh** - MEDIUM; the server answers a mesh download with HTTP range support, a 206 for a Range request, streams the file without holding it in memory, and its resident size grows by 200 MB or less while a 1 GiB file is downloaded
  - evidence: jupyterlab_advanced_image_viewer_extension/tests/test_server_range.py 2 passed in 8.86 s, exit 0 (logs/mesh-verify-51-pytest.log): Range bytes=1000-1999 returns 206 with Content-Range bytes 1000-1999/4096, Content-Length 1000 and the exact 1000 B body, 416 past EOF; the full 1,073,741,824 B download grows VmRSS 9,715,712 B of the 209,715,200 B budget
  - test: pytest against the server with a 1 GiB sparse file: a Range request returns 206 with the right bytes and the process RSS growth stays under 200 MB
  - test-tags: INTEGRATION
  - log: 2026-11-01T14:34:33Z @kj added
  - log: 2026-11-01T22:56:09Z @kj closed: verified: independent run, 206 with exact bytes and a 1 GiB stream with 9.3 MiB RSS growth
- [x] `ACC-MESH-110-PERF-LARGE` **A 1 GiB mesh opens** - HIGH; a 1 GiB binary STL opens without killing the tab or blocking the UI over 200 ms, with a JS heap peak of 4 GB or less; the readers must leave the main thread and the normal pass must be memory-bounded
  - evidence: ui-tests/tests/media_mesh.spec.ts:3574 ACC-MESH-110 passed in logs/mesh-galata-verify-worker-1.log (42/42, exit 0): 1 GiB STL shows 21,464,352 triangles in 343,615 ms, longest rAF gap 116.6 ms, page+worker heap peak 2,401,078,132 B (2.24 GiB); verifier probe 2,416,457,105 B
  - test: open a 1 GiB binary STL; assert the tab answers, no gap over 200 ms, the model appears and the heap peak stays under 4 GB
  - test-tags: E2E
  - log: 2026-11-01T14:34:37Z @kj added
  - log: 2026-11-01T21:36:27Z @kj closed
- [x] `ACC-MESH-111-THREEMF-PERF` **3MF main-thread cost is measured** - MEDIUM; a 3MF of about 250,000 and about 1,000,000 triangles opens in Galata with the frame-gap probe recording the longest main-thread task and the file bytes, so the on-page unzip, parse and normal pass is a number in the log
  - evidence: ui-tests/tests/media_mesh.spec.ts:4208 opened the generated 250k and 1M 3MF grids and logged PERF 3MF: 1,868,119 B with a 1,732 ms longest main-thread task, and 7,029,889 B with 10,449 ms, in logs/mesh-galata-fix-r2.log (47 of 47 passed, exit 0)
  - test: open the generated 250k and 1M 3MF grids and record file bytes, the longest main-thread task and the rAF gap
  - test-tags: E2E
  - log: 2026-11-02T14:10:58Z @kj added
  - log: 2026-11-02T14:11:01Z @kj closed
- [x] `ACC-MESH-135-TOOLBAR-ICONS` **Toolbar icons** - HIGH; every toolbar control carries its icon, and each icon's tooltip is its accessible name
  - evidence: media_mesh.spec.ts ACC-MESH-85-FIT opens centred and filling the panel; Fit restores it; Reset to fit, Zoom out and Zoom in read as in the image viewer; a resize keeps the shape passed, reading every toolbar item's aria-label and title; ACC-MEDIA-66-TOOLBAR passed with equal icons and empty text; ACC-MESH-89-HELP and ACC-MEDIA-67-HELP passed with aria-label 'Keybindings and help' and one svg; Galata 181/181, logs/toolbar-finish-galata.log
  - test: open a mesh, read every toolbar item's aria-label and icon
  - test-tags: E2E
  - log: 2026-11-11T15:05:58Z @kj added
  - log: 2026-11-11T15:42:23Z @kj closed; reason: evidence names the passing test titles
- [x] `ACC-MESH-136-MOMENTARY` **Momentary buttons** - MEDIUM; Reload, Zoom out, Zoom in and Fit act once and never stay pressed
  - evidence: media_mesh.spec.ts DEF-MESH-73-FIT-TOGGLE Fit, - + and Reload stay unpressed after one click passed: each control read aria-pressed false before and after the click; Galata 181/181, logs/toolbar-finish-galata.log
  - test: click each of the four once and read aria-pressed false before and after
  - test-tags: E2E
  - log: 2026-11-11T15:05:58Z @kj added
  - log: 2026-11-11T15:42:26Z @kj closed; reason: evidence names the passing test title

## Server waveform `WAVE`

Waveform peaks of every audio file, computed by the extension's server part with PyAV

- log: 2026-11-06T16:10:56Z @kj category created
- log: 2026-11-07T14:22:16Z @kj description "Waveform peaks of audio files over 100 MB, computed by the extension's server part with PyAV" -> "Waveform peaks of every audio file, computed by the extension's server part with PyAV"

- [x] `ACC-WAVE-115-FORMATS` **Peaks for every audio type** - HIGH; the server computes peaks for AAC, MP3, WAV, OGG, M4A, FLAC and OPUS files with PyAV and its bundled FFmpeg libraries, with no ffmpeg binary or system package installed
  - evidence: pytest in logs/audio-w-final-test.log (17/17): test_wave_115_peaks_for_every_audio_type[aac], [flac], [m4a], [mp3], [ogg], [opus], [wav] passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: pytest with no ffmpeg on PATH: encode 1 s of tone then 1 s of silence in each of the seven formats with PyAV, request each file's peaks, assert duration 2 s within 0.1 s and the tone's largest peak over ten times the largest in the last 0.5 s
  - test-tags: INTEGRATION
  - log: 2026-11-06T16:10:56Z @kj added; reason: Star Colonel decision of 2026-11-06: the server waveform covers every audio type JupyterLab registers that a browser plays
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T14:22:16Z @kj audio types JupyterLab 4.6 registers: aac, flac, m4a, mp3, ogg, opus, wav, all in DEMUXERS, and midi (.mid, .midi); MIDI gets no waveform: PyAV 19.0.2 has no MIDI demuxer, a generated .mid fails with InvalidDataError, Chromium plays no MIDI; reported as a gap, not added
- [x] `ACC-WAVE-116-MEMORY` **Peaks decoded as a stream** - HIGH; the server decodes the file frame by frame and never holds the whole decoded file in memory
  - evidence: pytest in logs/audio-w-final-test.log (17/17): test_wave_116_a_long_file_decodes_as_a_stream passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: pytest against a started server: after a warm-up request on a small WAV, request the peaks of a sparse 20 min 48 kHz stereo 16-bit WAV of silence, 230 MB decoded; assert the server RSS grows less than 64 MB
  - test-tags: INTEGRATION
  - log: 2026-11-06T16:10:56Z @kj added; reason: Star Colonel decision of 2026-11-06: the server decodes as a stream
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-WAVE-117-CACHE` **Peaks cached per file** - MEDIUM; the server keeps the peaks on disk per file path, size and modification time: a second open of the same file draws at once without a new decode, also after a server restart, and a changed file is decoded anew; the cache folder is capped at 1 GiB, the least recently used peaks removed first
  - evidence: pytest test_wave_117_peaks_are_cached_per_path_size_and_time and test_wave_117_the_cache_removes_the_least_recently_used_peaks_first pass in logs/audio-r3-verify-test.log (23/23), failed before in logs/audio-r3-red-server.log; live server: same peaks after a restart with no decode, folder under a lowered cap, logs/audio-r3-verify-server.log
  - test: pytest counting decodes: request a WAV's peaks twice, assert one decode; new modification time, assert two; overwrite with a 1 s WAV, assert three; zero the file keeping size and time, assert a second server process answers the same peaks; with the cap at two files, assert the least recently used goes
  - test-tags: INTEGRATION
  - log: 2026-11-06T16:10:56Z @kj added; reason: Star Colonel decision of 2026-11-06: the peaks are cached per file path, size and modification time
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-06T22:24:00Z @kj amended text "the server caches the peaks per file path, size and modification time: a second open of the same file draws at once without a new decode, and a changed file is decoded anew" -> "MEDIUM; the server keeps the peaks on disk per file path, size and modification time: a second open of the same file draws at once without a new decode, also after a server restart, and a changed file is decoded anew; the cache folder is capped at 1 GiB, the least recently used peaks removed first"; reason: DEF-WAVE-56-DISK-CACHE: the 8-entry in-memory cache decoded an unchanged file again after 8 other files or a restart
  - log: 2026-11-06T22:24:00Z @kj edited test "pytest counting decodes: request a WAV's peaks twice, assert one decode; set a new modification time, request again, assert two; overwrite it with a 1 s WAV, request again, assert three and a 1 s duration" -> "pytest counting decodes: request a WAV's peaks twice, assert one decode; new modification time, assert two; overwrite with a 1 s WAV, assert three; zero the file keeping size and time, assert a second server process answers the same peaks; with the cap at two files, assert the least recently used goes"; reason: the test now covers the restart and the 1 GiB cap of DEF-WAVE-56-DISK-CACHE
  - log: 2026-11-06T22:31:23Z @kj edited evidence "pytest in logs/audio-w-final-test.log (17/17): test_wave_117_peaks_are_cached_per_path_size_and_time passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log" -> "pytest in logs/audio-r3-test-1.log (23/23): test_wave_117_peaks_are_cached_per_path_size_and_time, with a second server process answering from the disk cache, and test_wave_117_the_cache_removes_the_least_recently_used_peaks_first passed; both failed before the fix in logs/audio-r3-red-server.log"; reason: the amended text needs the restart and cap runs as proof
  - log: 2026-11-06T23:13:03Z @kj reopened: reopened: amended while closed in round 3; the verifier closes it on its own runs; evidence retired: pytest in logs/audio-r3-test-1.log (23/23): test_wave_117_peaks_are_cached_per_path_size_and_time, with a second server process answering from the disk cache, and test_wave_117_the_cache_removes_the_least_recently_used_peaks_first passed; both failed before the fix in logs/audio-r3-red-server.log
  - log: 2026-11-06T23:13:03Z @kj closed
- [x] `ACC-WAVE-118-AUTH` **Peaks need the lab's authentication** - CRITICAL; the peaks endpoint answers only a request that carries the lab's authentication; any other request is refused before a file is opened
  - evidence: pytest in logs/audio-w-final-test.log (17/17): test_wave_118_peaks_need_the_labs_authentication passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: pytest against a started server: request a WAV's peaks with no token and with a wrong token, assert 403 and no decode each time; with the server's token, assert 200
  - test-tags: INTEGRATION
  - log: 2026-11-06T16:10:56Z @kj added; reason: Star Colonel decision of 2026-11-06: the peaks endpoint requires the lab's authentication
  - log: 2026-11-06T19:28:46Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-WAVE-119-ROOT` **Peaks only inside the root directory** - CRITICAL; the peaks endpoint opens only files inside the server's root directory: a path leading outside it is refused, and a missing file gets 404
  - evidence: pytest in logs/audio-w-final-test.log (17/17): test_wave_119_peaks_only_inside_the_root passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: pytest with a WAV outside the root: request it through a .. path and through its absolute path, assert a 4xx status and no decode for each; request a missing file, assert 404
  - test-tags: INTEGRATION
  - log: 2026-11-06T16:10:56Z @kj added; reason: Star Colonel decision of 2026-11-06: the peaks endpoint accepts only paths inside the server's root directory
  - log: 2026-11-06T19:28:47Z @kj closed; reason: names each passing test and the suite runs
- [x] `ACC-WAVE-120-PROGRESS` **Spinner while the peaks compute** - MEDIUM; while the server computes the peaks, the waveform area shows a spinner with a line saying that the waveform is being drawn, and the playback controls already work
  - evidence: Galata media_audio.spec.ts:1265 'ACC-WAVE-120-PROGRESS while the peaks compute, the waveform area shows a spinner with a line and the file already plays' passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: hold the peaks answer with page.route, open the 60 s WAV, assert the spinner and the line in the waveform area; click Play, assert currentTime advances; release the answer, assert no spinner and the waveform drawn
  - test-tags: E2E
  - log: 2026-11-06T16:11:03Z @kj added; reason: Star Colonel decision of 2026-11-06: playback starts from the file URL before the peaks arrive
  - log: 2026-11-06T19:28:47Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T14:22:16Z @kj edited test "hold the peaks answer with page.route, open the 60 s WAV reported over 100 MB, assert the spinner and the line in the waveform area; click Play, assert currentTime advances; release the answer, assert no spinner and the waveform drawn" -> "hold the peaks answer with page.route, open the 60 s WAV, assert the spinner and the line in the waveform area; click Play, assert currentTime advances; release the answer, assert no spinner and the waveform drawn"; reason: owner decision of 2026-11-07: no size is faked, every file takes the file URL path
- [x] `ACC-WAVE-121-FALLBACK` **No peaks: seek slider and a sentence** - HIGH; when the peaks request fails, because the server part is missing or the file is unsupported or damaged, the spinner goes, the tab stays as ACC-AUDIO-113-SEEKBAR states, and a sentence says that the waveform could not be drawn
  - evidence: Galata media_audio.spec.ts:1326 'ACC-WAVE-121-FALLBACK a failed peaks request leaves the seek slider and says that the waveform could not be drawn' passed; pytest in logs/audio-w-final-test.log (17/17): test_wave_121_a_damaged_wav_gets_an_error_status_not_peaks passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - related: ACC-AUDIO-113-SEEKBAR - the state a failed peaks request leaves
  - test: for the 60 s WAV, answer the peaks request 404, then 500; each time assert the sentence, no spinner, no controls attribute, and that the slider at 50% moves playback to 30 s; pytest: a damaged WAV gets an error status, not peaks
  - test-tags: E2E, INTEGRATION
  - log: 2026-11-06T16:11:03Z @kj added; reason: Star Colonel decision of 2026-11-06: the bar and its seek slider are the fallback of the server waveform
  - log: 2026-11-06T19:28:47Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T14:22:16Z @kj edited test "for the 60 s WAV reported over 100 MB, answer the peaks request 404, then 500; each time assert the sentence, no spinner, no controls attribute, and that the slider at 50% moves playback to 30 s; pytest: a damaged WAV gets an error status, not peaks" -> "for the 60 s WAV, answer the peaks request 404, then 500; each time assert the sentence, no spinner, no controls attribute, and that the slider at 50% moves playback to 30 s; pytest: a damaged WAV gets an error status, not peaks"; reason: owner decision of 2026-11-07: no size is faked, every file takes the file URL path
- [x] `ACC-WAVE-122-INSTALL` **Server part installed and enabled** - HIGH; installing the package installs PyAV and enables the extension's server part with no further step
  - evidence: pytest in logs/audio-w-final-test.log (17/17): test_wave_122_the_installed_package_enables_the_server_part passed; whole Galata suite 153/154 in logs/audio-w-suite.log, the one failure ACC-MESH-107-PERF-FPS outside this change, passed 3/3 alone in logs/audio-w-mesh107.log
  - test: build the wheel, assert it holds the jupyter_server_config.d JSON enabling the server part and lists av in Requires-Dist; after make -o increment_version install, assert `jupyter server extension list` shows it enabled OK
  - test-tags: INTEGRATION
  - log: 2026-11-06T16:11:03Z @kj added; reason: Star Colonel decision of 2026-11-06: the package gains a server extension; today it has only _jupyter_labextension_paths
  - log: 2026-11-06T19:28:47Z @kj closed; reason: names each passing test and the suite runs
  - log: 2026-11-07T07:31:33Z @kj accepted by the owner on 2026-11-07: PyAV (av 19) raises the package's Python floor to 3.12

