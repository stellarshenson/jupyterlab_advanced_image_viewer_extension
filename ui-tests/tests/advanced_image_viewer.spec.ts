import { expect, test } from '@jupyterlab/galata';

// A standalone SVG with only a viewBox (no width/height) - the case that
// broke fit before the object-fit baseline rewrite.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 60">' +
  '<rect width="800" height="60" fill="#3366cc"/></svg>';
const NAME = 'aiv-test.svg';

test.describe('Advanced Image Viewer', () => {
  // The default Galata file browser lives inside tmpPath, so the test image
  // must be uploaded there (not the server root) and opened with the Image
  // factory (an SVG is otherwise ambiguous between the editor and the viewer).
  test.beforeEach(async ({ page, tmpPath }) => {
    await page.contents.uploadContent(SVG, 'text', `${tmpPath}/${NAME}`);
  });

  test.afterEach(async ({ page, tmpPath }) => {
    await page.contents.deleteFile(`${tmpPath}/${NAME}`);
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
});
