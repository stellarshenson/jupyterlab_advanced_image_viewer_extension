# Image Viewer Fit Reference and Acceptance Criteria

> [!IMPORTANT]
> This is a self-note. It records how the STOCK JupyterLab image viewer fits and
> displays images - measured live with the extension UNINSTALLED - so that after
> installing `jupyterlab_advanced_image_viewer_extension` I can verify the fit is
> still correct instead of taking "it works" on faith. If installing the extension
> produces a tiny image, a fragment, an off-centre image, or an image pinned to the
> bottom, it is BROKEN and fails the acceptance criteria below. Do not claim success
> without re-running the checks.

## Why this exists

v0.1.1 of the extension broke fit badly: SVGs rendered ~131px wide and shoved ~178px
down; rasters showed at "random" sizes / fragments. Root cause: the controller read
`img.naturalWidth/naturalHeight` and wrote an `img.style.transform` that fought the
stock CSS fit. The stock viewer was always correct. This document captures the stock
ground truth and turns it into measurable acceptance criteria.

## How the stock viewer fits (the mechanism)

The stock `.jp-ImageViewer` does NOT use JavaScript or transforms to fit. The fit is
pure CSS on the `<img>`:

- `max-width: 100%; max-height: 100%` - the image box may not exceed the host content box
- `object-fit: contain; object-position: 50% 50%`
- `transform: none` at baseline (no inline transform), `transform-origin: 0 0`
- `display: inline; position: static; margin: 0; vertical-align: baseline`
- host: `display: block; overflow: auto; text-align: start` (so the image sits TOP-LEFT, not centred)

Consequences (this is the behaviour to preserve):

- **Raster, larger than host** -> scaled DOWN to contain, touching the host on the binding
  axis, aspect preserved, fully visible, top-left.
- **Raster, smaller than host** -> shown at NATURAL pixel size, NOT upscaled, top-left.
- **SVG (vector, scalable)** -> scales UP or down to fill the contain box (touches host on
  the binding axis), aspect from the `viewBox`, fully visible, top-left.
- Nothing is ever clipped at baseline; the whole image is visible.

## Ground-truth measurements (stock viewer, window 1500x950, host 918x853)

Captured with the extension uninstalled. `naturalW/H` is what `<img>` reports;
`rendered` is the on-screen `getBoundingClientRect`. Screenshots in
`fit-reference/stock/`.

| File | kind | naturalW x H | rendered W x H | fit rule observed |
|------|------|--------------|----------------|-------------------|
| `images_poc.../image-warping-correction-2.png` | raster | 2818 x 1297 | 918 x 423 | width-bound contain (shrunk); touches host width 918; fully visible |
| `images_poc.../image-2.png` | raster | 314 x 306 | 314 x 306 | fits at NATURAL size, not upscaled, top-left |
| `images_ip/03_growth_models.svg` | svg, `viewBox="0 0 800 60"` | 300 x 23 (bogus) | 918 x 68.8 | width-bound contain; scaled UP to host width; height = 918*60/800; fully visible |
| `images_ip/05_operations.svg` | svg, `viewBox="0 0 800 60"` | 300 x 23 (bogus) | 918 x 68.8 | same as growth |

Common to every case: `object-fit: contain`, `max-width/height: 100%`, `transform: none`,
top-left position (img.x == host.x, img.y == host.y).

Honesty note: a 5th capture of `02_architecture.svg` returned the same 918x68.8 as the
wide SVGs. That is a MEASUREMENT ARTIFACT - the query selected the last `.jp-ImageViewer`
in the DOM while several image tabs were open, not the freshly opened one. It is not real
data and is excluded. When re-measuring, close other image tabs first or read only the
active widget.

## The SVG viewBox trap (why naturalWidth must never be used)

A standalone SVG with only a `viewBox` and no `width`/`height` attribute (every SVG in
`images_ip/` is `viewBox="0 0 800 60"`) reports a browser-default intrinsic size through
`img.naturalWidth/naturalHeight` - measured here as **300 x 23**, which is NOT the real
aspect and NOT the rendered size. The browser renders the SVG using the `viewBox` aspect
(800:60) scaled to the host via `max-width:100%`, giving 918 x 68.8. Therefore:

- The real display aspect for an SVG comes from the `viewBox`, not `naturalWidth/Height`.
- Any fit math based on `naturalWidth/Height` is wrong for SVG (and unnecessary for raster,
  because the stock CSS already fits via `max-width/height: 100%`).

## What the extension MUST do

- Treat the stock CSS layout (`object-fit: contain` + `max-width/height: 100%`) as the
  fit baseline. The IDENTITY transform equals the correct fit for raster and SVG alike.
