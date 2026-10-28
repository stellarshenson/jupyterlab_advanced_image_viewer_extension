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
  - evidence: ACC-AUDIO-45-WAVE waveform, ruler and playback line in the accent colour passes, Galata 76/76 local
  - test: open a generated 60 s WAV, assert the waveform, the ruler and the playback line render with non-zero size
  - test-tags: E2E
  - log: 2026-10-28T13:59:51Z @kj added
  - log: 2026-10-28T16:14:52Z @kj closed
- [x] `ACC-AUDIO-46-SEEK` **Click seeks** - CRITICAL; a click anywhere on the waveform moves playback to the time under the click within 0.5 s, paused or playing, at every point from the start to the end of the file
  - evidence: ACC-AUDIO-46-SEEK a click on the waveform seeks on a server without byte ranges passes, Galata 76/76 local
  - test: click at 25% and 75% of a 60 s WAV, assert currentTime 15 s and 45 s within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T13:59:51Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-47-OVERVIEW` **Overview seeks the whole file** - HIGH; a strip above the waveform shows the whole file with the zoomed part outlined; a click or a drag on it moves playback to that point of the file and scrolls the waveform to show it
  - evidence: ACC-AUDIO-47-OVERVIEW the overview strip seeks the whole file and scrolls the waveform passes, Galata 76/76 local
  - test: zoom in, click the strip at 90% of a 60 s WAV, assert currentTime 54 s within 0.5 s and the playback line inside the waveform view
  - test-tags: E2E
  - log: 2026-10-28T13:59:51Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-48-ZOOM` **Waveform zoom** - MEDIUM; the mouse wheel over the waveform and the toolbar - and + buttons zoom the waveform out and in; Fit shows the whole file; during playback the view scrolls to keep the playback line visible
  - evidence: ACC-AUDIO-48-ZOOM plus, minus, Fit and the wheel zoom the waveform passes, Galata 76/76 local
  - test: press + twice, assert the shown duration shrinks; press Fit, assert it equals the file duration
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-49-HOVER` **Time under the mouse** - LOW; hovering over the waveform shows the time under the mouse pointer
  - evidence: ACC-AUDIO-49-HOVER hovering shows the time under the mouse passes, Galata 76/76 local
  - test: hover at 50% of a 60 s WAV, read 00:30 within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-50-LOOP` **Loop a region** - MEDIUM; a drag on the waveform marks a region and turns Loop on; with Loop on, playback returns to the region start when it reaches the region end; turning Loop off removes the region
  - evidence: ACC-AUDIO-50-LOOP a drag marks a loop region and Loop off removes it passes, Galata 76/76 local
  - test: drag from 10 s to 20 s, play from 18 s, assert currentTime between 10 s and 13 s after 3 s; click Loop, assert no region
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-51-CONTROLS` **Playback controls** - HIGH; the toolbar has Play/Pause, back 5 s, forward 5 s, Loop and a speed choice of 0.5x, 0.75x, 1x, 1.25x, 1.5x and 2x, each acting on the open file
  - evidence: ACC-AUDIO-51-CONTROLS play, back, forward, loop and speed act on the file passes, Galata 76/76 local
  - test: from 10 s click forward twice, assert 20 s; pick 2x, assert playbackRate 2
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-52-TIME` **Current time and duration** - MEDIUM; the viewer shows the current time and the duration, updated during playback and after every seek
  - evidence: ACC-AUDIO-52-TIME the current time and the duration update on a seek passes, Galata 76/76 local
  - test: seek to 15 s in a 60 s WAV, read 00:15.0 / 01:00.0
  - test-tags: E2E
  - log: 2026-10-28T13:59:52Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-53-DETAILS` **Audio file details** - LOW; the toolbar shows the format taken from the file extension, the channel count, the file size and the duration
  - evidence: ACC-AUDIO-53-DETAILS the toolbar shows format, channels, size and duration passes, Galata 76/76 local
  - test: open the 60 s mono WAV, read WAV, mono, its size and 01:00
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-54-LARGE` **Large audio file** - HIGH; a file over 100 MB is not decoded in the browser; it opens and plays with a working seek bar and a line saying that the waveform is skipped above 100 MB
  - evidence: Jest the waveform limit suite and ACC-AUDIO-54-LARGE a file over 100 MB plays without a waveform and seeks pass, Galata 76/76 local
  - test: unit test the size limit; open a file reported over the limit, assert the seek bar works and the line shows
  - test-tags: UNIT, E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed
- [x] `ACC-AUDIO-55-ERROR` **Unreadable audio** - MEDIUM; every audio file type JupyterLab registers opens in this viewer; a file the browser cannot decode shows an error line in the viewer, never an empty or stuck panel
  - evidence: ACC-AUDIO-55-ERROR every audio type opens here and an unreadable file shows an error passes, Galata 76/76 local
  - test: open a WAV and a corrupt .mp3, assert the waveform and the error line
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:53Z @kj closed

