import { expect, test } from '@jupyterlab/galata';

// A standalone SVG with only a viewBox (no width/height) - the case that
// broke fit before the object-fit baseline rewrite.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 60">' +
  '<rect width="800" height="60" fill="#3366cc"/></svg>';
const NAME = 'aiv-test.svg';

// A fixture with intrinsic dimensions. The viewBox-only SVG above has none,
// so its used width IS the containing-block width - which makes a
// smaller-than-the-host premise an equality, and its 13.3:1 aspect puts the
// vertical covering regime out of reach at any zoom the wheel helper drives.
const SMALL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" ' +
  'viewBox="0 0 200 150"><rect width="200" height="150" fill="#3366cc"/></svg>';
const SMALL_NAME = 'aiv-test-small.svg';

test.describe('Advanced Image Viewer', () => {
  // The default Galata file browser lives inside tmpPath, so the test image
  // must be uploaded there (not the server root) and opened with the Image
  // factory (an SVG is otherwise ambiguous between the editor and the viewer).
  test.beforeEach(async ({ page, tmpPath }) => {
    await page.contents.uploadContent(SVG, 'text', `${tmpPath}/${NAME}`);
    await page.contents.uploadContent(
      SMALL,
      'text',
      `${tmpPath}/${SMALL_NAME}`
    );
  });

  test.afterEach(async ({ page, tmpPath }) => {
    await page.contents.deleteFile(`${tmpPath}/${NAME}`);
    await page.contents.deleteFile(`${tmpPath}/${SMALL_NAME}`);
  });

  test('wraps the image in a pan layer and shows an accent help link', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    // The image is wrapped in our pan layer (so the stock viewer keeps the
    // image transform free for rotate/flip).
    await expect(
      viewer.locator('.jp-AdvancedImageViewer-panlayer > img')
    ).toHaveCount(1);

    // Help is rendered as an accent-coloured link, not a "?" button. It lives
    // in the document toolbar (a sibling of the .jp-ImageViewer content), so
    // it is located at page scope - only one viewer is open in this test.
    const help = page.locator('.jp-AdvancedImageViewer-help-link');
    await expect(help).toHaveText('help');
    // The link colour must equal the resolved --jp-brand-color1 accent
    // (the exact rgb differs between themes/versions, so compare values).
    const { color, brand } = await help.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--jp-brand-color1)';
      document.body.appendChild(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      return { color: getComputedStyle(el).color, brand };
    });
    expect(color).toBe(brand);
    expect(color).not.toBe('rgb(0, 0, 0)');

    // Clicking it opens the keybindings popup, listing both the extension
    // controls and the standard viewer keys it composes with.
    await help.click();
    const dialog = page.locator('.jp-Dialog');
    await expect(dialog).toContainText('previous / next image');
    await expect(dialog).toContainText('rotate clockwise');
    await expect(dialog).toContainText('flip horizontal');
    await page.locator('.jp-Dialog .jp-mod-accept').click();
  });

  test('stock rotate composes with our zoom (transforms do not clobber)', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const img = viewer.locator('img');
    const layer = viewer.locator('.jp-AdvancedImageViewer-panlayer');

    // Focus the viewer and rotate with the stock keybinding.
    await viewer.click();
    await page.keyboard.press(']');
    await expect(img).toHaveAttribute('style', /matrix/);

    // Our wheel zoom must NOT erase the rotation: the rotation stays on the
    // image while our scale lands on the pan layer.
    await viewer.evaluate((v: HTMLElement) =>
      v.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -120,
          bubbles: true,
          cancelable: true
        })
      )
    );
    await expect(img).toHaveAttribute('style', /matrix/);
    const layerStyle = await layer.getAttribute('style');
    expect(layerStyle).toMatch(/scale\(1\.[0-9]/);
  });

  // ---------------------------------------------------------------------
  // Pan clamp - ACC-PAN-38, 39, 40, 43.
  //
  // These assert the INVARIANT, never a fixed pixel geometry: the rendered
  // size depends on whether jupyterlab_fit_image_size_extension is installed
  // (it supplies the contain fit locally, and is absent in CI), so each test
  // measures both rects and applies the rule that matches what it measured.
  // Smaller than the host on an axis means stay inside it; larger means keep
  // covering it. Tolerance is 1px, because getBoundingClientRect is
  // fractional and the clamp carries a half-pixel deadband.
  // ---------------------------------------------------------------------

  const geometry = (viewer: any) =>
    viewer.evaluate((host: HTMLElement) => {
      const img = host.querySelector('img') as HTMLImageElement;
      const h = host.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      const box = (r: DOMRect) => ({
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height
      });
      return { host: box(h), img: box(i) };
    });

  // Assert the clamp rule for whichever regime the measured rects are in.
  const assertClamped = (g: {
    host: Record<string, number>;
    img: Record<string, number>;
  }): void => {
    const T = 1;
    if (g.img.width <= g.host.width + T) {
      expect(g.img.left).toBeGreaterThanOrEqual(g.host.left - T);
      expect(g.img.right).toBeLessThanOrEqual(g.host.right + T);
    } else {
      expect(g.img.left).toBeLessThanOrEqual(g.host.left + T);
      expect(g.img.right).toBeGreaterThanOrEqual(g.host.right - T);
    }
    if (g.img.height <= g.host.height + T) {
      expect(g.img.top).toBeGreaterThanOrEqual(g.host.top - T);
      expect(g.img.bottom).toBeLessThanOrEqual(g.host.bottom + T);
    } else {
      expect(g.img.top).toBeLessThanOrEqual(g.host.top + T);
      expect(g.img.bottom).toBeGreaterThanOrEqual(g.host.bottom - T);
    }
  };

  // Drag from the centre of the viewer by (dx, dy) in one press-move-release.
  const drag = async (page: any, viewer: any, dx: number, dy: number) => {
    const b = await viewer.boundingBox();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Two steps, so the controller sees a real mousemove before the release.
    await page.mouse.move(cx + dx / 2, cy + dy / 2);
    await page.mouse.move(cx + dx, cy + dy);
    await page.mouse.up();
  };

  const wheel = async (viewer: any, steps: number, deltaY: number) => {
    for (let n = 0; n < steps; n++) {
      await viewer.evaluate(
        (v: HTMLElement, d: number) =>
          v.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: d,
              bubbles: true,
              cancelable: true
            })
          ),
        deltaY
      );
    }
  };

  test('a small image drags flush to a border and no further', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    const start = await geometry(viewer);
    // Guard the premise: this test is only meaningful while the image is
    // smaller than the host on both axes.
    expect(start.img.width).toBeLessThan(start.host.width);
    expect(start.img.height).toBeLessThan(start.host.height);

    await drag(page, viewer, 2000, 2000);
    const downRight = await geometry(viewer);
    assertClamped(downRight);
    // It reached the border rather than stopping short of it.
    expect(downRight.img.right).toBeCloseTo(downRight.host.right, 0);
    expect(downRight.img.bottom).toBeCloseTo(downRight.host.bottom, 0);

    await drag(page, viewer, -4000, -4000);
    const upLeft = await geometry(viewer);
    assertClamped(upLeft);
    expect(upLeft.img.left).toBeCloseTo(upLeft.host.left, 0);
    expect(upLeft.img.top).toBeCloseTo(upLeft.host.top, 0);
  });

  test('a zoomed image keeps covering the viewport when dragged', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    // Zoom well past the host on both axes.
    await wheel(viewer, 20, -120);
    const zoomed = await geometry(viewer);
    expect(zoomed.img.width).toBeGreaterThan(zoomed.host.width);
    expect(zoomed.img.height).toBeGreaterThan(zoomed.host.height);

    await drag(page, viewer, 2000, 2000);
    const downRight = await geometry(viewer);
    assertClamped(downRight);
    // Dragging right stops when the LEFT edge reaches the host, because
    // going further would open a gap on that side.
    expect(downRight.img.left).toBeCloseTo(downRight.host.left, 0);
    expect(downRight.img.top).toBeCloseTo(downRight.host.top, 0);

    await drag(page, viewer, -4000, -4000);
    const upLeft = await geometry(viewer);
    assertClamped(upLeft);
    expect(upLeft.img.right).toBeCloseTo(upLeft.host.right, 0);
    expect(upLeft.img.bottom).toBeCloseTo(upLeft.host.bottom, 0);
  });

  test('zooming out snaps an out-of-range offset back into range', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    await wheel(viewer, 20, -120);
    await drag(page, viewer, 3000, 3000);
    const atLimit = await geometry(viewer);
    assertClamped(atLimit);

    // Zoom back out without touching Fit. The legal range shrinks under the
    // stored offset, so the clamp must pull the image back on its own.
    await wheel(viewer, 20, 120);
    const backOut = await geometry(viewer);
    assertClamped(backOut);
  });

  test('a rotated image clamps on its rendered bounds', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const img = viewer.locator('img');

    await viewer.click();
    await page.keyboard.press(']');
    await expect(img).toHaveAttribute('style', /matrix/);

    // The rendered bounds have swapped axes; the same rule must still hold,
    // and the clamp must re-run on the rotation without a drag or a resize.
    assertClamped(await geometry(viewer));

    await drag(page, viewer, 2000, 2000);
    assertClamped(await geometry(viewer));

    await drag(page, viewer, -4000, -4000);
    assertClamped(await geometry(viewer));
  });
});
