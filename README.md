# jupyterlab_advanced_image_viewer_extension

[![GitHub Actions](https://github.com/stellarshenson/jupyterlab_advanced_image_viewer_extension/actions/workflows/build.yml/badge.svg)](https://github.com/stellarshenson/jupyterlab_advanced_image_viewer_extension/actions/workflows/build.yml)
[![npm version](https://img.shields.io/npm/v/jupyterlab_advanced_image_viewer_extension.svg)](https://www.npmjs.com/package/jupyterlab_advanced_image_viewer_extension)
[![PyPI version](https://img.shields.io/pypi/v/jupyterlab-advanced-image-viewer-extension.svg)](https://pypi.org/project/jupyterlab-advanced-image-viewer-extension/)
[![Total PyPI downloads](https://static.pepy.tech/badge/jupyterlab-advanced-image-viewer-extension)](https://pepy.tech/project/jupyterlab-advanced-image-viewer-extension)
[![JupyterLab 4](https://img.shields.io/badge/JupyterLab-4-orange.svg)](https://jupyterlab.readthedocs.io/en/stable/)
[![Brought To You By KOLOMOLO](https://img.shields.io/badge/Brought%20To%20You%20By-KOLOMOLO-00ffff?style=flat)](https://kolomolo.com)
[![Donate PayPal](https://img.shields.io/badge/Donate-PayPal-blue?style=flat)](https://www.paypal.com/donate/?hosted_button_id=B4KPBJDLLXTSA)

A JupyterLab 4 extension that makes the built-in image viewer interactive. Images open fitted to the panel just like the stock viewer, then you can zoom with the wheel, pan by dragging, and step through a folder of images with the arrow keys - all in a single viewer tab.

![Advanced image viewer](https://raw.githubusercontent.com/stellarshenson/jupyterlab_advanced_image_viewer_extension/main/.resources/screenshot.png)

The viewer toolbar adds zoom in / out / fit controls and a `help` link that lists every keybinding.

## Features

- **Fit to screen** - every image opens scaled to fit the panel (same result as the stock viewer), and reset returns to that fit
- **Wheel zoom** - scroll to zoom in and out, anchored at the cursor; zoom out as far as you like
- **Drag to pan** - hold and drag to move the image at any zoom (canvas-style); the grab cursor is always available and Fit recenters
- **Toolbar controls** - zoom in, zoom out, and reset-to-fit buttons on the viewer toolbar
- **Arrow-key navigation** - Left and Right open the previous and next image in the same folder, advancing within one viewer instead of opening new tabs
- **Copy to clipboard** - right-click a raster image (PNG/JPG/…) and choose "Copy to Clipboard" to copy it as PNG to the system clipboard

## Requirements

- JupyterLab >= 4.0.0

## Install

To install the extension, execute:

```bash
pip install jupyterlab_advanced_image_viewer_extension
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_advanced_image_viewer_extension
```