## Video viewer `VIDEO`

Video files open in a Plyr player

- log: 2026-10-28T13:59:53Z @kj category created

- [x] `ACC-VIDEO-56-PLAYER` **Plyr player** - HIGH; a video file opens in one tab in a Plyr player with its control bar: play, seek bar, current time, mute, volume, speed menu, picture-in-picture and full screen
  - evidence: ACC-VIDEO-56-PLAYER the video opens in one tab in a Plyr player with its control bar passes, Galata 76/76 local
  - test: open the video fixture, assert the Plyr control bar and each of these buttons
  - test-tags: E2E
  - log: 2026-10-28T13:59:53Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
- [x] `ACC-VIDEO-57-SEEK` **Video seek** - CRITICAL; a click on the seek bar moves playback to the time under the click within 0.5 s, at every point from the start to the end of the file
  - evidence: ACC-VIDEO-57-SEEK a click on the seek bar moves playback to that point passes, Galata 76/76 local
  - test: click the seek bar at 50% of the fixture, assert currentTime half the duration within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
- [x] `ACC-VIDEO-58-FIT` **Video fit** - MEDIUM; the whole frame is visible and centred at every panel size, with the aspect ratio kept
  - evidence: ACC-VIDEO-58-FIT the whole frame is visible and centred at every panel size passes, Galata 76/76 local
  - test: resize the panel twice, assert the video rect inside the panel and the aspect ratio within 1%
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
- [x] `ACC-VIDEO-59-DETAILS` **Video file details** - LOW; the toolbar shows the format taken from the file extension, the frame size in pixels, the file size and the duration
  - evidence: ACC-VIDEO-59-DETAILS the toolbar shows format, frame size, size and duration passes, Galata 76/76 local
  - test: open the fixture, read its format, frame size, file size and duration
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
- [x] `ACC-VIDEO-60-ACCENT` **Accent colour** - LOW; the played part of the seek bar and the highlighted Plyr buttons use --jp-brand-color1 in the light and the dark theme
  - evidence: ACC-VIDEO-60-ACCENT the seek bar and the highlighted buttons use the brand colour passes, Galata 76/76 local
  - test: compare the computed colour with the resolved --jp-brand-color1 in both themes
  - test-tags: E2E
  - log: 2026-10-28T13:59:54Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed

## Media keys `KEYS`

Keyboard control of a focused audio or video tab

- log: 2026-10-28T13:59:55Z @kj category created

- [x] `ACC-KEYS-61-ARROWS` **Arrow keys seek** - HIGH; in a focused audio or video tab, Left and Right move playback 5 s back and forward, once per key press, stopping at the start and the end
  - evidence: ACC-KEYS-61-ARROWS Left and Right move playback 5 s and stop at the ends, and the video variant once per press, pass, Galata 76/76 local
  - test: from 10 s press Right, assert 15 s; press Left twice, assert 5 s; in an audio and a video tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
- [x] `ACC-KEYS-62-SPACE` **Space plays and pauses** - MEDIUM; Space toggles play and pause in a focused audio or video tab
  - evidence: ACC-KEYS-62-SPACE Space plays and pauses passes in the audio and the video viewer, Galata 76/76 local
  - test: press Space twice, assert playing then paused
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:57Z @kj closed
- [x] `ACC-KEYS-63-PAGE` **Page keys change file** - HIGH; Page Up and Page Down open the previous and next file of the same kind, audio or video, in the folder, in the order the file browser lists them, inside one tab, stopping at the first and the last file; the folder navigation setting turns this off
  - evidence: ACC-KEYS-63-PAGE Page Up and Page Down open the previous and next audio file, and the video variant, pass, Galata 76/76 local
  - test: with three WAV files press Page Down twice and Page Up once, assert the paths and one audio tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:58Z @kj closed
- [x] `ACC-KEYS-64-SCOPE` **Keys stay in media tabs** - HIGH; these keys act only in a focused audio or video tab; notebooks, editors and the image viewer keep their behaviour, and Left and Right still change the image in the image viewer
  - evidence: ACC-KEYS-64-SCOPE the media keys act only in a focused media tab, and the video variant, pass, Galata 76/76 local
  - test: press Left and Space in a notebook cell, assert normal editing; press Right in the image viewer, assert the next image
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:14:58Z @kj closed

## Media integration `MEDIA`

How the audio and video viewers fit into JupyterLab

- log: 2026-10-28T13:59:55Z @kj category created

