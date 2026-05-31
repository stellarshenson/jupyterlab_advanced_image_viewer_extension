import { expect, test } from '@jupyterlab/galata';

// A standalone SVG with only a viewBox (no width/height) - the case that
// broke fit before the object-fit baseline rewrite.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 60">' +
  '<rect width="800" height="60" fill="#3366cc"/></svg>';
const NAME = 'aiv-test.svg';

test.describe('Advanced Image Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.contents.uploadContent(SVG, 'text', NAME);
  });

  test.afterEach(async ({ page }) => {
    await page.contents.deleteFile(NAME);
  });

  test('wraps the image in a pan layer and shows an accent help link', async ({
    page
  }) => {
    await page.filebrowser.open(NAME);
    const viewer = page.locator('.jp-ImageViewer').last();
    await viewer.waitFor();

    // The image is wrapped in our pan layer (so the stock viewer keeps the
    // image transform free for rotate/flip).
    await expect(
      viewer.locator('.jp-AdvancedImageViewer-panlayer > img')
    ).toHaveCount(1);

    // Help is rendered as an accent-coloured link, not a "?" button.
    const help = viewer.locator('.jp-AdvancedImageViewer-help-link');
    await expect(help).toHaveText('help');
    const color = await help.evaluate(el => getComputedStyle(el).color);
    expect(color).toBe('rgb(33, 150, 243)');

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
    page
  }) => {
    await page.filebrowser.open(NAME);
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
