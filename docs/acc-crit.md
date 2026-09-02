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

- [ ] `ACC-FIT-1` **Fully visible, no fragment** - CRITICAL; baseline `img.rect` lies inside `host.rect` on all four edges (+-2px), never a fragment
  - test: open each reference file, read both rects, assert containment on four edges
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-2` **Aspect preserved** - CRITICAL; `img.rect.w / img.rect.h` equals the source aspect within 1%, where source aspect is `viewBox` for SVG and `naturalW/H` for raster
  - test: open each reference file, compare rendered aspect against the source aspect
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-3` **Contain fit** - HIGH; when the source exceeds the host, the image touches the host on exactly one axis (`abs(img.w-host.clientW)<=2` OR `abs(img.h-host.clientH)<=2`) and exceeds neither
  - test: open an SVG and an oversized raster, assert one axis flush and neither overflowing
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-4` **No raster upscaling** - HIGH; a raster smaller than the host renders at natural size (`img.w==naturalW`, `img.h==naturalH`, +-1px) and is not enlarged
  - test: open a raster smaller than the host, compare rendered size against natural size
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-5` **Position matches stock** - MEDIUM; the baseline image is top-left (`img.x~=host.x`, `img.y~=host.y`), never pushed to centre or bottom
  - test: open each reference file, compare img origin against host origin
  - test-tags: E2E
  - log: 2026-09-02T08:58:30Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-6` **Baseline transform identity** - HIGH; the extension inline transform at open is `translate(0px,0px) scale(1)` or `none`, with no naturalWidth-derived scale and no centering translate
  - test: open each reference file, read the pan layer inline transform
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-7` **SVG parity regression gate** - CRITICAL; `03_growth_models.svg` (viewBox 800x60) renders ~918x69 full width and fully visible, matching stock within 2px, not ~131px and not offset down
  - test: open `03_growth_models.svg`, read the img rect, compare against the recorded stock numbers
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-FIT-8` **Edge: viewBox-only SVG ignores bogus intrinsic size** - HIGH; an SVG that reports a misleading `naturalWidth/Height` still fits by CSS, and no criterion is computed from its natural size
  - test: open a viewBox-only SVG, assert the rendered size follows the host, not naturalWidth
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md

## Zoom `ZOOM`

Cursor-anchored wheel zoom and toolbar zoom, in and out, with no floor at the fit scale

- [ ] `ACC-ZOOM-9` **Wheel up zooms in** - HIGH; scrolling the wheel up over the image increases the rendered scale above baseline
  - test: open an image, wheel up once, compare rendered size against baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-10` **Toolbar plus zooms in** - HIGH; clicking the zoom-in toolbar button increases scale by the configured `zoomStep`
  - test: click the + button once, assert the scale delta equals zoomStep
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-11` **Cursor-anchored** - MEDIUM; wheel zoom keeps the point under the cursor approximately fixed, within a few px before and after a step
  - test: note the pixel under the pointer, wheel one step, re-measure that pixel position
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-12` **Upper bound** - MEDIUM; zoom-in saturates at a sane maximum with no infinite growth and no NaN, and the image stays rendered
  - test: wheel up far past the cap, assert scale stops at the cap and the img rect is finite
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-13` **Wheel down zooms out** - HIGH; scrolling the wheel down decreases the rendered scale
  - test: open an image, wheel down once, compare rendered size against baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-14` **Toolbar minus zooms out** - HIGH; clicking zoom-out decreases scale by `zoomStep`
  - test: click the - button once, assert the scale delta equals zoomStep
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-15` **Below-fit zoom-out is unlimited** - HIGH; zoom-out goes below the fit baseline (effective scale < 1, image smaller than fitted) with no floor at the fit scale, bottoming out only at a small epsilon
  - test: wheel down repeatedly, assert the scale falls below 1 and stops at the epsilon, not at 1
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-ZOOM-16` **Stays visible when zoomed out** - MEDIUM; at any zoom-out level the image remains within and visible in the host, never clipped to nothing
  - test: wheel down to the epsilon, assert the img rect is non-zero and inside the host
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md

## Reset `RESET`

The Fit control returns the view to the untouched baseline from any state

- [ ] `ACC-RESET-17` **Reset returns to baseline** - HIGH; the Fit action restores exactly the identity baseline and the same rendered rect as a freshly opened image, from any zoom or pan state
  - test: zoom and pan, click Fit, compare the img rect and inline transform against the baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md

## Pan `PAN`

