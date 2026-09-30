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

// A 200x150 lossless WebP, base64. JupyterLab binds no image viewer to the
// webp file type, so without this extension it opens in the text editor.
const WEBP = 'UklGRiQAAABXRUJQVlA4TBcAAAAvx0AlAAdQs86Uuf8BAEX6/58i+p+SCgA=';
const WEBP_NAME = 'aiv-test.webp';

// A 200x150 PNG, base64, for the raster-only context menu item.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAIAAAAUvlBOAAABIUlEQVR42u3SMREAMAgAsVJLeEItojDAyJhI+PvI6gfXvgQYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGAmNhLIwFxsJYGAuMhbEwFhgLY2EsMBbGwlhgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAsjIWxwFgYC2OBsTAWxgJjYSyMBcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGwlhgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAsjIWxwFgYC2OBsTAWxgJjYSyMBcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGAmNhLIwFuwHw6wKRHhuBmgAAAABJRU5ErkJggg==';
const PNG_NAME = 'aiv-test.png';

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

  // ACC-STOCK-35: after a stock rotate, wheel zoom, toolbar zoom, drag and
  // Fit all work and the rotation stays on the image.
  test('stock rotate composes with our zoom (transforms do not clobber)', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const img = viewer.locator('img');
    const layer = viewer.locator('.jp-AdvancedImageViewer-panlayer');
    const rotated = /matrix\(0, 1, -1, 0, 0, 0\)/;

    // Focus the viewer and rotate with the stock keybinding.
    await viewer.click();
    await page.keyboard.press(']');
    await expect(img).toHaveAttribute('style', rotated);

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
    await expect(img).toHaveAttribute('style', rotated);
    const layerStyle = await layer.getAttribute('style');
    expect(layerStyle).toMatch(/scale\(1\.[0-9]/);

    const wheeled = await scaleOf(viewer);
    await toolbarButton(page, '+').click();
    await expect(img).toHaveAttribute('style', rotated);
    expect(await scaleOf(viewer)).toBeGreaterThan(wheeled);
    await drag(page, viewer, 40, 40);
    await expect(img).toHaveAttribute('style', rotated);
    await toolbarButton(page, 'Fit').click();
    await expect(img).toHaveAttribute('style', rotated);
    expect(await layerTransform(viewer)).toBe('translate(0px, 0px) scale(1)');
  });

  test('a webp file opens in the image viewer by default', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      WEBP,
      'base64',
      `${tmpPath}/${WEBP_NAME}`
    );
    // No factory argument: this is the file browser's double-click path,
    // which takes the default viewer for the file type.
    await page.filebrowser.open(`${tmpPath}/${WEBP_NAME}`);
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const img = viewer.locator('.jp-AdvancedImageViewer-panlayer > img');
    await expect(img).toHaveCount(1);
    await expect
      .poll(() =>
        img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])
      )
      .toEqual([200, 150]);
    await page.contents.deleteFile(`${tmpPath}/${WEBP_NAME}`);
  });

  // DEF-NAV-1: Right must open the image the file browser lists next. A
  // descending name sort makes the listed order differ from the natural
  // order, so a navigation that re-sorts the folder by name fails here.
  test('arrow keys follow the order the file browser shows', async ({
    page,
    tmpPath
  }) => {
    for (const n of [1, 2, 3]) {
      await page.contents.uploadContent(
        SMALL,
        'text',
        `${tmpPath}/aiv-nav-${n}.svg`
      );
    }
    await page.filebrowser.openDirectory(tmpPath);
    await page.locator('.jp-DirListing-headerItem.jp-id-name').click();
    await expect(
      page.locator('.jp-DirListing-header .jp-mod-descending')
    ).toHaveCount(1);

    await page.filebrowser.open(`${tmpPath}/aiv-nav-2.svg`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    await viewer.focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator(
        '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel'
      )
    ).toHaveText('aiv-nav-1.svg');
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

  // ---------------------------------------------------------------------
  // Acceptance criteria and defects without a spec above. Each test names
  // the item it checks and asserts that item's own measurable outcome.
  // ---------------------------------------------------------------------

  const currentTab = (page: any) =>
    page.locator(
      '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel'
    );

  const toolbarButton = (page: any, text: string) =>
    page
      .locator(
        '.jp-MainAreaWidget:not(.lm-mod-hidden) .jp-Toolbar .jp-ToolbarButtonComponent'
      )
      .filter({ hasText: text })
      .first();

  const layerTransform = (viewer: any): Promise<string> =>
    viewer
      .locator('.jp-AdvancedImageViewer-panlayer')
      .evaluate((l: HTMLElement) => l.style.transform);

  const scaleOf = async (viewer: any): Promise<number> =>
    parseFloat(/scale\(([\d.e+-]+)\)/.exec(await layerTransform(viewer))![1]);

  // One evaluate for many notches, so a long zoom stays one round trip.
  const wheelMany = (viewer: any, steps: number, deltaY: number) =>
    viewer.evaluate(
      (v: HTMLElement, [n, d]: number[]) => {
        for (let k = 0; k < n; k++) {
          v.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: d,
              bubbles: true,
              cancelable: true
            })
          );
        }
      },
      [steps, deltaY]
    );

  // Write one setting of this extension through the application's own setting
  // registry, the path the Settings editor uses.
  const setSetting = (page: any, key: string, value: unknown) =>
    page.evaluate(
      async ([k, v]: [string, unknown]) => {
        const registry = await (window as any).galata.getPlugin(
          '@jupyterlab/apputils-extension:settings'
        );
        await registry.set(
          'jupyterlab_advanced_image_viewer_extension:plugin',
          k,
          v
        );
      },
      [key, value]
    );

  // An SVG of a given size, so a folder of distinct images needs no binary.
  const svgOf = (w: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#3366cc"/></svg>`;

  // ACC-STOCK-34: each stock key writes its transform onto the image itself.
  test('the stock keys rotate, flip, invert and reset the image', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const img = viewer.locator('img');
    await viewer.focus();

    await page.keyboard.press(']');
    await expect(img).toHaveAttribute('style', /matrix\(0, 1, -1, 0, 0, 0\)/);
    await page.keyboard.press('[');
    await expect(img).toHaveAttribute('style', /matrix\(1, 0, 0, 1, 0, 0\)/);
    await page.keyboard.press('h');
    await expect(img).toHaveAttribute('style', /matrix\(-1, 0, 0, 1, 0, 0\)/);
    await page.keyboard.press('v');
    await expect(img).toHaveAttribute('style', /matrix\(-1, 0, 0, -1, 0, 0\)/);
    await page.keyboard.press('i');
    await expect(img).toHaveAttribute('style', /invert\(1\)/);
    await page.keyboard.press('0');
    await expect(img).toHaveAttribute('style', /matrix\(1, 0, 0, 1, 0, 0\)/);
    await expect(img).toHaveAttribute('style', /invert\(0\)/);
  });

  // DEF-KEYS-2: a toolbar click must leave keyboard focus on the viewer, so
  // the stock keys and Left/Right work without a click on the image.
  test('the keys keep working after a toolbar click', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const img = viewer.locator('img');
    const buttons = [
      toolbarButton(page, '+'),
      toolbarButton(page, '-'),
      toolbarButton(page, 'Fit'),
      page
        .locator('.jp-MainAreaWidget:not(.lm-mod-hidden) .jp-Toolbar')
        .locator('[title="Reload image from disk"]')
    ];

    await viewer.click();
    for (const button of buttons) {
      await button.click();
      await page.keyboard.press(']');
      await expect(img).toHaveAttribute('style', /matrix\(0, 1, -1, 0, 0, 0\)/);
      await page.keyboard.press('[');
      await expect(img).toHaveAttribute('style', /matrix\(1, 0, 0, 1, 0, 0\)/);
    }
  });

  // DEF-NAV-4: the hidden file browser refreshes its items on its poll but
  // does not re-sort its list; navigation must still see an image added in
  // that time.
  test('Right finds an image added while the file browser is hidden', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/hidden`;
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/a.svg`);
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/c.svg`);
    await page.filebrowser.open(`${dir}/a.svg`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    await page.sidebar.close('left');
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/b.svg`);
    // Stands in for the file browser's own poll, which runs every 10 s.
    await page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('filebrowser:refresh')
    );
    await viewer.focus();
    await page.keyboard.press('ArrowRight');
    await expect(currentTab(page)).toHaveText('b.svg');
  });

  // ACC-FIT-5: the baseline image sits at the viewer's top-left, as stock.
  test('the image opens at the top-left of the viewer, untransformed', async ({
    page,
    tmpPath
  }) => {
    for (const name of [SMALL_NAME, NAME]) {
      await page.filebrowser.open(`${tmpPath}/${name}`, 'Image');
      const viewer = page.locator('.jp-ImageViewer').last();
      await viewer.waitFor();
      await expect
        .poll(() =>
          viewer
            .locator('img')
            .evaluate((i: HTMLImageElement) => i.complete && i.width > 0)
        )
        .toBe(true);
      const g = await geometry(viewer);
      expect(g.img.left).toBeCloseTo(g.host.left, 0);
      expect(g.img.top).toBeCloseTo(g.host.top, 0);
      expect(await layerTransform(viewer)).toBe('translate(0px, 0px) scale(1)');
    }
  });

  // ACC-FIT-1, 2, 4: a raster smaller than the host is whole, at natural size
  // and aspect. ACC-FIT-3 (SVG half), 7, 8: a viewBox-only SVG, the shape of
  // 03_growth_models.svg, fills the host width with its viewBox aspect and
  // stays inside the host height.
  test('the image opens whole, at its aspect, and fits the host', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent(PNG, 'base64', `${tmpPath}/${PNG_NAME}`);
    const opened = async (name: string) => {
      await page.filebrowser.open(`${tmpPath}/${name}`, 'Image');
      const viewer = page.locator('.jp-ImageViewer').last();
      await viewer.waitFor();
      await expect
        .poll(() =>
          viewer
            .locator('img')
            .evaluate((i: HTMLImageElement) => i.complete && i.width > 0)
        )
        .toBe(true);
      const g = await geometry(viewer);
      expect(g.img.left).toBeGreaterThanOrEqual(g.host.left - 2);
      expect(g.img.top).toBeGreaterThanOrEqual(g.host.top - 2);
      expect(g.img.right).toBeLessThanOrEqual(g.host.right + 2);
      expect(g.img.bottom).toBeLessThanOrEqual(g.host.bottom + 2);
      return g;
    };

    const png = await opened(PNG_NAME);
    expect(Math.abs(png.img.width - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(png.img.height - 150)).toBeLessThanOrEqual(1);
    expect(png.img.width / png.img.height / (200 / 150)).toBeCloseTo(1, 2);

    const svg = await opened(NAME);
    expect(svg.img.width / svg.img.height / (800 / 60)).toBeCloseTo(1, 2);
    expect(Math.abs(svg.img.width - svg.host.width)).toBeLessThanOrEqual(2);
    expect(svg.img.height).toBeLessThan(svg.host.height);
  });

  // ACC-ZOOM-11: the point under the cursor stays put on a wheel step, when
  // the step leaves the image inside its legal range.
  test('wheel zoom keeps the point under the cursor fixed', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    // Move the image off the borders so the zoom step does not touch them.
    await drag(page, viewer, 250, 200);
    const before = await geometry(viewer);
    const px = before.img.left + 0.3 * before.img.width;
    const py = before.img.top + 0.4 * before.img.height;

    await viewer.evaluate(
      (v: HTMLElement, [x, y]: number[]) =>
        v.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -120,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true
          })
        ),
      [px, py]
    );
    const after = await geometry(viewer);
    expect(after.img.width).toBeGreaterThan(before.img.width);
    expect(after.img.left + 0.3 * after.img.width).toBeCloseTo(px, 0);
    expect(after.img.top + 0.4 * after.img.height).toBeCloseTo(py, 0);
  });

  // ACC-ZOOM-12: zoom-in stops at a cap; the image stays rendered.
  test('zoom in stops at a maximum and the image stays rendered', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    await wheelMany(viewer, 200, -120);
    const capped = await scaleOf(viewer);
    await wheelMany(viewer, 20, -120);
    expect(await scaleOf(viewer)).toBe(capped);
    expect(capped).toBeGreaterThan(10);
    expect(capped).toBeLessThan(100);
    const g = await geometry(viewer);
    expect(Number.isFinite(g.img.width) && g.img.width > 0).toBe(true);
    assertClamped(g);
  });

  // ACC-ZOOM-16: the furthest zoom-out still shows the image inside the host.
  test('zoom out stops above zero with the image visible', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    await wheelMany(viewer, 200, 120);
    const floor = await scaleOf(viewer);
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(1);
    const g = await geometry(viewer);
    // Visible, not merely non-zero: at the floor the 200x150 fixture is still
    // several pixels on each side.
    expect(g.img.width).toBeGreaterThanOrEqual(5);
    expect(g.img.height).toBeGreaterThanOrEqual(5);
    expect(g.img.left).toBeGreaterThanOrEqual(g.host.left - 1);
    expect(g.img.right).toBeLessThanOrEqual(g.host.right + 1);
    expect(g.img.top).toBeGreaterThanOrEqual(g.host.top - 1);
    expect(g.img.bottom).toBeLessThanOrEqual(g.host.bottom + 1);
  });

  // ACC-PAN-19: grab at rest, grabbing while dragging, at any zoom.
  test('the cursor is grab at rest and grabbing while dragging', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const cursor = () =>
      viewer.evaluate((v: HTMLElement) => getComputedStyle(v).cursor);

    expect(await cursor()).toBe('grab');
    const b = (await viewer.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 20);
    expect(await cursor()).toBe('grabbing');
    await page.mouse.up();
    expect(await cursor()).toBe('grab');
    await wheelMany(viewer, 5, -120);
    expect(await cursor()).toBe('grab');
  });

  // ACC-PAN-20: Fit returns the image to the baseline after a drag and a zoom.
  test('Fit returns the image to its opening position', async ({
    page,
    tmpPath
  }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    const baseline = await geometry(viewer);

    await drag(page, viewer, 200, 150);
    await wheelMany(viewer, 3, -120);
    const moved = await geometry(viewer);
    expect(Math.abs(moved.img.left - baseline.img.left)).toBeGreaterThan(50);

    await toolbarButton(page, 'Fit').click();
    const back = await geometry(viewer);
    expect(back.img.left).toBeCloseTo(baseline.img.left, 0);
    expect(back.img.top).toBeCloseTo(baseline.img.top, 0);
    expect(back.img.width).toBeCloseTo(baseline.img.width, 0);
    expect(await layerTransform(viewer)).toBe('translate(0px, 0px) scale(1)');
  });

  // ACC-NAV-23: navigating never moves the file browser or changes its
  // selection. It is checked with the browser on another folder, because when
  // the browser lists the image's own folder JupyterLab reveals and selects
  // each opened document itself, which would hide a change made here.
  test('navigation leaves the file browser folder and selection alone', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/browse`;
    for (const n of [1, 2, 3]) {
      await page.contents.uploadContent(
        svgOf(200, 150),
        'text',
        `${dir}/${n}.svg`
      );
    }
    await page.filebrowser.open(`${dir}/1.svg`, 'Image');
    await page.locator('.jp-ImageViewer').last().waitFor();
    await page.filebrowser.openDirectory(tmpPath);
    const selected = () =>
      page
        .locator('.jp-DirListing-item.jp-mod-selected .jp-DirListing-itemText')
        .allInnerTexts();
    const folder = await page.filebrowser.getCurrentDirectory();
    const selection = await selected();

    for (const expected of ['2.svg', '3.svg']) {
      await page.locator('.jp-ImageViewer').last().focus();
      await page.keyboard.press('ArrowRight');
      await expect(currentTab(page)).toHaveText(expected);
    }
    // The tab changes before navigation has finished, so give any change it
    // makes to the file browser the time to land before reading it.
    await page.waitForTimeout(1500);
    expect(await page.filebrowser.getCurrentDirectory()).toBe(folder);
    expect(await selected()).toEqual(selection);
  });

  // ACC-NAV-24: Left on the first image and Right on the last do nothing and
  // raise no error.
  test('navigation stops at the first and the last image', async ({
    page,
    tmpPath
  }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`${e.message}\n${e.stack ?? ''}`));
    page.on('console', m => {
      if (m.type() === 'error') {
        errors.push(m.text());
      }
    });
    const dir = `${tmpPath}/ends`;
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/1.svg`);
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/2.svg`);
    await page.filebrowser.open(`${dir}/1.svg`, 'Image');
    await page.locator('.jp-ImageViewer').last().waitFor();

    const stays = async (key: string, name: string) => {
      await page.locator('.jp-ImageViewer').last().focus();
      await page.keyboard.press(key);
      // A no-op leaves nothing to wait for, so give a wrap or an error the
      // time a real step takes before asserting nothing happened.
      await page.waitForTimeout(1500);
      await expect(currentTab(page)).toHaveText(name);
      await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    };
    await stays('ArrowLeft', '1.svg');
    await page.locator('.jp-ImageViewer').last().focus();
    await page.keyboard.press('ArrowRight');
    await expect(currentTab(page)).toHaveText('2.svg');
    await stays('ArrowRight', '2.svg');
    // ACC-NAV-21: Left steps back.
    await page.locator('.jp-ImageViewer').last().focus();
    await page.keyboard.press('ArrowLeft');
    await expect(currentTab(page)).toHaveText('1.svg');
    expect(
      errors.filter(e => /advanced[ _-]?image[ _-]?viewer/i.test(e))
    ).toEqual([]);
  });

  // ACC-NAV-25: files that are not images are skipped; webp is an image.
  // ACC-NAV-22: the step replaces the image tab instead of adding one.
  test('navigation skips files that are not images', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/mixed`;
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/a.svg`);
    await page.contents.uploadContent('not an image', 'text', `${dir}/b.txt`);
    await page.contents.uploadContent(WEBP, 'base64', `${dir}/c.webp`);
    await page.filebrowser.open(`${dir}/a.svg`, 'Image');
    await page.locator('.jp-ImageViewer').last().waitFor();

    await page.locator('.jp-ImageViewer').last().focus();
    await page.keyboard.press('ArrowRight');
    await expect(currentTab(page)).toHaveText('c.webp');
    await expect(
      page
        .locator('#jp-main-dock-panel .lm-TabBar-tabLabel')
        .filter({ hasText: /\.(svg|webp|txt)$/ })
    ).toHaveCount(1);
  });

  // ACC-ZOOM-10, ACC-ZOOM-14: the toolbar + and - each move the zoom by one
  // step of zoomStep, 0.1 by default.
  test('toolbar plus and minus step the zoom', async ({ page, tmpPath }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    await toolbarButton(page, '+').click();
    expect(await scaleOf(viewer)).toBeCloseTo(1.1, 5);
    await toolbarButton(page, '+').click();
    expect(await scaleOf(viewer)).toBeCloseTo(1.21, 5);
    await toolbarButton(page, '-').click();
    expect(await scaleOf(viewer)).toBeCloseTo(1.1, 5);
  });

  // ACC-NAV-26: the context menu offers Copy to Clipboard on a raster image,
  // which puts the source pixels on the clipboard as a PNG, not the zoomed
  // view, and hides it on an SVG.
  test('Copy to Clipboard is offered on a PNG and hidden on an SVG', async ({
    page,
    tmpPath
  }) => {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.contents.uploadContent(PNG, 'base64', `${tmpPath}/${PNG_NAME}`);
    // A hidden menu item stays in the DOM, so absence is checked with
    // toBeHidden, never with a count of zero.
    const item = page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Copy to Clipboard' });
    const shown = () =>
      page.locator('.jp-MainAreaWidget:not(.lm-mod-hidden) .jp-ImageViewer');

    await page.filebrowser.open(`${tmpPath}/${PNG_NAME}`, 'Image');
    await shown().waitFor();
    await toolbarButton(page, '+').click();
    await shown().click({ button: 'right' });
    await expect(item).toBeVisible();
    await item.click();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const items = await navigator.clipboard.read();
          const png = items.find(i => i.types.includes('image/png'));
          if (!png) {
            return null;
          }
          const bitmap = await createImageBitmap(
            await png.getType('image/png')
          );
          return [bitmap.width, bitmap.height];
        })
      )
      .toEqual([200, 150]);

    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    await shown().waitFor();
    await shown().click({ button: 'right' });
    await expect(page.locator('.lm-Menu')).toBeVisible();
    await expect(item).toBeHidden();
  });

  // ACC-SET-28: the schema holds exactly navEnabled and zoomStep, and the
  // navigation keys are fixed bindings, not settings.
  test('the settings schema holds navEnabled and zoomStep only', async ({
    page
  }) => {
    const found = await page.evaluate(async () => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      const settings = await registry.load(
        'jupyterlab_advanced_image_viewer_extension:plugin'
      );
      const bindings = (window as any).jupyterapp.commands.keyBindings;
      const keysOf = (command: string) =>
        bindings
          .filter((b: any) => b.command === command)
          .map((b: any) => b.keys.join(' '));
      return {
        properties: Object.keys(settings.schema.properties).sort(),
        composite: settings.composite,
        next: keysOf('advanced-image-viewer:next-image'),
        previous: keysOf('advanced-image-viewer:previous-image')
      };
    });
    expect(found.properties).toEqual(['navEnabled', 'zoomStep']);
    expect(found.composite).toEqual({ navEnabled: true, zoomStep: 0.1 });
    expect(found.next).toEqual(['ArrowRight']);
    expect(found.previous).toEqual(['ArrowLeft']);
  });

  // ACC-SET-29: with navEnabled off, Right does nothing.
  test('turning navEnabled off stops the arrow keys', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/off`;
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/1.svg`);
    await page.contents.uploadContent(svgOf(200, 150), 'text', `${dir}/2.svg`);
    await setSetting(page, 'navEnabled', false);
    await page.filebrowser.open(`${dir}/1.svg`, 'Image');
    await page.locator('.jp-ImageViewer').last().waitFor();

    expect(
      await page.evaluate(() =>
        (window as any).jupyterapp.commands.isEnabled(
          'advanced-image-viewer:next-image'
        )
      )
    ).toBe(false);
    await page.locator('.jp-ImageViewer').last().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1500);
    await expect(currentTab(page)).toHaveText('1.svg');
  });

  // ACC-SET-30: zoomStep sets the size of one zoom step.
  test('zoomStep sets the toolbar zoom step', async ({ page, tmpPath }) => {
    await setSetting(page, 'zoomStep', 0.25);
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    await toolbarButton(page, '+').click();
    expect(await scaleOf(viewer)).toBeCloseTo(1.25, 5);
  });

  // ACC-HEALTH-33: a full interaction pass raises no error from this
  // extension, uncaught or logged.
  test('an interaction pass raises no error from the extension', async ({
    page,
    tmpPath
  }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(`${e.message}\n${e.stack ?? ''}`));
    page.on('console', m => {
      if (m.type() === 'error') {
        errors.push(m.text());
      }
    });

    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    await wheelMany(viewer, 5, -120);
    await drag(page, viewer, 300, 200);
    await wheelMany(viewer, 10, 120);
    for (const label of ['+', '-', 'Fit']) {
      await toolbarButton(page, label).click();
    }
    await page
      .locator('.jp-MainAreaWidget:not(.lm-mod-hidden) .jp-Toolbar')
      .locator('[title="Reload image from disk"]')
      .click();
    await viewer.focus();
    for (const key of [']', 'h', '0', 'ArrowRight', 'ArrowLeft']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1000);

    const ours = errors.filter(e => /advanced[ _-]?image[ _-]?viewer/i.test(e));
    expect(ours).toEqual([]);
  });

  // ACC-PAN-41: shrinking the panel re-clamps an image left at the limit.
  test('shrinking the panel re-clamps the image', async ({ page, tmpPath }) => {
    await page.filebrowser.open(`${tmpPath}/${SMALL_NAME}`, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    await drag(page, viewer, 3000, 3000);
    const flush = await geometry(viewer);
    expect(flush.img.right).toBeCloseTo(flush.host.right, 0);

    const size = page.viewportSize()!;
    await page.setViewportSize({
      width: size.width - 200,
      height: size.height - 120
    });
    await expect
      .poll(async () => {
        const g = await geometry(viewer);
        return g.host.right < flush.host.right - 100;
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const g = await geometry(viewer);
        return (
          g.img.right <= g.host.right + 1 && g.img.bottom <= g.host.bottom + 1
        );
      })
      .toBe(true);
    assertClamped(await geometry(viewer));

    await page.setViewportSize(size);
    await expect
      .poll(async () => (await geometry(viewer)).host.right)
      .toBeCloseTo(flush.host.right, 0);
    assertClamped(await geometry(viewer));
  });

  // ACC-PAN-42: refreshing to a larger image re-clamps the stored offset.
  test('refreshing to a larger image re-clamps the image', async ({
    page,
    tmpPath
  }) => {
    const path = `${tmpPath}/reload.svg`;
    await page.contents.uploadContent(svgOf(200, 150), 'text', path);
    await page.filebrowser.open(path, 'Image');
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();
    await drag(page, viewer, 3000, 3000);
    const flush = await geometry(viewer);
    expect(flush.img.right).toBeCloseTo(flush.host.right, 0);

    await page.contents.uploadContent(svgOf(400, 300), 'text', path);
    await page
      .locator('.jp-MainAreaWidget:not(.lm-mod-hidden) .jp-Toolbar')
      .locator('[title="Reload image from disk"]')
      .click();
    await expect
      .poll(() =>
        viewer.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)
      )
      .toBe(400);
    await expect
      .poll(async () => {
        const g = await geometry(viewer);
        return g.img.width > flush.img.width + 100;
      })
      .toBe(true);
    const g = await geometry(viewer);
    assertClamped(g);
    expect(g.img.right).toBeCloseTo(g.host.right, 0);
    expect(g.img.bottom).toBeCloseTo(g.host.bottom, 0);
  });
});
