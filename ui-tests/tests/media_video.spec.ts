import { expect, test } from '@jupyterlab/galata';

import { readFileSync } from 'fs';

import * as path from 'path';

// The fixture was made once with imageio-ffmpeg installed only for the build
// (pip install --target tmp/workflows/media-viewer/tools imageio-ffmpeg):
//
//   tmp/workflows/media-viewer/tools/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2 \
//     -y -f lavfi \
//     -i "color=c=0x202020:s=320x180:r=25:d=20,drawbox=x='t*12':y=60:w=60:h=60:color=0xff0000:t=fill" \
//     -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=20" \
//     -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p \
//     -c:a aac -b:a 64k -ac 2 -movflags +faststart -shortest clip.mp4
//
// clip-short.mp4 is the same command with d=10, a blue box and 880 Hz.
const CLIP = readFileSync(path.join(__dirname, 'fixtures', 'clip.mp4'));
const SHORT = readFileSync(path.join(__dirname, 'fixtures', 'clip-short.mp4'));
const NAME = 'clip.mp4';
const FACTORY = 'AdvancedVideoViewer';
const SHOWN = '.jp-MainAreaWidget:not(.lm-mod-hidden)';

test.describe('Video viewer', () => {
  test.beforeEach(async ({ page, tmpPath }) => {
    await page.contents.uploadContent(
      CLIP.toString('base64'),
      'base64',
      `${tmpPath}/${NAME}`
    );
  });

  const viewer = (page: any) =>
    page.locator(`${SHOWN} .jp-AdvancedMediaViewer`);
  const media = (page: any) =>
    page.locator(`${SHOWN} .jp-AdvancedMediaViewer-media`);
  const toolbar = (page: any) => page.locator(`${SHOWN} .jp-Toolbar`);
  const details = (page: any) =>
    toolbar(page).locator('.jp-AdvancedMediaViewer-details');
  const button = (page: any, title: string) =>
    toolbar(page).locator(`[title="${title}"]`).first();
  const currentTab = (page: any) =>
    page.locator(
      '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel'
    );

  const currentTime = (page: any): Promise<number> =>
    media(page).evaluate((m: HTMLMediaElement) => m.currentTime);
  const paused = (page: any): Promise<boolean> =>
    media(page).evaluate((m: HTMLMediaElement) => m.paused);
  const playerInfo = (page: any) =>
    media(page).evaluate((m: HTMLMediaElement) => ({
      src: m.src,
      duration: m.duration,
      seekable: m.seekable.length ? m.seekable.end(0) : 0
    }));

  // Move playback and wait until the element has landed there.
  const seek = (page: any, seconds: number) =>
    media(page).evaluate(
      (m: HTMLMediaElement, t: number) =>
        new Promise(resolve => {
          m.addEventListener('seeked', () => resolve(null), { once: true });
          m.currentTime = t;
        }),
      seconds
    );

  // Open with a double click, the default viewer, and wait for the player
  // and the metadata of the file.
  const open = async (page: any, file: string) => {
    await page.filebrowser.open(file);
    await viewer(page).waitFor();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const content = (window as any).jupyterapp.shell.currentWidget
              ?.content;
            return content?.player ? content.media.duration : 0;
          }),
        { timeout: 20000 }
      )
      .toBeGreaterThan(0);
  };

  // The box of the player and of the video element.
  const boxes = (page: any) =>
    page.evaluate((shown: string) => {
      const box = (selector: string) => {
        const el = document.querySelector(selector) as HTMLElement;
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom
        };
      };
      return {
        panel: box(`${shown} .jp-AdvancedMediaViewer`),
        frame: box(`${shown} .jp-AdvancedMediaViewer-frame`),
        video: box(`${shown} .jp-AdvancedMediaViewer-media`)
      };
    }, SHOWN);

  // A colour as the browser resolves it, to compare #rrggbb with rgb().
  const resolved = (page: any, colour: string): Promise<string> =>
    page.evaluate((c: string) => {
      const probe = document.createElement('span');
      probe.style.color = c;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, colour);
  const seekColour = (page: any): Promise<string> =>
    page.evaluate(
      (shown: string) =>
        getComputedStyle(document.querySelector(`${shown} [data-plyr="seek"]`)!)
          .color,
      SHOWN
    );

  const expectInside = (
    inner: { x: number; right: number; y: number; bottom: number },
    outer: { x: number; right: number; y: number; bottom: number }
  ) => {
    expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.5);
    expect(inner.right).toBeLessThanOrEqual(outer.right + 0.5);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y - 0.5);
    expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 0.5);
  };

  // ACC-VIDEO-56-PLAYER
  test('ACC-VIDEO-56-PLAYER the video opens in one tab in a Plyr player with its control bar', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await expect(
      page
        .locator('#jp-main-dock-panel .lm-TabBar-tabLabel')
        .filter({ hasText: NAME })
    ).toHaveCount(1);
    await expect(viewer(page).locator('.plyr video')).toHaveCount(1);

    for (const control of ['play', 'mute', 'settings', 'pip', 'fullscreen']) {
      // The settings menu items carry data-plyr="settings" as well; the
      // control bar button comes first.
      await expect(
        viewer(page).locator(`[data-plyr="${control}"]`).first()
      ).toBeVisible();
    }
    const seek = viewer(page).locator('[data-plyr="seek"]');
    await expect(seek).toBeVisible();
    await expect(
      viewer(page).locator('input[data-plyr="volume"]')
    ).toBeVisible();
    await expect(viewer(page).locator('.plyr__time--current')).toHaveText(
      '00:00'
    );
    await expect(viewer(page).locator('.plyr__time--duration')).toHaveText(
      '00:20'
    );
    expect(Number(await seek.getAttribute('aria-valuemax'))).toBeCloseTo(20, 0);

    // The speed menu offers the rates and changes the playback speed.
    await viewer(page).locator('[data-plyr="settings"]').first().click();
    const menu = viewer(page).locator('.plyr__menu__container');
    await expect(menu).toBeVisible();
    const speed = menu
      .locator('button[role="menuitem"]:visible')
      .filter({ hasText: 'Speed' });
    await expect(speed).toHaveCount(1);
    await speed.click();
    const rate = menu
      .locator('button[role="menuitemradio"]:visible')
      .filter({ hasText: '1.5×' });
    await expect(rate).toHaveCount(1);
    await rate.click();
    expect(
      await media(page).evaluate((m: HTMLMediaElement) => m.playbackRate)
    ).toBe(1.5);

    // Fullscreen fills the screen although fitVideo writes inline pixel
    // sizes on the player (DEF-MEDIA-8). Headless Chromium may refuse the
    // native Fullscreen API; Plyr then swaps in plyr--fullscreen-fallback,
    // which the same rule sizes.
    const player = viewer(page).locator('.plyr');
    const fitted = (await player.boundingBox())!;
    const fullscreen = () =>
      page.evaluate((shown: string) => {
        const element = document.querySelector(`${shown} .plyr`) as HTMLElement;
        const box = element.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          native: document.fullscreenElement === element,
          fallback: element.classList.contains('plyr--fullscreen-fallback')
        };
      }, SHOWN);
    await viewer(page).locator('[data-plyr="fullscreen"]').first().click();
    await expect
      .poll(async () => {
        const f = await fullscreen();
        return f.native || f.fallback;
      })
      .toBe(true);
    const full = await fullscreen();
    // Printed so the run log states which path this browser took.
    console.log(
      `ACC-VIDEO-56 fullscreen path: ${full.native ? 'native' : 'fallback'}`
    );
    expect(Math.abs(full.width - full.viewportWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(full.height - full.viewportHeight)).toBeLessThanOrEqual(2);

    await page.keyboard.press('Escape');
    await expect
      .poll(async () => {
        const f = await fullscreen();
        return f.native || f.fallback;
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const box = (await player.boundingBox())!;
        return (
          Math.abs(box.width - fitted.width) <= 2 &&
          Math.abs(box.height - fitted.height) <= 2
        );
      })
      .toBe(true);
  });

  // ACC-VIDEO-57-SEEK. The file is served as the owner's server serves
  // /files/ (DEF-MEDIA-7-SEEK): status 200, the whole file, no Accept-Ranges.
  // A player on that URL cannot seek; the viewer seeks in a blob of it.
  test('ACC-VIDEO-57-SEEK a click on the seek bar moves playback to that point', async ({
    page,
    tmpPath
  }) => {
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
        body: CLIP
      });
    });
    await open(page, `${tmpPath}/${NAME}`);

    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const box = (await viewer(page)
        .locator('[data-plyr="seek"]')
        .boundingBox())!;
      await page.mouse.click(
        box.x + box.width * fraction,
        box.y + box.height / 2
      );
      await expect
        .poll(() => currentTime(page))
        .toBeGreaterThan(20 * fraction - 0.5);
      expect(await currentTime(page)).toBeLessThan(20 * fraction + 0.5);
    }

    // Also while playing. A click on the bar pauses, seeks and resumes, so
    // playback is stopped again before the time is read.
    await viewer(page).locator('[data-plyr="play"]').click();
    await expect.poll(() => paused(page)).toBe(false);
    const box = (await viewer(page)
      .locator('[data-plyr="seek"]')
      .boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await media(page).evaluate((m: HTMLMediaElement) => m.pause());
    await expect.poll(() => currentTime(page)).toBeGreaterThan(9.5);
    expect(await currentTime(page)).toBeLessThan(10.5);
  });

  // ACC-VIDEO-58-FIT
  test('ACC-VIDEO-58-FIT the whole frame is visible and centred at every panel size', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const check = async () => {
      const b = await boxes(page);
      expectInside(b.video, b.panel);
      expect(b.video.width / b.video.height / (320 / 180)).toBeCloseTo(1, 2);
      expect(
        Math.abs(b.video.x - b.frame.x - (b.frame.right - b.video.right))
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(b.video.y - b.frame.y - (b.frame.bottom - b.video.bottom))
      ).toBeLessThanOrEqual(2);
      return b.video;
    };
    let box = await check();
    for (const size of [
      { width: 900, height: 700 },
      { width: 1300, height: 950 }
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(async () => {
          const b = await boxes(page);
          return Math.round(b.video.width);
        })
        .not.toBe(Math.round(box.width));
      box = await check();
    }
  });

  // ACC-VIDEO-59-DETAILS
  test('ACC-VIDEO-59-DETAILS the toolbar shows format, frame size, size and duration', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await expect(details(page)).toHaveText('MP4 · 320×180 · 181.6 KB · 00:20');
  });

  // ACC-VIDEO-60-ACCENT
  test('ACC-VIDEO-60-ACCENT the seek bar and the highlighted buttons use the brand colour', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const settings = viewer(page).locator('[data-plyr="settings"]').first();
    const light = await resolved(page, 'var(--jp-brand-color1)');
    expect(await seekColour(page)).toBe(light);
    // An open menu highlights its button (aria-expanded). The colour is
    // polled: Plyr transitions the background over 0.1 s, so the first read
    // after the click still sees the old value.
    const accent = async (expected: string) => {
      await settings.click();
      await expect(
        viewer(page).locator('.plyr__menu__container')
      ).toBeVisible();
      await expect
        .poll(() =>
          settings.evaluate(
            (el: HTMLElement) => getComputedStyle(el).backgroundColor
          )
        )
        .toBe(expected);
      await settings.click();
    };
    await accent(light);

    await page.theme.setDarkTheme();
    const dark = await resolved(page, 'var(--jp-brand-color1)');
    expect(dark).not.toBe(light);
    await expect.poll(() => seekColour(page)).toBe(dark);
    await accent(dark);
  });

  // ACC-KEYS-61-ARROWS
  test('ACC-KEYS-61-ARROWS Left and Right move playback 5 s once per press and stop at the ends', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await seek(page, 10);
    await viewer(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(15, 0);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(page)).toBeCloseTo(5, 0);

    // With the focus inside the player the event is handled once, by Plyr
    // with the same 5 s step.
    await seek(page, 2);
    await viewer(page).locator('[data-plyr="seek"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(7, 0);

    await seek(page, 18);
    await viewer(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(20, 0);
    await seek(page, 2);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(page)).toBe(0);
  });

  // ACC-KEYS-62-SPACE
  test('ACC-KEYS-62-SPACE Space plays and pauses', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await viewer(page).focus();
    expect(await paused(page)).toBe(true);
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(false);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.2);
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(true);

    // Inside the player as well, once per press.
    await viewer(page).locator('[data-plyr="seek"]').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(false);
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(true);
  });

  // ACC-KEYS-63-PAGE
  test('ACC-KEYS-63-PAGE Page Up and Page Down open the previous and next video file', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/folder`;
    const clip = CLIP.toString('base64');
    for (const file of ['a.mp4', 'c.mp4', 'd.mp4']) {
      await page.contents.uploadContent(clip, 'base64', `${dir}/${file}`);
    }
    // A file of another kind between them is skipped.
    await page.contents.uploadContent('not a video', 'text', `${dir}/b.txt`);
    await open(page, `${dir}/a.mp4`);

    const videoTabs = page
      .locator('#jp-main-dock-panel .lm-TabBar-tabLabel')
      .filter({ hasText: /\.mp4$/ });
    for (const [key, expected] of [
      ['PageDown', 'c.mp4'],
      ['PageDown', 'd.mp4'],
      ['PageUp', 'c.mp4']
    ]) {
      await viewer(page).focus();
      await page.keyboard.press(key);
      await expect(currentTab(page)).toHaveText(expected);
      await expect(videoTabs).toHaveCount(1);
    }
    const shown = await page.evaluate(
      () => (window as any).jupyterapp.shell.currentWidget.context.path
    );
    expect(shown).toBe(`${dir}/c.mp4`);

    // The first file stops Page Up.
    await viewer(page).focus();
    await page.keyboard.press('PageUp');
    await expect(currentTab(page)).toHaveText('a.mp4');
    await viewer(page).focus();
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(1500);
    await expect(currentTab(page)).toHaveText('a.mp4');

    // The folder navigation setting turns the keys off.
    await page.evaluate(async () => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      await registry.set(
        'jupyterlab_advanced_image_viewer_extension:plugin',
        'navEnabled',
        false
      );
    });
    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(1500);
    await expect(currentTab(page)).toHaveText('a.mp4');
  });

  // ACC-KEYS-64-SCOPE
  test('ACC-KEYS-64-SCOPE the media keys act only in a focused video tab', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);

    const notebook = {
      cells: [
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: ['ab']
        }
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5
    };
    await page.contents.uploadContent(
      JSON.stringify(notebook),
      'text',
      `${tmpPath}/scope.ipynb`
    );
    await page.filebrowser.open(`${tmpPath}/scope.ipynb`);
    await page.notebook.enterCellEditingMode(0);
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    await page.keyboard.press('Space');
    expect(await page.notebook.getCellTextInput(0)).toBe('aX b');

    // The video tab behind did not move or start.
    await page
      .locator('.lm-DockPanel-tabBar .lm-TabBar-tab', { hasText: NAME })
      .click();
    await expect.poll(() => currentTime(page)).toBe(0);
    expect(await paused(page)).toBe(true);

    // In the focused video tab the same keys act on the file.
    await viewer(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(5, 1);
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(false);
  });

  // ACC-MEDIA-65-STOCK
  test('ACC-MEDIA-65-STOCK the stock video viewer is disabled', async ({
    page,
    tmpPath
  }) => {
    const found = await page.evaluate(() => {
      const registry = (window as any).jupyterapp.docRegistry;
      const config = JSON.parse(
        document.getElementById('jupyter-config-data')!.textContent!
      );
      return {
        disabled: Object.keys(config.disabledExtensions ?? {}).concat(
          Array.isArray(config.disabledExtensions)
            ? config.disabledExtensions
            : []
        ),
        stockVideo: registry.getWidgetFactory('VideoViewer') !== undefined,
        video: registry
          .preferredWidgetFactories('x.mp4')
          .map((f: any) => [f.name, f.label]),
        defaultVideo: registry.defaultWidgetFactory('x.mp4').name,
        extensions: Array.from(registry.fileTypes())
          .filter((type: any) =>
            type.mimeTypes.some((m: string) => m.startsWith('video/'))
          )
          .map((type: any) => type.extensions)
          .flat()
      };
    });
    expect(found.disabled.join(' ')).toContain(
      '@jupyterlab/video-extension:plugin'
    );
    expect(found.stockVideo).toBe(false);
    expect(found.defaultVideo).toBe(FACTORY);
    // The generic Editor stays a fallback; no stock video viewer is offered.
    expect(found.video[0]).toEqual([FACTORY, 'Video Viewer']);
    expect(found.video.map((factory: any) => factory[0])).not.toContain(
      'VideoViewer'
    );
    expect(found.extensions).toContain('.mp4');

    // A double click opens this viewer.
    await open(page, `${tmpPath}/${NAME}`);
    expect(
      await page.evaluate(
        () => (window as any).jupyterapp.shell.currentWidget.content.factory
      )
    ).toBe(FACTORY);
  });

  // ACC-MEDIA-66-TOOLBAR
  test('ACC-MEDIA-66-TOOLBAR the video toolbar starts with Reload and ends with help', async ({
    page,
    tmpPath
  }) => {
    const items = () =>
      toolbar(page).evaluate((bar: HTMLElement) =>
        Array.from(bar.children)
          .filter(item => getComputedStyle(item).display !== 'none')
          .map(item => ({
            name: item.getAttribute('data-jp-item-name'),
            icon:
              item.querySelector('svg[data-icon]')?.getAttribute('data-icon') ??
              null,
            title:
              item.querySelector('[title]')?.getAttribute('title') ??
              item.getAttribute('title'),
            text: item.textContent
          }))
      );
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>';
    await page.contents.uploadContent(svg, 'text', `${tmpPath}/pic.svg`);
    await page.filebrowser.open(`${tmpPath}/pic.svg`, 'Image');
    await page.locator(`${SHOWN} .jp-ImageViewer`).waitFor();
    const image = await items();
    await open(page, `${tmpPath}/${NAME}`);
    const video = await items();

    // The same Reload button first.
    expect(video[0].name).toBe('advanced-refresh');
    expect(video[0].name).toBe(image[0].name);
    expect(video[0].icon).toBe(image[0].icon);
    expect(video[0].title).toBe('Reload video from disk');
    // No waveform zoom on a video; the details and the help link follow.
    expect(video.map(item => item.name)).toEqual([
      'advanced-refresh',
      'advanced-spacer',
      'advanced-details',
      'advanced-help'
    ]);
    expect(video[2].text).toBe('MP4 · 320×180 · 181.6 KB · 00:20');
    // The help link last, at the right end.
    expect(video[video.length - 1].name).toBe('advanced-help');
    expect(image[image.length - 1].name).toBe('advanced-help');
    const link = toolbar(page).locator('.jp-AdvancedImageViewer-help-link');
    const linkBox = (await link.boundingBox())!;
    const barBox = (await toolbar(page).boundingBox())!;
    expect(barBox.x + barBox.width - (linkBox.x + linkBox.width)).toBeLessThan(
      20
    );
  });

  // ACC-MEDIA-67-HELP
  test('ACC-MEDIA-67-HELP the help link lists each video control and key once', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const help = toolbar(page).locator('.jp-AdvancedImageViewer-help-link');
    await expect(help).toHaveText('help');
    const { color, brand, underline } = await help.evaluate(
      (el: HTMLElement) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--jp-brand-color1)';
        document.body.appendChild(probe);
        const brand = getComputedStyle(probe).color;
        probe.remove();
        return {
          color: getComputedStyle(el).color,
          brand,
          underline: getComputedStyle(el).textDecorationLine
        };
      }
    );
    expect(color).toBe(brand);
    expect(underline).toBe('underline');
    await expect(
      toolbar(page)
        .locator('.jp-ToolbarButtonComponent')
        .filter({ hasText: /^\?$/ })
    ).toHaveCount(0);

    await help.click();
    const dialog = page.locator('.jp-Dialog');
    const items = await dialog.locator('li').allTextContents();
    // Three key items and the eight player controls.
    expect(items).toHaveLength(11);
    expect(new Set(items).size).toBe(items.length);
    for (const text of [
      'Space - play / pause',
      'Left / Right - back / forward 5 seconds',
      'Page Up / Page Down - previous / next file of the same kind in the folder',
      'Play / pause - start or stop playback',
      'Seek bar - click or drag to move playback to that point',
      'Current time - the time played and the length of the file',
      'Mute - turn the sound off and on',
      'Volume - set the sound level',
      'Speed - choose a playback speed',
      'Picture in picture - play in a small floating window',
      'Full screen - fill the screen with the video'
    ]) {
      expect(items.filter(item => item === text)).toHaveLength(1);
    }
    // The waveform controls belong to the audio viewer only.
    expect(items.filter(item => item.startsWith('Wheel'))).toHaveLength(0);
    await expect(dialog.locator('.jp-mod-accept')).toHaveText('Close');
    await dialog.locator('.jp-mod-accept').click();
    await expect(dialog).toHaveCount(0);
  });

  // ACC-MEDIA-68-RELOAD
  test('ACC-MEDIA-68-RELOAD Reload reads the changed file again', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await expect(details(page)).toHaveText('MP4 · 320×180 · 181.6 KB · 00:20');
    await page.contents.uploadContent(
      SHORT.toString('base64'),
      'base64',
      `${tmpPath}/${NAME}`
    );
    await button(page, 'Reload video from disk').click();
    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
      .toBeCloseTo(10, 0);
    await expect(details(page)).toHaveText('MP4 · 320×180 · 91.7 KB · 00:10');
    // Still the downloaded copy, not the file URL.
    expect((await playerInfo(page)).src.startsWith('blob:')).toBe(true);
  });

  // ACC-MEDIA-69-RESTORE
  test('ACC-MEDIA-69-RESTORE a video tab opens again after a page reload', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    // Galata's readiness check waits for a Launcher tab, which the restored
    // layout does not have.
    await page.reload({ waitForIsReady: false });
    await expect(currentTab(page)).toHaveText(NAME);
    await viewer(page).waitFor();
    const restored = await page.evaluate(() => {
      const widget = (window as any).jupyterapp.shell.currentWidget;
      return {
        path: widget.context.path,
        factory: widget.content.factory
      };
    });
    expect(restored).toEqual({ path: `${tmpPath}/${NAME}`, factory: FACTORY });
    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
      .toBeCloseTo(20, 0);
  });

  // ACC-MEDIA-70-LOCAL
  test('ACC-MEDIA-70-LOCAL opening and playing a video requests only the lab', async ({
    page,
    tmpPath,
    baseURL
  }) => {
    const urls: string[] = [];
    page.on('request', (request: any) => urls.push(request.url()));
    await open(page, `${tmpPath}/${NAME}`);
    await viewer(page).locator('[data-plyr="play"]').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
    await viewer(page).locator('[data-plyr="play"]').click();
    const origin = new URL(baseURL!).origin;
    const foreign = urls.filter(
      url =>
        !url.startsWith(`${origin}/`) &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:')
    );
    expect(urls.some(url => url.includes(`/files/`))).toBe(true);
    // The icon sprite and the blank video are bundled, not fetched from
    // cdn.plyr.io.
    expect(urls.some(url => url.includes('plyr.io'))).toBe(false);
    expect(foreign).toEqual([]);
  });

  // ACC-MEDIA-71-STREAM
  test('ACC-MEDIA-71-STREAM the file is never read through the contents API', async ({
    page,
    tmpPath
  }) => {
    // Reads of the file model; checkpoint requests have their own path.
    const contents: string[] = [];
    page.on('request', (request: any) => {
      const url = new URL(request.url());
      if (
        request.method() === 'GET' &&
        url.pathname.startsWith('/api/contents/') &&
        url.pathname.endsWith(`/${NAME}`)
      ) {
        contents.push(request.url());
      }
    });
    await open(page, `${tmpPath}/${NAME}`);
    await button(page, 'Reload video from disk').click();
    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
      .toBeCloseTo(20, 0);
    // The model is fetched, and every fetch leaves the content out.
    expect(contents.length).toBeGreaterThan(0);
    for (const url of contents) {
      expect(new URL(url).searchParams.get('content')).toBe('0');
    }
  });

  // ACC-MEDIA-72-CLOSE
  test('ACC-MEDIA-72-CLOSE closing a playing tab stops it and removes its element', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await viewer(page).locator('[data-plyr="play"]').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.5);
    await media(page).evaluate((m: HTMLMediaElement) => {
      (window as any).closedMedia = m;
    });
    await page
      .locator(
        '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabCloseIcon'
      )
      .click();
    await expect(viewer(page)).toHaveCount(0);
    const left = await page.evaluate(() => {
      const m = (window as any).closedMedia as HTMLMediaElement;
      return {
        paused: m.paused,
        connected: m.isConnected,
        src: m.getAttribute('src'),
        network: m.networkState,
        playing: Array.from(document.querySelectorAll('audio, video')).filter(
          e => !(e as HTMLMediaElement).paused
        ).length
      };
    });
    expect(left).toEqual({
      paused: true,
      connected: false,
      src: null,
      // NETWORK_EMPTY: the element holds no resource.
      network: 0,
      playing: 0
    });
  });

  // ACC-MEDIA-73-MENU, after DEF-MENU-6: no label appears twice in the
  // context menu of a video tab or of its content. A terminal is open
  // because a terminal extension once put its own "Show in File Browser" on
  // every tab.
  test('ACC-MEDIA-73-MENU no context menu item appears twice on a video tab', async ({
    page,
    tmpPath
  }) => {
    await page.evaluate(async () => {
      await (window as any).jupyterapp.commands.execute('terminal:create-new');
    });
    await page.locator('.jp-Terminal').waitFor();
    await open(page, `${tmpPath}/${NAME}`);
    const labels = (): Promise<string[]> =>
      page
        .locator(
          '.lm-Menu-item:not([data-type="separator"]):visible .lm-Menu-itemLabel'
        )
        .allTextContents();
    const repeated = (shown: string[]): string[] =>
      shown.filter((label, i) => shown.indexOf(label) !== i);

    await page
      .locator('.lm-DockPanel-tabBar .lm-TabBar-tab', { hasText: NAME })
      .click({ button: 'right' });
    await expect(page.locator('.lm-Menu')).toBeVisible();
    const onTab = await labels();
    expect(onTab).toContain('Show in File Browser');
    expect(repeated(onTab)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.lm-Menu')).toBeHidden();

    await viewer(page)
      .locator('.jp-AdvancedMediaViewer-frame')
      .click({ button: 'right' });
    await expect(page.locator('.lm-Menu')).toBeVisible();
    const onContent = await labels();
    expect(onContent.length).toBeGreaterThan(0);
    expect(repeated(onContent)).toEqual([]);
  });

  // ACC-MEDIA-74-BUFFER. The same owner server as above. Up to 100 MB the
  // viewer downloads the file once and plays that copy, so the player has
  // the whole length to seek in; a player on the plain URL has seekable
  // [0,0]. Above 100 MB it plays from the file URL itself.
  test('ACC-MEDIA-74-BUFFER video up to 100 MB is downloaded once and seeks without byte ranges', async ({
    page,
    tmpPath
  }) => {
    let served = 0;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      served++;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
        body: CLIP
      });
    });
    await open(page, `${tmpPath}/${NAME}`);
    const player = await playerInfo(page);
    expect(served).toBe(1);
    expect(player.src.startsWith('blob:')).toBe(true);
    expect(player.seekable).toBeCloseTo(20, 0);
    await seek(page, 10);
    expect(await currentTime(page)).toBeCloseTo(10, 0);

    // A click at half of the seek bar lands at half of the file.
    const box = (await viewer(page)
      .locator('[data-plyr="seek"]')
      .boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(9.5);
    expect(await currentTime(page)).toBeLessThan(10.5);

    // Over the limit the file plays from its URL and is not downloaded.
    await page.route(`**/api/contents/**/${NAME}?*`, async (route: any) => {
      const response = await route.fetch();
      const model = await response.json();
      await route.fulfill({
        response,
        json: { ...model, size: 200 * 1024 * 1024 }
      });
    });
    await page
      .locator(
        '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabCloseIcon'
      )
      .click();
    await expect(viewer(page)).toHaveCount(0);
    await open(page, `${tmpPath}/${NAME}`);
    const large = await playerInfo(page);
    expect(large.src).toContain('/files/');
    expect(large.src.startsWith('blob:')).toBe(false);
  });
});