- [x] `ACC-MEDIA-65-STOCK` **Stock viewers disabled** - HIGH; while this extension is installed, @jupyterlab/audio-extension:plugin and @jupyterlab/video-extension:plugin are disabled; a double click opens the new viewer, and Open With on an audio or video file lists only the new viewer
  - evidence: ACC-MEDIA-65-STOCK the stock audio and video viewers are disabled and the stock video viewer is disabled pass, Galata 76/76 local
  - test: read the widget factories for a .wav and a video path, assert one each, from this extension
  - test-tags: E2E
  - log: 2026-10-28T13:59:55Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-66-TOOLBAR` **Toolbar matches the image viewer** - MEDIUM; the media toolbar starts with the same Reload button as the image viewer, waveform zoom uses the same -, + and Fit buttons with the same tooltips, and the help link sits at the right end
  - evidence: ACC-MEDIA-66-TOOLBAR the audio toolbar matches the image viewer toolbar and the video toolbar starts with Reload and ends with help pass, Galata 76/76 local
  - test: compare the toolbar items of an audio, a video and an image tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-67-HELP` **Help link as in the image viewer** - LOW; the toolbar shows an underlined help text link in the accent colour at the right end, never a ? icon; it opens a dialog listing the media controls and keys, each once, with a Close button
  - evidence: ACC-MEDIA-67-HELP the help link lists each media control once and each video control and key once pass, Galata 76/76 local
  - test: read the link text, colour and position; open the dialog and count each control once
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-68-RELOAD` **Reload from disk** - LOW; Reload reads the file again, so a changed file shows its new waveform or picture and its new duration
  - evidence: ACC-MEDIA-68-RELOAD Reload reads the changed file again passes in the audio and the video viewer, Galata 76/76 local
  - test: overwrite the 60 s WAV with a 30 s one, click Reload, assert 00:30.0
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-69-RESTORE` **Tab restore** - MEDIUM; open audio and video tabs open again after a page reload, on the same files
  - evidence: ACC-MEDIA-69-RESTORE an audio tab and a video tab open again after a page reload pass, Galata 76/76 local
  - test: open an audio and a video tab, reload the page, assert both tabs and their paths
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-70-LOCAL` **No third-party requests** - HIGH; opening and using the viewers sends requests only to the lab's own server; the Plyr icons and its blank video are bundled
  - evidence: ACC-MEDIA-70-LOCAL opening and playing audio and video requests only the lab pass, Galata 76/76 local
  - test: record every page request while opening and playing audio and video, assert each URL is on the lab origin
  - test-tags: E2E
  - log: 2026-10-28T13:59:56Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-71-STREAM` **No content download through the contents API** - HIGH; opening a media file never fetches its content through the contents API; the player reads the file from its file URL
  - evidence: ACC-MEDIA-71-STREAM the file is never read through the contents API passes in the audio and the video viewer, Galata 76/76 local
  - test: open a video, assert no /api/contents request with content=1 for its path
  - test-tags: E2E
  - log: 2026-10-28T13:59:57Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-72-CLOSE` **Closing stops playback** - MEDIUM; closing a playing audio or video tab stops the sound and removes its media element
  - evidence: ACC-MEDIA-72-CLOSE closing a playing tab stops it and removes its element passes in the audio and the video viewer, Galata 76/76 local
  - test: play, close the tab, assert no media element is left playing
  - test-tags: E2E
  - log: 2026-10-28T13:59:57Z @kj added
  - log: 2026-10-28T16:15:01Z @kj closed
- [x] `ACC-MEDIA-73-MENU` **One item per label** - CRITICAL; the context menus of an audio tab, a video tab and their content show each label once
  - evidence: ACC-MEDIA-73-MENU no context menu item appears twice on an audio tab, and the video variant, pass, Galata 76/76 local
  - test: extend 'no context menu item appears twice' to an audio and a video tab
  - test-tags: E2E
  - log: 2026-10-28T13:59:57Z @kj added
  - log: 2026-10-28T16:15:02Z @kj closed
- [x] `ACC-MEDIA-74-BUFFER` **Small files seek without byte ranges** - CRITICAL; audio and video files up to 100 MB are downloaded once from the file URL and played from the downloaded copy, so seeking works on a server without byte ranges; larger files play from the file URL
  - evidence: ACC-MEDIA-74-BUFFER audio and video up to 100 MB are downloaded once and seek without byte ranges pass, Galata 76/76 local
  - related: DEF-MEDIA-7-SEEK - the seek failure this works around for files up to 100 MB
  - test: serve /files/ as status 200 without Accept-Ranges through page.route, open a WAV and the video fixture, seek to 50%, assert currentTime within 0.5 s
  - test-tags: E2E
  - log: 2026-10-28T14:26:15Z @kj added
  - log: 2026-10-28T16:15:02Z @kj closed