Drag to move the image at any zoom, bounded so the image can touch a viewport border but never leave it or expose a gap

- [ ] `ACC-PAN-18` **Drag pans at any zoom** - HIGH; press-and-drag moves the image at every scale, including at fit
  - related: ACC-PAN-38, ACC-PAN-39 - the clamp that bounds this drag
  - test: at fit and at scale 1.5, drag 50px and read the pan layer transform
  - test-tags: E2E
  - log: 2026-09-02T08:58:31Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T08:59:47Z @kj the 1.0.7 free-slide wording (unclamped offsets, no snap-back) is superseded by ACC-PAN-38 and ACC-PAN-39; dragging at any zoom stays true, the range is now bounded
- [ ] `ACC-PAN-19` **Grab cursor always** - MEDIUM; the viewer shows the `grab` cursor at rest and `grabbing` while dragging, regardless of zoom level
  - test: read the computed cursor at fit, during a drag, and while zoomed
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-PAN-20` **Fit recenters** - MEDIUM; the Fit action is the way back to the baseline position after any drag
  - test: drag away from the baseline, click Fit, compare the img rect against the baseline
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
  - log: 2026-09-02T08:59:47Z @kj Fit stays the way back to baseline, but is no longer the only guard against a lost image; the clamp in ACC-PAN-38 and ACC-PAN-39 is
- [ ] `ACC-PAN-38` **Small image never leaves the viewport** - HIGH; when the rendered image is smaller than the viewport on an axis, drag moves it until its edge is flush with a viewport border on that axis and no further, so no part of the image leaves the visible area
  - test: at fit with a 120x80 raster in a ~918x853 host, drag 2000px in each direction, assert the img rect stays inside the host rect (+-1px) and reaches flush on the dragged edge
  - test-tags: UNIT, E2E
  - mechanism: 2026-09-02T08:59:30Z @kj one clamp per axis: the pan offset is held inside the interval between 0 and (host - image), which covers both regimes with a single formula because the baseline image renders top-left
  - log: 2026-09-02T08:59:30Z @kj added
- [ ] `ACC-PAN-39` **Large image keeps covering the viewport** - HIGH; when the rendered image is larger than the viewport on an axis, drag moves it until its edge is flush with a viewport border and never inside it, so no empty gap can be dragged in
  - test: zoom past fit, drag 2000px in each direction, assert the host rect stays fully covered on that axis and the image edge reaches flush
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:59:30Z @kj added
- [ ] `ACC-PAN-40` **Zoom-out snaps an out-of-range offset back** - HIGH; after zooming in, panning to a limit and zooming back out, the offset is re-clamped as the legal range shrinks, so the image never stays outside it; the clamp is an invariant, not only a drag-time limit
  - related: ACC-PAN-38, ACC-PAN-39 - the two rules this re-applies when the range changes
  - test: zoom to 3x, drag to a corner limit, zoom back to fit, assert the img rect is inside the host rect (+-1px) without touching Fit
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:59:30Z @kj added
- [ ] `ACC-PAN-41` **Edge: panel resize re-clamps** - MEDIUM; resizing the panel changes the legal range, and the stored offset is re-clamped against the new one, so the image never sits outside its range after a resize
  - test: pan to a limit, resize the browser window smaller and larger, assert the clamp holds after each resize
  - test-tags: E2E
  - log: 2026-09-02T08:59:30Z @kj added
- [ ] `ACC-PAN-42` **Edge: reload of a differently sized image re-clamps** - MEDIUM; refreshing to an image of a different rendered size re-clamps the stored offset against the new size rather than keeping an offset that was legal for the old one
  - related: ACC-NAV-27 - the refresh that loads the new size
  - test: pan to a limit, swap the file on disk for a differently sized image, click refresh, assert the clamp holds
  - test-tags: E2E
  - log: 2026-09-02T08:59:30Z @kj added
- [ ] `ACC-PAN-43` **Edge: rotated or flipped image clamps on its rendered bounds** - MEDIUM; after a stock rotate or flip the clamp is computed from what is actually rendered, so a rotated image can still be dragged flush to a border and no further
  - related: ACC-STOCK-35 - the stock transforms this must compose with
  - test: rotate with ] so the rendered bounds swap axes, drag 2000px each way, assert the same containment or coverage rule holds
  - test-tags: E2E
  - log: 2026-09-02T08:59:30Z @kj added

## Folder navigation `NAV`

Left and Right arrows step through the images in the same folder inside one viewer tab

- [ ] `ACC-NAV-21` **Arrow keys advance** - HIGH; Left and Right open the previous and next image in the same folder, ordered naturally
  - test: open the middle image of a folder, press Right then Left, assert the paths
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-NAV-22` **Single tab, no stacking** - HIGH; navigating does not increase the open image-tab count, so one image tab advances
  - test: count image tabs before and after three navigations
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-NAV-23` **File browser untouched** - MEDIUM; navigation does not change the file browser selection or current directory
  - test: note the file browser path and selection, navigate twice, re-read both
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-NAV-24` **Ends clamp** - MEDIUM; at the first and last image, previous and next respectively are a no-op with no wrap and no error
  - test: open the first image, press Left, assert the path is unchanged and no error is raised
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-NAV-25` **Image files only** - MEDIUM; only png, jpg, jpeg, gif, bmp, svg and webp files participate, and other files in the folder are skipped
  - test: place a .txt between two images, navigate across it, assert it is skipped
  - test-tags: UNIT, E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-NAV-26` **Copy to clipboard for raster** - MEDIUM; the image-viewer context menu offers Copy to Clipboard on raster images and hides it on SVG, copying source pixels as PNG rather than the on-screen view
  - test: right-click a PNG and an SVG, assert the item is visible then hidden, and read the clipboard back after clicking it
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-NAV-27` **Refresh reloads from disk** - MEDIUM; the toolbar refresh button reloads the image from disk in place, without closing the tab
  - test: change the file on disk, click refresh, assert naturalWidth changes to the new content
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md

## Settings `SET`

The settings schema exposes navigation and zoom-step, and changes take effect live

- [ ] `ACC-SET-28` **Schema present** - MEDIUM; the extension contributes a settings schema with `navEnabled` and `zoomStep`, and the navigation keys are fixed Left and Right rather than a setting
  - test: open Settings, assert both fields are listed and no key fields are
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-SET-29` **navEnabled toggles** - MEDIUM; with `navEnabled=false` the arrow keys do nothing
  - test: set navEnabled false, press Right, assert the path is unchanged
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-SET-30` **zoomStep applies** - MEDIUM; changing `zoomStep` changes the per-step zoom delta
  - test: set zoomStep to 0.25, click +, assert the scale delta matches
  - test-tags: E2E
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md

## Health `HEALTH`

The extension installs cleanly and adds no regression against the stock viewer

- [ ] `ACC-HEALTH-31` **Labextension OK** - CRITICAL; `jupyter labextension list` shows the extension enabled OK
  - test: run `jupyter labextension list` and grep the extension name
  - test-tags: FUNCTIONAL
  - log: 2026-09-02T08:58:32Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-HEALTH-32` **No fit regression against stock** - HIGH; the fit criteria match the stock reference numbers in `image_fit_reference.md` within tolerance for all four reference files
  - test: run the fit assertions on all four reference files and diff against the recorded stock numbers
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-HEALTH-33` **No new console errors** - MEDIUM; opening an image and zooming, panning or navigating produces no new uncaught errors attributable to the extension
  - test: capture the console during a full interaction pass and diff the error set against a stock session
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md

## Stock keybinding coexistence `STOCK`

The standard image-viewer keys keep working, and this extension composes with them

- [ ] `ACC-STOCK-34` **Stock keybindings work** - HIGH; `]` and `[` rotate clockwise and counter-clockwise, `h` and `v` flip horizontal and vertical, `0` resets stock orientation and `i` inverts colours, each updating the image's own transform
  - test: press each key and read `img.style.transform` and `img.style.filter`
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-STOCK-35` **Functionality composes after stock keys** - HIGH; after any stock keybinding, wheel and toolbar zoom, drag-pan and Fit all still operate while the rotation or flip stays applied, with the stock image transform and the pan-layer transform not clobbering each other
  - test: rotate with `]`, then zoom, pan and Fit, asserting both transforms survive each step
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md

## Help link `HELP`

A help link on the toolbar lists the controls this extension adds and the stock keys it composes with

- [ ] `ACC-HELP-36` **Accent help link** - LOW; the toolbar shows a help link, not a "?" button, rendered in the accent colour at the right end of the toolbar
  - test: read the link element and its computed colour against the resolved brand colour
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
- [ ] `ACC-HELP-37` **Help popup** - MEDIUM; clicking the link opens a dialog listing the extension controls and the standard viewer keys it composes with, each control listed once
  - test: click the link, read the dialog text, assert every control appears exactly once
  - test-tags: E2E
  - log: 2026-09-02T08:58:33Z @kj imported from docs/acceptance_criteria.md
