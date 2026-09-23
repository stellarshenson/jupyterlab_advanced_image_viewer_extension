# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

## [1.1.2] - 2026-09-23

### Changed

- Acceptance criteria for dragging at any zoom and for zoom, pan and Fit after a stock rotate are verified in a browser against 1.1.1 and recorded as met

## [1.1.1] - 2026-09-23

### Added

- WebP images open in the image viewer, with pan, zoom, the toolbar, folder navigation and the stock rotate and flip keys. JupyterLab defines a `webp` file type but binds no image viewer to it, so a `.webp` opened in the text editor and failed with "not UTF-8 encoded"
- Galata integration test that opens a WebP from the file browser and checks it decodes in the viewer

## [1.1.0] - 2026-09-02

### Added

- Galata integration tests covering the pan bound in every regime: smaller than the viewport, larger than it, after a zoom-out, and after a stock rotate

### Changed

- Panning is now bounded. An image smaller than the viewport drags flush to a border and no further, a larger one always keeps covering it, and the bound re-applies whenever the legal range shrinks - zooming out, resizing the panel, reloading the image, or rotating it with the stock keys. This replaces the unbounded canvas-style sliding introduced in 1.0.7

### Fixed

- Stock rotate and flip pivoted from the centre of the image instead of its top left. Wrapping the image in the pan layer stopped JupyterLab's own `.jp-ImageViewer > img` rule from matching, so the `transform-origin` it sets was silently lost; it is now restated on the wrapped image

## [1.0.11] - 2026-08-11

### Added

- Refresh button on the image viewer toolbar that reloads the image from disk, matching the control the HTML viewer provides

## [1.0.9] - 2026-07-03

### Added

- "Copy to Clipboard" context-menu item for raster images (PNG/JPG/GIF/BMP/WEBP) that copies the image to the system clipboard as PNG; hidden for SVG, which already has "Copy as PNG"

## [1.0.7] - 2026-06-16

### Changed

- Panning is now always available (canvas-style): the grab/hand cursor shows at any zoom and dragging moves the image even at fit, with no snap-back; the Fit control recenters