- Add zoom/pan as a CSS `transform` ON TOP of that baseline. Baseline = `translate(0,0) scale(1)`.
- NEVER read `naturalWidth/naturalHeight`. NEVER set `width`/`height`/`max-width`/`max-height`
  on the img. NEVER add a "centering" translate.
- Keep the stock top-left baseline position; do not relocate the image.

## Acceptance criteria for "good fit" (measurable, run with extension INSTALLED)

All assertions read the ACTIVE `.jp-ImageViewer` and its `<img>`, with one image tab open.
Tolerance 2px unless stated. The baseline state = freshly opened, before any zoom/pan.

- **AC1 - no fragment / fully visible**: `img.rect` is fully inside `host.rect`:
  `img.left >= host.left-2`, `img.top >= host.top-2`, `img.right <= host.right+2`,
  `img.bottom <= host.bottom+2`.
- **AC2 - aspect preserved**: `img.rect.w / img.rect.h` equals the source aspect within 1%.
  Source aspect = `viewBox` w/h for SVG, `naturalW/H` for raster.
- **AC3 - contain fit**: for a source that exceeds the host (any raster bigger than host, or
  any SVG), the rendered image touches the host on exactly the binding axis:
  `abs(img.w - host.clientW) <= 2` OR `abs(img.h - host.clientH) <= 2`, and never exceeds
  either (AC1).
- **AC4 - no raster upscaling**: for a raster whose natural size fits inside the host,
  `img.w == naturalW` and `img.h == naturalH` (+-1px). Small rasters are not enlarged.
- **AC5 - baseline transform is identity**: at open, the extension's inline transform is
  `translate(0px, 0px) scale(1)` or `none`. No non-zero translate, no scale derived from
  `naturalWidth`.
- **AC6 - position matches stock**: baseline `img.rect.x ~= host.rect.x` and
  `img.rect.y ~= host.rect.y` (top-left). The image is not pushed to the centre or bottom.
- **AC7 - SVG parity (the regression gate)**: `03_growth_models.svg` renders ~918 x 69
  (full host width, fully visible), NOT ~131px wide and NOT offset toward the bottom.
  Its baseline `img.rect` matches the stock numbers in the table within 2px.
- **AC8 - zoom in**: wheel-up / toolbar "+" increases the rendered scale above baseline,
  anchored near the cursor (cursor point stays roughly fixed).
- **AC9 - unlimited zoom-out**: wheel-down / toolbar "-" decreases scale, and can go BELOW
  the fit baseline (scale < 1) - there is no floor at the fit scale. `reset`/"Fit" returns
  exactly to the AC5 baseline.
- **AC10 - pan bounded**: when zoomed in (scale > 1) drag pans the image; the image can
  never be panned entirely out of the host (some part always visible).
- **AC11 - folder nav, single tab**: with N image tabs open, pressing Next/Prev opens the
  adjacent folder image and the open-image-tab count does NOT increase (previous viewer is
  replaced, not stacked). The file browser selection is not changed.

A build passes ONLY if AC1-AC7 hold for all four reference files above AND AC8-AC11 hold on
at least one file. Any tiny/fragment/off-position render fails immediately.

## How to verify (Playwright recipe)

1. Install: `make install` (bumps patch). Confirm `jupyter labextension list` shows the
   extension `enabled OK`.
2. Connect Playwright to `http://localhost:8888/user/<user>/lab` with header
   `Authorization: token <JUPYTERHUB_API_TOKEN>` (token also in `jupyter server list`).
   Set viewport 1500x950.
3. For each reference file: `goto .../lab/tree/<path>`, wait ~8s, then read the ACTIVE
   `.jp-ImageViewer` + `<img>`: `getBoundingClientRect` of host and img, `naturalWidth/Height`,
   computed `transform`, and `img.style.transform`. Assert AC1-AC7 against the table.
4. Screenshot each `.jp-ImageViewer` and compare against `fit-reference/stock/*.png`.
5. Zoom (wheel + toolbar), zoom below fit, reset, drag-pan, and Left/Right nav; assert
   AC8-AC11. Capture before/after screenshots.
6. Record actual measured numbers next to the criteria. Do not summarise as "works" without
   the numbers.

## Reference screenshots (stock, correct)

- `fit-reference/stock/warping_png.png` - wide raster, fit to width
- `fit-reference/stock/image2_png.png` - small raster at natural size, top-left
- `fit-reference/stock/growth_svg.png` - wide viewBox SVG, full width, fully visible
- `fit-reference/stock/operations_svg.png` - wide viewBox SVG, full width
