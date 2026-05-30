# Acceptance Criteria - jupyterlab_advanced_image_viewer_extension

Project-wide acceptance criteria, derived from what the feature must do and from the stock
viewer ground truth. Every criterion is measurable (DOM numbers or tab/keystroke effects),
so a build is "done" only when these are checked with real measurements - not asserted.

Fit specifics, measured stock numbers, and reference screenshots live in
`image_fit_reference.md` (same folder). This file is the umbrella checklist for the whole
feature: fit, zoom in, zoom out, reset, pan, navigation, settings.

Conventions: assertions read the ACTIVE `.jp-ImageViewer` and its `<img>`; tolerance 2px
unless stated; "baseline" = freshly opened image, before any interaction; reference window
1500x950 (host ~918x853).

## A. Fit and display (perfect fit)

- **A1 - fully visible, no fragment**: baseline `img.rect` lies inside `host.rect` on all
  four edges (+-2px). Never a fragment.
- **A2 - aspect preserved**: `img.rect.w / img.rect.h` == source aspect within 1% (source
  aspect = `viewBox` for SVG, `naturalW/H` for raster).
- **A3 - contain fit**: when the source exceeds the host (any SVG, or a raster larger than
  host), the image touches the host on exactly one axis: `abs(img.w-host.clientW)<=2` OR
  `abs(img.h-host.clientH)<=2`, and never exceeds either.
- **A4 - no raster upscaling**: a raster smaller than the host renders at natural size
  (`img.w==naturalW`, `img.h==naturalH`, +-1px); it is not enlarged.
- **A5 - position matches stock**: baseline image is top-left (`img.x~=host.x`,
  `img.y~=host.y`); never pushed to centre or bottom.
- **A6 - baseline transform identity**: extension inline transform at open is
  `translate(0px,0px) scale(1)` or `none`; no naturalWidth-derived scale, no centering translate.
- **A7 - SVG parity (regression gate)**: `03_growth_models.svg` (viewBox 800x60) renders
  ~918x69 full width, fully visible - matching stock within 2px; NOT ~131px and NOT offset down.

## B. Zoom in

- **B1 - wheel up zooms in**: scrolling the wheel up over the image increases the rendered
  scale above baseline (img rendered size grows).
- **B2 - toolbar "+" zooms in**: clicking the zoom-in toolbar button increases scale by the
  configured `zoomStep`.
- **B3 - cursor-anchored**: wheel-zoom keeps the point under the cursor approximately fixed
  (the pixel under the pointer before and after a zoom step stays within a few px).
- **B4 - upper bound**: zoom-in saturates at a sane maximum (no infinite growth / NaN); the
  image remains rendered.

## C. Zoom out

- **C1 - wheel down zooms out**: scrolling the wheel down decreases the rendered scale.
- **C2 - toolbar "-" zooms out**: clicking zoom-out decreases scale by `zoomStep`.
- **C3 - below-fit allowed (UNLIMITED)**: zoom-out can go BELOW the fit baseline (effective
  scale < 1, image smaller than the fitted size). There is NO floor at the fit scale - this
  is an explicit requirement. It bottoms out only at a small epsilon (image still visible),
  not at fit.
- **C4 - stays visible**: at any zoom-out level the image remains within and visible in the
  host (centred/contained), never clipped to nothing.

## D. Reset / fit

- **D1 - reset returns to baseline**: the "Fit"/reset action restores exactly the A6 identity
  baseline (same rendered rect as A1-A5) from any zoom/pan state.

## E. Pan

- **E1 - drag pans when zoomed in**: with scale > 1, press-and-drag moves the image.
- **E2 - bounded**: the image can never be dragged entirely out of the host; some part is
  always visible.
- **E3 - no pan when fit/zoomed out**: at scale <= 1 there is nothing to pan (cursor not grab,
  or drag is a no-op) - the image stays put.

## F. Folder navigation

- **F1 - arrow keys advance**: pressing Left/Right arrow keys (fixed, not configurable) opens
  the previous/next image in the SAME folder, ordered naturally.
- **F2 - single tab (no stacking)**: navigating does NOT increase the open image-tab count;
  the previous viewer is replaced, so one image tab advances.
- **F3 - file browser untouched**: navigation does not change the file-browser selection or
  current directory.
- **F4 - ends clamp**: at the first/last image, prev/next respectively is a no-op (no wrap,
  no error).
- **F5 - image-only**: only image files (png/jpg/jpeg/gif/bmp/svg/webp) participate; other
  files in the folder are skipped.

## G. Settings

- **G1 - schema present**: the extension contributes a settings schema with `navEnabled` and
  `zoomStep` (visible in Settings). Navigation keys are fixed Left/Right arrows, not a setting.
- **G2 - navEnabled toggles**: with `navEnabled=false`, the arrow keys do nothing.
- **G3 - zoomStep applies**: changing `zoomStep` changes the per-step zoom delta.

## H. No regression / health

- **H1 - labextension OK**: `jupyter labextension list` shows the extension `enabled OK`.
- **H2 - no fit regression vs stock**: A1-A7 match the stock reference numbers in
  `image_fit_reference.md` within tolerance for all four reference files.
- **H3 - no new console errors**: opening an image and zooming/panning/navigating produces no
  new uncaught errors attributable to the extension.

## Verification method

1. `make install`; confirm H1.
2. Playwright -> `http://localhost:8888/user/<user>/lab`, header `Authorization: token <JUPYTERHUB_API_TOKEN>`, viewport 1500x950.
3. Reference files: `images_ip/03_growth_models.svg`, `images_ip/05_operations.svg`,
   `images_poc-dewarp-restoration-research/image-2.png`,
   `images_poc-dewarp-restoration-research/image-warping-correction-2.png`.
4. For each: open, wait, read host+img rects / naturalW,H / transforms; assert A1-A7 and H2
   with the actual numbers recorded. Screenshot vs `fit-reference/stock/`.
5. Drive wheel up/down, toolbar +/-, reset, drag; assert B,C,D,E with measured scales.
6. Drive prev/next keys; assert F (tab count before/after, file-browser unchanged); toggle
   settings; assert G.
7. Record measured values beside each criterion. Report pass/fail per criterion - never a
   bare "works".

## Definition of done

All of A1-A7, B1-B4, C1-C4, D1, E1-E3, F1-F5, G1-G3, H1-H3 verified with recorded
measurements on the reference files. Any tiny/fragment/off-position render, any inability to
zoom out below fit, or any new tab on navigation is an automatic FAIL.
