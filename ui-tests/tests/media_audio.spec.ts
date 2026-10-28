import { expect, test } from '@jupyterlab/galata';

// A mono 16-bit PCM WAV of `seconds` at 8 kHz: a 440 Hz tone whose loudness
// swells once a second, so the waveform has a shape. 60 s is 960,044 bytes.
const RATE = 8000;
const wav = (seconds: number): Buffer => {
  const samples = seconds * RATE;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const swell = 0.3 + 0.7 * Math.abs(Math.sin((Math.PI * i) / RATE));
    const value = 20000 * swell * Math.sin((2 * Math.PI * 440 * i) / RATE);
    buf.writeInt16LE(Math.round(value), 44 + i * 2);
  }
  return buf;
};

const TONE = wav(60);
const NAME = 'tone.wav';
const FACTORY = 'AdvancedAudioViewer';
const SHOWN = '.jp-MainAreaWidget:not(.lm-mod-hidden)';

test.describe('Audio viewer', () => {
  test.beforeEach(async ({ page, tmpPath }) => {
    await page.contents.uploadContent(
      TONE.toString('base64'),
      'base64',
      `${tmpPath}/${NAME}`
    );
  });

  const viewer = (page: any) =>
    page.locator(`${SHOWN} .jp-AdvancedMediaViewer`);
  const media = (page: any) =>
    page.locator(`${SHOWN} .jp-AdvancedMediaViewer-media`);
  const toolbar = (page: any) => page.locator(`${SHOWN} .jp-Toolbar`);
  const button = (page: any, title: string) =>
    toolbar(page).locator(`[title="${title}"]`).first();
  const labelled = (page: any, text: string) =>
    toolbar(page)
      .locator('.jp-ToolbarButtonComponent')
      .filter({ hasText: text })
      .first();
  const currentTab = (page: any) =>
    page.locator(
      '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel'
    );

  const currentTime = (page: any): Promise<number> =>
    media(page).evaluate((m: HTMLMediaElement) => m.currentTime);
  const paused = (page: any): Promise<boolean> =>
    media(page).evaluate((m: HTMLMediaElement) => m.paused);

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

  // Open with a double click, the default viewer, and wait for the decoded
  // waveform.
  const open = async (page: any, path: string) => {
    await page.filebrowser.open(path);
    await viewer(page).waitFor();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              !!(
                window as any
              ).jupyterapp.shell.currentWidget?.content?.wavesurfer?.getDecodedData()
          ),
        { timeout: 20000 }
      )
      .toBe(true);
  };

  // Boxes of wavesurfer's parts, which live in its open shadow root. The
  // overview strip holds a second player in a nested shadow root, which
  // querySelector does not enter, so each selector finds the main part.
  const parts = (page: any) =>
    page.evaluate((shown: string) => {
      const host = document.querySelector(
        `${shown} .jp-AdvancedMediaViewer-wave > div`
      ) as HTMLElement;
      const root = host.shadowRoot!;
      const box = (selector: string) => {
        const el = root.querySelector(selector);
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        scroll: box('.scroll')!,
        wrapper: box('.wrapper')!,
        canvas: box('.canvases canvas')!,
        cursor: box('.cursor')!,
        minimap: box('[part="minimap"]')!,
        timeline: box('[part="timeline"]')!,
        hover: root.querySelector('[part="hover-label"]')?.textContent ?? '',
        regions: root.querySelectorAll('[part~="region"]').length
      };
    }, SHOWN);

  const at = (
    box: { x: number; y: number; width: number; height: number },
    fraction: number
  ) => ({ x: box.x + box.width * fraction, y: box.y + box.height / 2 });

  // mm:ss.s to seconds.
  const seconds = (text: string): number => {
    const [m, s] = text.trim().split(':');
    return Number(m) * 60 + Number(s);
  };
  const timeText = (page: any) =>
    viewer(page)
      .locator('.jp-AdvancedMediaViewer-status > :first-child')
      .textContent();
  const shownSpan = async (page: any): Promise<number> => {
    const text: string = await viewer(page)
      .locator('.jp-AdvancedMediaViewer-status > :last-child')
      .textContent();
    const [start, end] = text.replace('showing', '').split(' - ');
    return seconds(end) - seconds(start);
  };

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
  const progressColour = (page: any): Promise<string> =>
    page.evaluate(
      () =>
        (window as any).jupyterapp.shell.currentWidget.content.wavesurfer
          .options.progressColor
    );
  // Contrast of the unplayed waveform against the panel, with the translucent
  // colour composited over the background first (WCAG 1.4.11 asks 3:1).
  const waveContrast = (page: any): Promise<number> =>
    page.evaluate(() => {
      const wave = (window as any).jupyterapp.shell.currentWidget.content
        .wavesurfer.options.waveColor;
      const colour = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const computed = getComputedStyle(probe).color;
        probe.remove();
        const [r, g, b, a = 1] = computed.match(/[\d.]+/g)!.map(Number);
        return { r, g, b, a };
      };
      const luminance = (r: number, g: number, b: number) => {
        const channel = (v: number) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const front = colour(wave);
      const back = colour('var(--jp-layout-color0)');
      const r = front.r * front.a + back.r * (1 - front.a);
      const g = front.g * front.a + back.g * (1 - front.a);
      const b = front.b * front.a + back.b * (1 - front.a);
      const one = luminance(r, g, b);
      const two = luminance(back.r, back.g, back.b);
      return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
    });

  // ACC-AUDIO-45-WAVE
  test('ACC-AUDIO-45-WAVE waveform, ruler and playback line in the accent colour', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await expect(
      page
        .locator('#jp-main-dock-panel .lm-TabBar-tabLabel')
        .filter({ hasText: NAME })
    ).toHaveCount(1);
    const p = await parts(page);
    expect(p.canvas.width).toBeGreaterThan(100);
    expect(p.canvas.height).toBeGreaterThan(100);
    expect(p.timeline.height).toBeGreaterThan(10);
    // The ruler sits above the waveform.
    expect(p.timeline.y + p.timeline.height).toBeLessThanOrEqual(
      p.canvas.y + 1
    );
    expect(p.cursor.width).toBeGreaterThan(0);
    expect(p.cursor.height).toBeGreaterThan(100);

    const brand = await resolved(page, 'var(--jp-brand-color1)');
    expect(await resolved(page, await progressColour(page))).toBe(brand);
    // The unplayed waveform must reach 3:1, not the 2.68:1 of a muted text
    // token (DEF-MEDIA-10).
    expect(await waveContrast(page)).toBeGreaterThanOrEqual(3);

    // The canvas colours follow a theme change.
    await page.theme.setDarkTheme();
    const darkBrand = await resolved(page, 'var(--jp-brand-color1)');
    expect(darkBrand).not.toBe(brand);
    await expect
      .poll(async () => resolved(page, await progressColour(page)))
      .toBe(darkBrand);
  });

  // ACC-AUDIO-46-SEEK. The file is served as the owner's server serves
  // /files/ (DEF-MEDIA-7-SEEK): status 200, the whole file, no Accept-Ranges.
  // A player on that URL cannot seek; the viewer seeks in a blob of it.
  test('ACC-AUDIO-46-SEEK a click on the waveform seeks on a server without byte ranges', async ({
    page,
    tmpPath
  }) => {
    let served = 0;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      served++;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'audio/x-wav' },
        body: TONE
      });
    });
    await open(page, `${tmpPath}/${NAME}`);
    expect(served).toBe(1);
    const src = await media(page).evaluate((m: HTMLMediaElement) => m.src);
    expect(src.startsWith('blob:')).toBe(true);

    for (const [fraction, expected] of [
      [0.25, 15],
      [0.75, 45],
      [0.1, 6]
    ]) {
      const p = await parts(page);
      const point = at(p.wrapper, fraction);
      await page.mouse.click(point.x, point.y);
      await expect
        .poll(() => currentTime(page))
        .toBeGreaterThan(expected - 0.5);
      expect(await currentTime(page)).toBeLessThan(expected + 0.5);
    }

    // Also while playing.
    await button(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    const p = await parts(page);
    const point = at(p.wrapper, 0.5);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(29.5);
    expect(await currentTime(page)).toBeLessThan(31);
  });

  // ACC-MEDIA-74-BUFFER. The same owner server as above. Up to 100 MB the
  // viewer downloads the file once and plays that copy, so the player has the
  // whole length to seek in; a player on the plain URL has seekable [0,0].
  test('ACC-MEDIA-74-BUFFER audio up to 100 MB is downloaded once and seeks without byte ranges', async ({
    page,
    tmpPath
  }) => {
    let served = 0;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      served++;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'audio/x-wav' },
        body: TONE
      });
    });
    await open(page, `${tmpPath}/${NAME}`);
    const player = await media(page).evaluate((m: HTMLMediaElement) => ({
      src: m.src,
      seekable: m.seekable.length ? m.seekable.end(0) : 0
    }));
    expect(served).toBe(1);
    expect(player.src.startsWith('blob:')).toBe(true);
    expect(player.seekable).toBeCloseTo(60, 0);
    await seek(page, 30);
    expect(await currentTime(page)).toBeCloseTo(30, 0);
  });

  // ACC-AUDIO-47-OVERVIEW
  test('ACC-AUDIO-47-OVERVIEW the overview strip seeks the whole file and scrolls the waveform', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await labelled(page, '+').click();
    await labelled(page, '+').click();
    await expect.poll(() => shownSpan(page)).toBeLessThan(20);

    let p = await parts(page);
    expect(p.minimap.width).toBeGreaterThan(100);
    expect(p.minimap.y + p.minimap.height).toBeLessThanOrEqual(p.canvas.y);
    const click = at(p.minimap, 0.9);
    await page.mouse.click(click.x, click.y);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(53.5);
    expect(await currentTime(page)).toBeLessThan(54.5);
    await expect
      .poll(async () => {
        const q = await parts(page);
        return (
          q.cursor.x >= q.scroll.x && q.cursor.x <= q.scroll.x + q.scroll.width
        );
      })
      .toBe(true);

    // A drag on the strip moves playback to where it ends.
    p = await parts(page);
    const from = at(p.minimap, 0.5);
    const to = at(p.minimap, 0.2);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, to.y);
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    await expect.poll(() => currentTime(page)).toBeLessThan(12.5);
    expect(await currentTime(page)).toBeGreaterThan(11.5);
    const q = await parts(page);
    expect(q.cursor.x).toBeGreaterThanOrEqual(q.scroll.x);
    expect(q.cursor.x).toBeLessThanOrEqual(q.scroll.x + q.scroll.width);
  });

  // ACC-AUDIO-48-ZOOM
  test('ACC-AUDIO-48-ZOOM plus, minus, Fit and the wheel zoom the waveform', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    for (const label of ['-', '+', 'Fit']) {
      await expect(labelled(page, label)).not.toHaveAttribute('disabled', '');
    }
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);
    await labelled(page, '+').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(30, 0);
    await labelled(page, '+').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(15, 0);
    await labelled(page, '-').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(30, 0);
    await labelled(page, 'Fit').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);

    const p = await parts(page);
    const point = at(p.wrapper, 0.5);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -600);
    await expect.poll(() => shownSpan(page)).toBeLessThan(55);
    await labelled(page, 'Fit').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);

    // During playback the view follows the playback line out of the
    // first quarter.
    await labelled(page, '+').click();
    await labelled(page, '+').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(15, 0);
    await seek(page, 14);
    await button(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(16);
    const q = await parts(page);
    expect(q.cursor.x).toBeGreaterThanOrEqual(q.scroll.x);
    expect(q.cursor.x).toBeLessThanOrEqual(q.scroll.x + q.scroll.width);
  });

  // ACC-AUDIO-49-HOVER
  test('ACC-AUDIO-49-HOVER hovering shows the time under the mouse', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const p = await parts(page);
    for (const [fraction, expected] of [
      [0.5, 30],
      [0.25, 15]
    ]) {
      const point = at(p.wrapper, fraction);
      await page.mouse.move(point.x - 5, point.y);
      await page.mouse.move(point.x, point.y);
      await expect
        .poll(async () => seconds((await parts(page)).hover || '99:00'))
        .toBeGreaterThan(expected - 0.5);
      expect(seconds((await parts(page)).hover)).toBeLessThan(expected + 0.5);
    }
  });

  // ACC-AUDIO-50-LOOP
  test('ACC-AUDIO-50-LOOP a drag marks a loop region and Loop off removes it', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const loop = labelled(page, 'Loop');
    await expect(loop).toHaveAttribute('aria-pressed', 'false');

    // A press that moves just past the 3 px drag threshold creates no region
    // and leaves Loop off (DEF-MEDIA-13).
    const before = await parts(page);
    const jitter = at(before.wrapper, 0.5);
    await page.mouse.move(jitter.x, jitter.y);
    await page.mouse.down();
    await page.mouse.move(jitter.x + 4, jitter.y);
    await page.mouse.up();
    expect((await parts(page)).regions).toBe(0);
    await expect(loop).toHaveAttribute('aria-pressed', 'false');

    const p = await parts(page);
    const from = at(p.wrapper, 10 / 60);
    const to = at(p.wrapper, 20 / 60);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y);
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    await expect.poll(async () => (await parts(page)).regions).toBe(1);
    await expect(loop).toHaveAttribute('aria-pressed', 'true');
    const region = await page.evaluate(() => {
      const ws = (window as any).jupyterapp.shell.currentWidget.content
        .wavesurfer;
      const plugin = ws.getActivePlugins().find((x: any) => x.getRegions);
      const [r] = plugin.getRegions();
      return { start: r.start, end: r.end };
    });
    expect(region.start).toBeCloseTo(10, 0);
    expect(region.end).toBeCloseTo(20, 0);

    await seek(page, 18);
    await button(page, 'Play').click();
    await page.waitForTimeout(3000);
    const time = await currentTime(page);
    expect(time).toBeGreaterThan(10);
    expect(time).toBeLessThan(13);

    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
    expect((await parts(page)).regions).toBe(0);
  });

  // ACC-AUDIO-51-CONTROLS
  test('ACC-AUDIO-51-CONTROLS play, back, forward, loop and speed act on the file', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await seek(page, 10);
    await button(page, 'Forward 5 seconds').click();
    await button(page, 'Forward 5 seconds').click();
    await expect.poll(() => currentTime(page)).toBeCloseTo(20, 1);
    await button(page, 'Back 5 seconds').click();
    await expect.poll(() => currentTime(page)).toBeCloseTo(15, 1);

    await button(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    await expect(button(page, 'Pause')).toHaveAttribute('aria-pressed', 'true');
    await button(page, 'Pause').click();
    await expect.poll(() => paused(page)).toBe(true);

    const speed = toolbar(page).locator('select.jp-AdvancedMediaViewer-speed');
    expect(await speed.locator('option').allTextContents()).toEqual([
      '0.5×',
      '0.75×',
      '1×',
      '1.25×',
      '1.5×',
      '2×'
    ]);
    await speed.selectOption('2');
    expect(
      await media(page).evaluate((m: HTMLMediaElement) => m.playbackRate)
    ).toBe(2);

    // Loop without a region repeats the whole file.
    await labelled(page, 'Loop').click();
    expect(await media(page).evaluate((m: HTMLMediaElement) => m.loop)).toBe(
      true
    );
  });

  // ACC-AUDIO-52-TIME
  test('ACC-AUDIO-52-TIME the current time and the duration update on a seek', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
    await seek(page, 15);
    await expect.poll(() => timeText(page)).toBe('00:15.0 / 01:00.0');
    await seek(page, 42.5);
    await expect.poll(() => timeText(page)).toBe('00:42.5 / 01:00.0');
  });

  // ACC-AUDIO-53-DETAILS
  test('ACC-AUDIO-53-DETAILS the toolbar shows format, channels, size and duration', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await expect(
      toolbar(page).locator('.jp-AdvancedMediaViewer-details')
    ).toHaveText('WAV · mono · 937.5 KB · 01:00');
  });

  // ACC-AUDIO-54-LARGE. The contents API reports the file over 100 MB. The
  // file URL is served with byte ranges, as the stock file handler serves it
  // and as the platform fix of DEF-MEDIA-7-SEEK restores it, because above
  // the limit the native player streams from the file URL.
  test('ACC-AUDIO-54-LARGE a file over 100 MB plays without a waveform and seeks', async ({
    page,
    tmpPath
  }) => {
    await page.route(`**/api/contents/**/${NAME}?*`, async (route: any) => {
      const response = await route.fetch();
      const model = await response.json();
      await route.fulfill({
        response,
        json: { ...model, size: 200 * 1024 * 1024 }
      });
    });
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      const range = /bytes=(\d+)-(\d*)/.exec(
        route.request().headers()['range'] ?? ''
      );
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Number(range[2]) : TONE.length - 1;
      await route.fulfill({
        status: range ? 206 : 200,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          ...(range
            ? { 'Content-Range': `bytes ${start}-${end}/${TONE.length}` }
            : {})
        },
        body: TONE.subarray(start, end + 1)
      });
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-message')
    ).toHaveText('The waveform is skipped for files over 100 MB.');
    // No decoded waveform; the native player with its seek bar instead.
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-wave > div')
    ).toHaveCount(0);
    // There is no waveform to zoom, so the buttons are disabled rather than
    // enabled and doing nothing (DEF-MEDIA-9).
    for (const label of ['-', '+', 'Fit']) {
      await expect(labelled(page, label)).toHaveAttribute('disabled', '');
    }
    expect(
      await page.evaluate(
        () => (window as any).jupyterapp.shell.currentWidget.content.wavesurfer
      )
    ).toBeNull();
    const player = await media(page).evaluate((m: HTMLMediaElement) => ({
      controls: m.controls,
      src: m.src
    }));
    expect(player.controls).toBe(true);
    expect(player.src).toContain(`/files/`);
    await expect(media(page)).toBeVisible();
    const box = await media(page).boundingBox();
    expect(box!.height).toBeGreaterThan(20);

    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
      .toBeCloseTo(60, 0);
    await seek(page, 30);
    expect(await currentTime(page)).toBeCloseTo(30, 0);
    // It plays from that URL like any native player.
    await button(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(30.2);
    await button(page, 'Pause').click();
    // Seek with the native bar: a click at its far right end lands near the
    // end of the file.
    expect(
      await media(page).evaluate((m: HTMLMediaElement) =>
        m.seekable.length ? m.seekable.end(0) : 0
      )
    ).toBeCloseTo(60, 0);
  });

  // ACC-AUDIO-55-ERROR
  test('ACC-AUDIO-55-ERROR every audio type opens here and an unreadable file shows an error', async ({
    page,
    tmpPath
  }) => {
    const defaults = await page.evaluate(() => {
      const registry = (window as any).jupyterapp.docRegistry;
      const out: Record<string, string> = {};
      for (const type of registry.fileTypes()) {
        if (type.mimeTypes.some((m: string) => m.startsWith('audio/'))) {
          for (const ext of type.extensions) {
            out[ext] = registry.defaultWidgetFactory(`x${ext}`).name;
          }
        }
      }
      return out;
    });
    expect(Object.keys(defaults).length).toBeGreaterThan(3);
    expect(Object.keys(defaults)).toContain('.wav');
    expect(Object.keys(defaults)).toContain('.mp3');
    for (const name of Object.values(defaults)) {
      expect(name).toBe(FACTORY);
    }

    await open(page, `${tmpPath}/${NAME}`);
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-message')
    ).toHaveText('');

    await page.contents.uploadContent(
      'this is not an mp3 file',
      'text',
      `${tmpPath}/broken.mp3`
    );
    await page.filebrowser.open(`${tmpPath}/broken.mp3`);
    await expect(currentTab(page)).toHaveText('broken.mp3');
    const message = viewer(page).locator('.jp-AdvancedMediaViewer-message');
    await expect(message).toHaveText(
      'This file cannot be played: the file is damaged or in a format this browser cannot play',
      { timeout: 15000 }
    );
    // The browser's own MediaError text is jargon and does not reach the
    // user (DEF-MEDIA-11).
    await expect(message).not.toHaveText(
      /MediaError|Failed to load|no supported source|DEMUXER|PIPELINE|codec/i
    );
  });

  // ACC-KEYS-61-ARROWS
  test('ACC-KEYS-61-ARROWS Left and Right move playback 5 s and stop at the ends', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await seek(page, 10);
    await viewer(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(15, 1);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(page)).toBeCloseTo(5, 1);

    await seek(page, 2);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(page)).toBe(0);
    await seek(page, 58);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(60, 1);
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
  });

  // ACC-KEYS-63-PAGE
  test('ACC-KEYS-63-PAGE Page Up and Page Down open the previous and next audio file', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/folder`;
    const short = wav(2).toString('base64');
    for (const name of ['a.wav', 'c.wav', 'd.wav']) {
      await page.contents.uploadContent(short, 'base64', `${dir}/${name}`);
    }
    // A file of another kind between them is skipped.
    await page.contents.uploadContent('not audio', 'text', `${dir}/b.txt`);
    await open(page, `${dir}/a.wav`);

    const audioTabs = page
      .locator('#jp-main-dock-panel .lm-TabBar-tabLabel')
      .filter({ hasText: /\.wav$/ });
    for (const [key, expected] of [
      ['PageDown', 'c.wav'],
      ['PageDown', 'd.wav'],
      ['PageUp', 'c.wav']
    ]) {
      await viewer(page).focus();
      await page.keyboard.press(key);
      await expect(currentTab(page)).toHaveText(expected);
      await expect(audioTabs).toHaveCount(1);
    }
    const path = await page.evaluate(
      () => (window as any).jupyterapp.shell.currentWidget.context.path
    );
    expect(path).toBe(`${dir}/c.wav`);

    // The first file stops Page Up.
    await viewer(page).focus();
    await page.keyboard.press('PageUp');
    await expect(currentTab(page)).toHaveText('a.wav');
    await viewer(page).focus();
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(1500);
    await expect(currentTab(page)).toHaveText('a.wav');

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
    await expect(currentTab(page)).toHaveText('a.wav');
  });

  // ACC-KEYS-64-SCOPE
  test('ACC-KEYS-64-SCOPE the media keys act only in a focused media tab', async ({
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
    // The audio tab behind did not move or start.
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    expect(await currentTime(page)).toBe(0);
    expect(await paused(page)).toBe(true);

    // The image viewer keeps Right for the next image.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>';
    await page.contents.uploadContent(svg, 'text', `${tmpPath}/img/1.svg`);
    await page.contents.uploadContent(svg, 'text', `${tmpPath}/img/2.svg`);
    await page.filebrowser.open(`${tmpPath}/img/1.svg`, 'Image');
    await page.locator(`${SHOWN} .jp-ImageViewer`).focus();
    await page.keyboard.press('ArrowRight');
    await expect(currentTab(page)).toHaveText('2.svg');
  });

  // ACC-MEDIA-65-STOCK
  test('ACC-MEDIA-65-STOCK the stock audio and video viewers are disabled', async ({
    page
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
        stockAudio: registry.getWidgetFactory('AudioViewer') !== undefined,
        stockVideo: registry.getWidgetFactory('VideoViewer') !== undefined,
        audio: registry
          .preferredWidgetFactories('x.wav')
          .map((f: any) => [f.name, f.label]),
        defaultAudio: registry.defaultWidgetFactory('x.mp3').name
      };
    });
    expect(found.disabled.join(' ')).toContain(
      '@jupyterlab/audio-extension:plugin'
    );
    expect(found.disabled.join(' ')).toContain(
      '@jupyterlab/video-extension:plugin'
    );
    expect(found.stockAudio).toBe(false);
    expect(found.stockVideo).toBe(false);
    expect(found.defaultAudio).toBe(FACTORY);
    expect(
      found.audio.filter(([name, label]: string[]) =>
        /audio/i.test(`${name} ${label}`)
      )
    ).toEqual([[FACTORY, 'Audio Viewer']]);
  });

  // ACC-MEDIA-66-TOOLBAR
  test('ACC-MEDIA-66-TOOLBAR the audio toolbar matches the image viewer toolbar', async ({
    page,
    tmpPath
  }) => {
    const items = () =>
      toolbar(page).evaluate((bar: HTMLElement) =>
        // The overflow menu opener stays in the DOM, hidden while all
        // items fit.
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
    const audio = await items();

    // The same Reload button first.
    expect(audio[0].name).toBe('advanced-refresh');
    expect(audio[0].name).toBe(image[0].name);
    expect(audio[0].icon).toBe(image[0].icon);
    expect(audio[0].title).toBe('Reload audio from disk');
    // The same -, + and Fit buttons with the same tooltips, in that order.
    const zoom = (list: any[]) =>
      list
        .filter(item => /^advanced-(zoom|reset)/.test(item.name ?? ''))
        .map(item => [item.text, item.title]);
    expect(zoom(audio)).toEqual([
      ['-', 'Zoom out'],
      ['+', 'Zoom in'],
      ['Fit', 'Reset to fit']
    ]);
    expect(zoom(audio)).toEqual(zoom(image));
    // The help link last, at the right end.
    expect(audio[audio.length - 1].name).toBe('advanced-help');
    expect(image[image.length - 1].name).toBe('advanced-help');
    const link = toolbar(page).locator('.jp-AdvancedImageViewer-help-link');
    const linkBox = (await link.boundingBox())!;
    const barBox = (await toolbar(page).boundingBox())!;
    expect(barBox.x + barBox.width - (linkBox.x + linkBox.width)).toBeLessThan(
      20
    );
  });

  // ACC-MEDIA-67-HELP
  test('ACC-MEDIA-67-HELP the help link lists each media control once', async ({
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
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(new Set(items).size).toBe(items.length);
    for (const text of [
      'Space - play / pause',
      'Left / Right - back / forward 5 seconds',
      'Page Up / Page Down - previous / next file of the same kind in the folder',
      'Click - move playback to that point',
      'Drag - mark a region and loop it'
    ]) {
      expect(items.filter(item => item === text)).toHaveLength(1);
    }
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
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
    await page.contents.uploadContent(
      wav(30).toString('base64'),
      'base64',
      `${tmpPath}/${NAME}`
    );
    await button(page, 'Reload audio from disk').click();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 00:30.0');
    await expect(
      toolbar(page).locator('.jp-AdvancedMediaViewer-details')
    ).toHaveText('WAV · mono · 468.8 KB · 00:30');
    await expect.poll(() => shownSpan(page)).toBeCloseTo(30, 0);
  });

  // ACC-MEDIA-69-RESTORE
  test('ACC-MEDIA-69-RESTORE an audio tab opens again after a page reload', async ({
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
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
  });

  // ACC-MEDIA-70-LOCAL
  test('ACC-MEDIA-70-LOCAL opening and playing audio requests only the lab', async ({
    page,
    tmpPath,
    baseURL
  }) => {
    const urls: string[] = [];
    page.on('request', (request: any) => urls.push(request.url()));
    await open(page, `${tmpPath}/${NAME}`);
    await button(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
    await labelled(page, '+').click();
    await button(page, 'Pause').click();
    const origin = new URL(baseURL!).origin;
    const foreign = urls.filter(
      url =>
        !url.startsWith(`${origin}/`) &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:')
    );
    expect(urls.some(url => url.includes(`/files/`))).toBe(true);
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
    await button(page, 'Reload audio from disk').click();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
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
    await button(page, 'Play').click();
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
  // context menu of an audio tab or of its content. A terminal is open
  // because a terminal extension once put its own "Show in File Browser" on
  // every tab.
  test('ACC-MEDIA-73-MENU no context menu item appears twice on an audio tab', async ({
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
      .locator('.jp-AdvancedMediaViewer-status')
      .click({ button: 'right' });
    await expect(page.locator('.lm-Menu')).toBeVisible();
    const onContent = await labels();
    expect(onContent.length).toBeGreaterThan(0);
    expect(repeated(onContent)).toEqual([]);
  });
});
