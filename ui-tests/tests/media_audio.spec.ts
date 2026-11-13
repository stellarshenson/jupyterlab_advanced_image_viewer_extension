import { expect, test } from '@jupyterlab/galata';

// A 16-bit PCM WAV of `seconds` at 8 kHz, mono unless `channels` says more:
// a 440 Hz tone whose loudness swells once a second, so the waveform has a
// shape, the same in every channel. 60 s mono is 960,044 bytes.
const RATE = 8000;
const wav = (seconds: number, channels = 1): Buffer => {
  const samples = seconds * RATE;
  const bytes = samples * channels * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples; i++) {
    const swell = 0.3 + 0.7 * Math.abs(Math.sin((Math.PI * i) / RATE));
    const value = 20000 * swell * Math.sin((2 * Math.PI * 440 * i) / RATE);
    for (let c = 0; c < channels; c++) {
      buf.writeInt16LE(Math.round(value), 44 + (i * channels + c) * 2);
    }
  }
  return buf;
};

const TONE = wav(60);
const NAME = 'tone.wav';
const FACTORY = 'AdvancedAudioViewer';
const SHOWN = '.jp-MainAreaWidget:not(.lm-mod-hidden)';
const LOST =
  'The connection to the server was lost; press Reload to try again.';
const STALE = 'This viewer was updated; reload the page to use it.';
// The chunks of this extension that load when the first file opens.
const CHUNKS = '**/jupyterlab-advanced-image-viewer-extension/static/*.js*';
// The peaks request of an audio file, answered by the server part.
const PEAKS = '**/jupyterlab-advanced-image-viewer-extension/waveform?*';

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
  // The message line; the line of each spinner is a status too.
  const message = (page: any) =>
    viewer(page).locator('.jp-AdvancedMediaViewer-message[role="status"]');
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
  // The time row and the control row under the waveform.
  const bar = (page: any) =>
    viewer(page).locator('.jp-AdvancedMediaViewer-bar');
  const control = (page: any, name: string) =>
    bar(page).getByRole('button', { name, exact: true });
  const speedMenu = (page: any) =>
    bar(page).locator('select.jp-AdvancedMediaViewer-speed');
  const volume = (page: any) =>
    bar(page).getByRole('slider', { name: 'Volume', exact: true });
  const seekBar = (page: any) =>
    bar(page).locator('input.jp-AdvancedMediaViewer-seek');
  const spinner = (page: any) => viewer(page).locator('.jp-Spinner');
  const iconOf = (page: any, name: string) =>
    control(page, name).locator('svg').getAttribute('data-icon');

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
  // The played time at the left of the time row and the file length at its
  // right, as "played / length".
  const timeText = async (page: any): Promise<string> => {
    const played = await bar(page)
      .locator('.jp-AdvancedMediaViewer-time')
      .textContent();
    const length = await bar(page)
      .locator('.jp-AdvancedMediaViewer-length')
      .textContent();
    return `${played} / ${length}`;
  };
  const shownSpan = async (page: any): Promise<number> => {
    const text: string = await bar(page)
      .locator('.jp-AdvancedMediaViewer-range')
      .textContent();
    const [start, end] = text.replace('showing', '').split(' - ');
    return seconds(end) - seconds(start);
  };

  // The colour of the seek slider's middle row at each of `times`, from a
  // screenshot decoded in the page. A time lies where the centre of the 16 px
  // thumb would stand: from 8 px inside one end to 8 px inside the other.
  const sliderColours = async (
    page: any,
    times: number[],
    duration: number
  ): Promise<number[][]> => {
    // Another extension's notification can float over the slider.
    await page.evaluate(() => {
      for (const toast of document.querySelectorAll<HTMLElement>(
        '.Toastify__toast-container, .jp-toastContainer'
      )) {
        toast.style.display = 'none';
      }
    });
    const box = (await seekBar(page).boundingBox())!;
    const shot: Buffer = await seekBar(page).screenshot();
    const xs = times.map(t => 8 + ((box.width - 16) * t) / duration);
    return page.evaluate(
      async ([base64, xs, width]: [string, number[], number]) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: 'image/png' })
        );
        const context = new OffscreenCanvas(
          bitmap.width,
          bitmap.height
        ).getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const scale = bitmap.width / width;
        return xs.map(x =>
          Array.from(
            context
              .getImageData(
                Math.round(x * scale),
                Math.floor(bitmap.height / 2),
                1,
                1
              )
              .data.slice(0, 3)
          )
        );
      },
      [shot.toString('base64'), xs, box.width]
    );
  };
  // WCAG contrast of two opaque colours.
  const contrast = (one: number[], two: number[]): number => {
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [luminance(one), luminance(two)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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
  // The first ruler notch of `kind` (primary, secondary or tick): its label,
  // height, line width, and the contrast of its line colour against the panel,
  // composited at the opacity of the notch and its ancestors.
  const notch = (page: any, kind: string) =>
    page.evaluate(
      ([shown, kind]: string[]) => {
        const host = document.querySelector(
          `${shown} .jp-AdvancedMediaViewer-wave > div`
        ) as HTMLElement;
        const el = host.shadowRoot!.querySelector(
          `[part~="timeline-notch-${kind}"]`
        ) as HTMLElement | null;
        if (!el) {
          return { text: '', height: 0, line: 0, contrast: 0 };
        }
        let opacity = 1;
        for (
          let node: Element | null = el;
          node;
          node = node.parentElement ?? (node.parentNode as ShadowRoot).host
        ) {
          opacity *= Number(getComputedStyle(node).opacity);
          if (node === host) {
            break;
          }
        }
        const rgba = (value: string) => {
          const [r, g, b, a = 1] = value.match(/[\d.]+/g)!.map(Number);
          return { r, g, b, a };
        };
        const luminance = (r: number, g: number, b: number) => {
          const channel = (v: number) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          };
          return (
            0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
          );
        };
        const style = getComputedStyle(el);
        const front = rgba(style.borderLeftColor);
        const back = rgba(
          getComputedStyle(
            document.querySelector(`${shown} .jp-AdvancedMediaViewer`)!
          ).backgroundColor
        );
        const a = front.a * opacity;
        const one = luminance(
          front.r * a + back.r * (1 - a),
          front.g * a + back.g * (1 - a),
          front.b * a + back.b * (1 - a)
        );
        const two = luminance(back.r, back.g, back.b);
        return {
          text: el.textContent ?? '',
          height: el.getBoundingClientRect().height,
          line: parseFloat(style.borderLeftWidth),
          contrast: (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05)
        };
      },
      [SHOWN, kind]
    );

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
    // The played part is drawn inside the unplayed shape and takes its alpha,
    // so an opaque wave colour leaves the accent at full strength.
    expect(
      await resolved(
        page,
        await page.evaluate(
          () =>
            (window as any).jupyterapp.shell.currentWidget.content.wavesurfer
              .options.waveColor
        )
      )
    ).toMatch(/^rgb\(/);

    // The canvas colours follow a theme change.
    await page.theme.setDarkTheme();
    const darkBrand = await resolved(page, 'var(--jp-brand-color1)');
    expect(darkBrand).not.toBe(brand);
    await expect
      .poll(async () => resolved(page, await progressColour(page)))
      .toBe(darkBrand);
    // The repaint keeps the waveform (DEF-MEDIA-28-THEME-ERASE).
    await expect
      .poll(async () => (await parts(page)).canvas?.width ?? 0)
      .toBeGreaterThan(100);
  });

  // DEF-MEDIA-45-RULER-CONTRAST. The labels of the ruler are text, so its
  // secondary labels need 4.5:1 against the panel (WCAG 1.4.3); its minor
  // ticks are graphical content and need 3:1 (WCAG 1.4.11), as the waveform
  // does. A secondary label's text has the colour of its line.
  test('DEF-MEDIA-45-RULER-CONTRAST the secondary labels of the time ruler reach 4.5:1 and its minor ticks 3:1 in the light and the dark theme, under the primary labels', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const panel = (): Promise<string> =>
      viewer(page).evaluate(
        (el: HTMLElement) => getComputedStyle(el).backgroundColor
      );
    const light = await panel();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.theme.setDarkTheme();
        // Measured on the dark panel, not on the light one before the switch.
        await expect.poll(panel).not.toBe(light);
      }
      await expect
        .poll(async () => (await notch(page, 'secondary')).contrast, {
          message: theme
        })
        .toBeGreaterThanOrEqual(4.5);
      const primary = await notch(page, 'primary');
      const secondary = await notch(page, 'secondary');
      const tick = await notch(page, 'tick');
      expect(secondary.text, theme).toMatch(/^\d\d:\d\d$/);
      expect(primary.contrast, theme).toBeGreaterThan(secondary.contrast);
      expect(tick.height, theme).toBeGreaterThan(0);
      expect(tick.line, theme).toBeGreaterThanOrEqual(1);
      expect(tick.contrast, theme).toBeGreaterThanOrEqual(3);
    }
  });

  // DEF-MEDIA-52-MINIMAP-THEME. A theme change makes the overview strip
  // anew; its frame keeps marking the shown part of a zoomed waveform.
  test('DEF-MEDIA-52-MINIMAP-THEME the frame of the overview strip keeps its width after a theme change', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const frame = (): Promise<number> =>
      page.evaluate((shown: string) => {
        const host = document.querySelector(
          `${shown} .jp-AdvancedMediaViewer-wave > div`
        ) as HTMLElement;
        const overlay = host.shadowRoot!.querySelector(
          '[part="minimap-overlay"]'
        );
        return overlay?.getBoundingClientRect().width ?? 0;
      }, SHOWN);
    await page.evaluate(() =>
      (window as any).jupyterapp.shell.currentWidget.content.zoomBy(4)
    );
    // The frame moves with a 100 ms transition.
    await page.waitForTimeout(500);
    const light = await frame();
    expect(light).toBeGreaterThan(2);
    expect(light).toBeLessThan((await parts(page)).minimap.width / 2);

    await page.theme.setDarkTheme();
    const darkBrand = await resolved(page, 'var(--jp-brand-color1)');
    await expect
      .poll(async () => resolved(page, await progressColour(page)))
      .toBe(darkBrand);
    await expect
      .poll(async () => Math.abs((await frame()) - light))
      .toBeLessThan(2);
    await viewer(page).screenshot({
      path: test.info().outputPath('overview-dark.png')
    });
  });

  // ACC-AUDIO-46-SEEK
  test('ACC-AUDIO-46-SEEK a click on the waveform seeks', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);

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
    await control(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    const p = await parts(page);
    const point = at(p.wrapper, 0.5);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(29.5);
    expect(await currentTime(page)).toBeLessThan(31);
  });

  // ACC-AUDIO-47-OVERVIEW
  test('ACC-AUDIO-47-OVERVIEW the overview strip seeks the whole file and scrolls the waveform', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await button(page, 'Zoom in').click();
    await button(page, 'Zoom in').click();
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
    for (const label of ['Zoom out', 'Zoom in', 'Reset to fit']) {
      await expect(button(page, label)).not.toHaveAttribute('disabled', '');
    }
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);
    await button(page, 'Zoom in').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(30, 0);
    await button(page, 'Zoom in').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(15, 0);
    await button(page, 'Zoom out').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(30, 0);
    await button(page, 'Reset to fit').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);

    const p = await parts(page);
    const point = at(p.wrapper, 0.5);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -600);
    await expect.poll(() => shownSpan(page)).toBeLessThan(55);
    await button(page, 'Reset to fit').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);

    // During playback the view follows the playback line out of the
    // first quarter.
    await button(page, 'Zoom in').click();
    await button(page, 'Zoom in').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(15, 0);
    await seek(page, 14);
    await control(page, 'Play').click();
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

    // A press that moves under the 8 px drag threshold is a click: it seeks,
    // creates no region and leaves Loop off (DEF-MEDIA-13,
    // DEF-MEDIA-25-CLICK-SEEK).
    const before = await parts(page);
    const jitter = at(before.wrapper, 0.5);
    await page.mouse.move(jitter.x, jitter.y);
    await page.mouse.down();
    await page.mouse.move(jitter.x + 4, jitter.y);
    await page.mouse.up();
    expect((await parts(page)).regions).toBe(0);
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => currentTime(page)).toBeGreaterThan(29.5);
    expect(await currentTime(page)).toBeLessThan(31);

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
    await control(page, 'Play').click();
    await page.waitForTimeout(3000);
    const time = await currentTime(page);
    expect(time).toBeGreaterThan(10);
    expect(time).toBeLessThan(13);

    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
    expect((await parts(page)).regions).toBe(0);
  });

  // ACC-AUDIO-50-LOOP, after DEF-MEDIA-25-CLICK-SEEK. wavesurfer gives a drag
  // its own start width, so this one needs a file short enough that the region
  // stays under MIN_LOOP. Past the drag threshold wavesurfer drops the click,
  // so the viewer does the seek.
  test('ACC-AUDIO-50-LOOP a drag under the shortest loop seeks to its start and leaves Loop off', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/short.wav`;
    await page.contents.uploadContent(
      wav(20).toString('base64'),
      'base64',
      file
    );
    await open(page, file);
    const from = at((await parts(page)).wrapper, 0.25);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y);
    await page.mouse.up();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(4.5);
    expect(await currentTime(page)).toBeLessThan(5.5);
    expect((await parts(page)).regions).toBe(0);
    await expect(labelled(page, 'Loop')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  // ACC-AUDIO-51-CONTROLS
  test('ACC-AUDIO-51-CONTROLS the control row under the waveform plays, seeks and sets the speed, and the toolbar holds none of them', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    // Under the waveform: the time row, then the control row.
    const wave = (await viewer(page)
      .locator('.jp-AdvancedMediaViewer-wave')
      .boundingBox())!;
    const times = (await bar(page)
      .locator('.jp-AdvancedMediaViewer-times')
      .boundingBox())!;
    const row = (await bar(page)
      .locator('.jp-AdvancedMediaViewer-controls')
      .boundingBox())!;
    expect(times.y).toBeGreaterThanOrEqual(wave.y + wave.height - 1);
    expect(row.y).toBeGreaterThanOrEqual(times.y + times.height - 1);

    // Back, a 40 px Play in the brand colour and Forward in the centre.
    const back = (await control(page, 'Back 5 seconds').boundingBox())!;
    const play = (await control(page, 'Play').boundingBox())!;
    const forward = (await control(page, 'Forward 5 seconds').boundingBox())!;
    expect(back.x + back.width).toBeLessThanOrEqual(play.x);
    expect(play.x + play.width).toBeLessThanOrEqual(forward.x);
    expect(
      Math.abs(play.x + play.width / 2 - (row.x + row.width / 2))
    ).toBeLessThan(2);
    expect(play.width).toBeCloseTo(40, 0);
    expect(play.height).toBeCloseTo(40, 0);
    for (const box of [back, forward]) {
      expect(box.width).toBeCloseTo(28, 0);
      expect(box.height).toBeCloseTo(28, 0);
    }
    expect(
      await control(page, 'Play').evaluate(
        (el: HTMLElement) => getComputedStyle(el).backgroundColor
      )
    ).toBe(await resolved(page, 'var(--jp-brand-color1)'));
    expect(await iconOf(page, 'Play')).toBe('ui-components:run');
    // Mute, volume and the speed at the right end, in that order.
    const mute = (await control(page, 'Mute').boundingBox())!;
    const level = (await volume(page).boundingBox())!;
    const speedBox = (await speedMenu(page).boundingBox())!;
    expect(forward.x + forward.width).toBeLessThan(mute.x);
    expect(mute.x + mute.width).toBeLessThanOrEqual(level.x);
    expect(level.x + level.width).toBeLessThanOrEqual(speedBox.x);
    expect(
      Math.abs(row.x + row.width - (speedBox.x + speedBox.width))
    ).toBeLessThan(2);

    await seek(page, 10);
    await control(page, 'Forward 5 seconds').click();
    await control(page, 'Forward 5 seconds').click();
    await expect.poll(() => currentTime(page)).toBeCloseTo(20, 1);
    await control(page, 'Back 5 seconds').click();
    await expect.poll(() => currentTime(page)).toBeCloseTo(15, 1);

    await control(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    expect(await iconOf(page, 'Pause')).toBe('ui-components:pause');
    await control(page, 'Pause').click();
    await expect.poll(() => paused(page)).toBe(true);
    await expect(control(page, 'Play')).toBeVisible();

    const speed = speedMenu(page);
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

    // The toolbar holds none of the playback controls.
    for (const title of [
      'Play',
      'Pause',
      'Back 5 seconds',
      'Forward 5 seconds',
      'Playback speed'
    ]) {
      await expect(toolbar(page).locator(`[title="${title}"]`)).toHaveCount(0);
    }
    await expect(toolbar(page).locator('select')).toHaveCount(0);
  });

  // ACC-AUDIO-51-CONTROLS. Each control is clicked while the viewer has the
  // focus; the keys must still reach the viewer, not the control.
  test('ACC-AUDIO-51-CONTROLS Space, Left and Right still act on the viewer after a click on a control under the waveform', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await seek(page, 10);
    await control(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    let before = await currentTime(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeGreaterThan(before + 4.9);
    expect(await currentTime(page)).toBeLessThan(before + 6.5);
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(true);

    // The volume slider keeps its value: Left moves playback, not the slider.
    await volume(page).click();
    const level = await volume(page).inputValue();
    before = await currentTime(page);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(page)).toBeCloseTo(before - 5, 1);
    await expect(volume(page)).toHaveValue(level);

    // The speed menu keeps its choice: Right moves playback.
    await speedMenu(page).selectOption('1.5');
    await speedMenu(page).focus();
    before = await currentTime(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(before + 5, 1);
    await expect(speedMenu(page)).toHaveValue('1.5');

    // Mute, then Back: Space plays, then pauses.
    await control(page, 'Mute').click();
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(false);
    await control(page, 'Back 5 seconds').click();
    await page.keyboard.press('Space');
    await expect.poll(() => paused(page)).toBe(true);
  });

  // ACC-AUDIO-51-CONTROLS. The window is narrowed until the audio panel is
  // 360 px wide.
  test('ACC-AUDIO-51-CONTROLS in a 360 px wide panel the rows wrap and every control stays inside the panel', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await page.evaluate(() => {
      const shell = (window as any).jupyterapp.shell;
      shell.collapseLeft();
      shell.collapseRight();
    });
    const width = (): Promise<number> =>
      viewer(page).evaluate(
        (el: HTMLElement) => el.getBoundingClientRect().width
      );
    for (let i = 0; i < 4 && Math.abs((await width()) - 360) > 0.5; i++) {
      const size = page.viewportSize()!;
      const now = await width();
      await page.setViewportSize({
        width: Math.round(size.width + 360 - now),
        height: size.height
      });
      await expect.poll(width).not.toBe(now);
    }
    expect(await width()).toBeCloseTo(360, 0);

    const panel = (await viewer(page).boundingBox())!;
    const items = [
      bar(page).locator('.jp-AdvancedMediaViewer-time'),
      seekBar(page),
      bar(page).locator('.jp-AdvancedMediaViewer-length'),
      bar(page).locator('.jp-AdvancedMediaViewer-range'),
      control(page, 'Back 5 seconds'),
      control(page, 'Play'),
      control(page, 'Forward 5 seconds'),
      control(page, 'Mute'),
      volume(page),
      speedMenu(page)
    ];
    for (const item of items) {
      await expect(item).toBeVisible();
      const box = (await item.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(panel.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(
        panel.x + panel.width + 0.5
      );
    }
    // Nothing scrolls sideways, and the control row takes more than one line.
    expect(
      await viewer(page).evaluate(
        (el: HTMLElement) => el.scrollWidth <= el.clientWidth
      )
    ).toBe(true);
    const play = (await control(page, 'Play').boundingBox())!;
    const mute = (await control(page, 'Mute').boundingBox())!;
    expect(mute.y).toBeGreaterThanOrEqual(play.y + play.height - 1);
  });

  // DEF-MEDIA-62-CENTRED-PLAY. The bar is the panel less its 32 px padding at
  // each side; below a 520 px bar the control row wraps, and from 307 px the
  // centre and the sound groups would fit on one line.
  test('DEF-MEDIA-62-CENTRED-PLAY Play is in the centre of the bar at every panel width from 360 to 1400 px', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await page.evaluate(() => {
      const shell = (window as any).jupyterapp.shell;
      shell.collapseLeft();
      shell.collapseRight();
    });
    const width = (): Promise<number> =>
      viewer(page).evaluate(
        (el: HTMLElement) => el.getBoundingClientRect().width
      );
    const widths = [360, 370, 371, 583, 584, 1400];
    for (let w = 380; w < 1400; w += 40) {
      widths.push(w);
    }
    for (const target of widths.sort((a, b) => a - b)) {
      for (let i = 0; i < 4 && Math.abs((await width()) - target) > 0.5; i++) {
        const size = page.viewportSize()!;
        const now = await width();
        await page.setViewportSize({
          width: Math.round(size.width + target - now),
          height: size.height
        });
        await expect.poll(width).not.toBe(now);
      }
      expect(await width()).toBeCloseTo(target, 0);
      const row = (await bar(page).boundingBox())!;
      const play = (await control(page, 'Play').boundingBox())!;
      expect(
        Math.abs(play.x + play.width / 2 - (row.x + row.width / 2)),
        `Play off the centre in a ${target} px panel`
      ).toBeLessThan(2);
    }
  });

  // ACC-AUDIO-52-TIME
  test('ACC-AUDIO-52-TIME the time row shows the played time at the left and the length at the right, updated on a seek and during playback', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const played = bar(page).locator('.jp-AdvancedMediaViewer-time');
    const range = bar(page).locator('.jp-AdvancedMediaViewer-range');
    const length = bar(page).locator('.jp-AdvancedMediaViewer-length');
    await expect(played).toHaveText('00:00.0');
    await expect(length).toHaveText('01:00.0');
    await seek(page, 15);
    await expect(played).toHaveText('00:15.0');
    await expect(length).toHaveText('01:00.0');
    await seek(page, 42.5);
    await expect(played).toHaveText('00:42.5');

    // The played time, the seek slider and the length, left to right; the
    // shown range is in the control row (ACC-AUDIO-123-SEEKBAR-ALWAYS).
    const row = (await bar(page)
      .locator('.jp-AdvancedMediaViewer-times')
      .boundingBox())!;
    const left = (await played.boundingBox())!;
    const middle = (await seekBar(page).boundingBox())!;
    const right = (await length.boundingBox())!;
    expect(Math.abs(left.x - row.x)).toBeLessThan(1);
    expect(left.x + left.width).toBeLessThanOrEqual(middle.x);
    expect(middle.x + middle.width).toBeLessThanOrEqual(right.x);
    expect(Math.abs(right.x + right.width - (row.x + row.width))).toBeLessThan(
      1
    );
    const style = (locator: any) =>
      locator.evaluate((el: HTMLElement) => ({
        size: getComputedStyle(el).fontSize,
        figures: getComputedStyle(el).fontVariantNumeric,
        colour: getComputedStyle(el).color
      }));
    // The variable is in em, so it is resolved beside the time row.
    const size2 = await bar(page).evaluate((el: HTMLElement) => {
      const probe = document.createElement('span');
      probe.style.fontSize = 'var(--jp-ui-font-size2)';
      el.appendChild(probe);
      const value = getComputedStyle(probe).fontSize;
      probe.remove();
      return value;
    });
    const muted = await resolved(page, 'var(--jp-ui-font-color2)');
    expect(await style(played)).toMatchObject({
      size: size2,
      figures: 'tabular-nums'
    });
    expect((await style(range)).colour).toBe(muted);
    expect((await style(length)).colour).toBe(muted);

    await control(page, 'Play').click();
    await expect(played).not.toHaveText('00:42.5');
    await control(page, 'Pause').click();
  });

  // ACC-AUDIO-112-VOLUME
  test('ACC-AUDIO-112-VOLUME mute and the volume slider act as in the video viewer and hold after Reload', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/${NAME}`;
    const state = () =>
      media(page).evaluate((m: HTMLMediaElement) => ({
        muted: m.muted,
        volume: m.volume
      }));
    await open(page, file);
    await expect(volume(page)).toHaveValue('1');
    expect(await iconOf(page, 'Mute')).toContain('plyr-volume');

    await control(page, 'Mute').click();
    await expect.poll(async () => (await state()).muted).toBe(true);
    await expect(control(page, 'Mute')).toHaveCount(0);
    expect(await iconOf(page, 'Unmute')).toContain('plyr-muted');
    await expect(volume(page)).toHaveValue('0');

    // Moving the slider above 0 unmutes.
    await volume(page).fill('0.3');
    let now = await state();
    expect(now.muted).toBe(false);
    expect(now.volume).toBeCloseTo(0.3, 5);
    expect(await iconOf(page, 'Mute')).toContain('plyr-volume');

    // The slider follows a volume set elsewhere.
    await media(page).evaluate((m: HTMLMediaElement) => (m.volume = 0.6));
    await expect(volume(page)).toHaveValue('0.6');

    // At volume 0 the icon shows muted and the button is named Unmute.
    await volume(page).fill('0');
    expect(await iconOf(page, 'Unmute')).toContain('plyr-muted');
    expect((await state()).muted).toBe(false);
    await volume(page).fill('0.6');

    // Muted and the volume hold after Reload; a shorter file shows when
    // Reload has set the new source.
    await control(page, 'Mute').click();
    await page.contents.uploadContent(
      wav(30).toString('base64'),
      'base64',
      file
    );
    await button(page, 'Reload audio from disk').click();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 00:30.0');
    now = await state();
    expect(now.muted).toBe(true);
    expect(now.volume).toBeCloseTo(0.6, 5);
    await expect(control(page, 'Unmute')).toBeVisible();
    await expect(volume(page)).toHaveValue('0');
  });

  // DEF-MEDIA-60-UNMUTE-ZERO. Plyr's toggle reads volume 0 as muted and
  // unmutes to the last volume the slider settled on above 0.
  test('DEF-MEDIA-60-UNMUTE-ZERO at volume 0 the mute button brings back the last volume, as Plyr does', async ({
    page,
    tmpPath
  }) => {
    const state = () =>
      media(page).evaluate((m: HTMLMediaElement) => ({
        muted: m.muted,
        volume: m.volume
      }));
    await open(page, `${tmpPath}/${NAME}`);
    await volume(page).fill('0.6');
    await volume(page).fill('0');
    expect(await state()).toEqual({ muted: false, volume: 0 });
    await control(page, 'Unmute').click();
    await expect.poll(state).toEqual({ muted: false, volume: 0.6 });
    await expect(volume(page)).toHaveValue('0.6');

    // Muted and then at 0: Unmute brings the sound back too.
    await control(page, 'Mute').click();
    await volume(page).fill('0');
    expect(await state()).toEqual({ muted: true, volume: 0 });
    await control(page, 'Unmute').click();
    await expect.poll(state).toEqual({ muted: false, volume: 0.6 });
    expect(await iconOf(page, 'Mute')).toContain('plyr-volume');
  });

  // DEF-MEDIA-50-SLIDER-VALUETEXT. A screen reader reads aria-valuetext in
  // place of the raw value, as on the video viewer's Plyr sliders.
  test('DEF-MEDIA-50-SLIDER-VALUETEXT the seek slider reads as a time of the length and the volume slider as a percentage', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await seek(page, 15.4);
    await expect(seekBar(page)).toHaveAttribute(
      'aria-valuetext',
      '00:15 of 01:00'
    );
    await volume(page).fill('0.3');
    await expect(volume(page)).toHaveAttribute('aria-valuetext', '30%');
    await control(page, 'Mute').click();
    await expect(volume(page)).toHaveAttribute('aria-valuetext', '0%');
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

  // ACC-AUDIO-113-SEEKBAR, which took over this part of ACC-AUDIO-54-LARGE.
  // The peaks request is answered 404, so no waveform comes. The test server
  // answers byte ranges on the file URL, which the player streams from.
  test('ACC-AUDIO-113-SEEKBAR a file with no waveform plays without the browser control and seeks with the slider of the time row', async ({
    page,
    tmpPath
  }) => {
    await page.route(PEAKS, (route: any) =>
      route.fulfill({ status: 404, json: { message: '' } })
    );
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-message')
    ).toHaveText('The waveform could not be drawn.');
    // No decoded waveform.
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-wave > div')
    ).toHaveCount(0);
    // There is no waveform to zoom, so the buttons are disabled rather than
    // enabled and doing nothing (DEF-MEDIA-9).
    for (const label of ['Zoom out', 'Zoom in', 'Reset to fit']) {
      await expect(button(page, label)).toHaveAttribute('disabled', '');
    }
    expect(
      await page.evaluate(
        () => (window as any).jupyterapp.shell.currentWidget.content.wavesurfer
      )
    ).toBeNull();
    // No browser audio control: the element has no controls attribute and
    // does not show.
    const player = await media(page).evaluate((m: HTMLMediaElement) => ({
      controls: m.hasAttribute('controls'),
      src: m.src
    }));
    expect(player.controls).toBe(false);
    expect(player.src).toContain(`/files/`);
    await expect(media(page)).toBeHidden();

    // The seek slider takes the middle of the time row; with no waveform there
    // is no shown range.
    const slider = seekBar(page);
    await expect(slider).toBeVisible();
    await expect(
      bar(page).locator('.jp-AdvancedMediaViewer-range')
    ).toBeHidden();
    const left = (await bar(page)
      .locator('.jp-AdvancedMediaViewer-time')
      .boundingBox())!;
    const right = (await bar(page)
      .locator('.jp-AdvancedMediaViewer-length')
      .boundingBox())!;
    let box = (await slider.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(box.x + box.width).toBeLessThanOrEqual(right.x);

    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
      .toBeCloseTo(60, 0);
    // A point of the slider's track: a range input moves the centre of its
    // 16 px Chromium thumb from 8 px inside one end to 8 px inside the other.
    const track = (fraction: number) => box.x + 8 + (box.width - 16) * fraction;
    // A click at the middle of the slider moves playback to the middle.
    const y = box.y + box.height / 2;
    await page.mouse.click(track(0.5), y);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(29.5);
    expect(await currentTime(page)).toBeLessThan(30.5);
    // A drag to three quarters moves it there.
    await page.mouse.move(track(0.5), y);
    await page.mouse.down();
    await page.mouse.move(track(0.6), y);
    await page.mouse.move(track(0.75), y);
    await page.mouse.up();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(44.5);
    expect(await currentTime(page)).toBeLessThan(45.5);

    // It plays from that URL with Play of the control row, and the slider
    // follows playback.
    const start = Number(await slider.inputValue());
    await control(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    await page.waitForTimeout(1000);
    await expect
      .poll(async () => Number(await slider.inputValue()))
      .toBeGreaterThan(start + 0.5);
    await control(page, 'Pause').click();
    box = (await slider.boundingBox())!;
    expect(box.width).toBeGreaterThan(100);
    expect(
      await media(page).evaluate((m: HTMLMediaElement) =>
        m.seekable.length ? m.seekable.end(0) : 0
      )
    ).toBeCloseTo(60, 0);
  });

  // ACC-AUDIO-123-SEEKBAR-ALWAYS. A file with its waveform.
  test('ACC-AUDIO-123-SEEKBAR-ALWAYS a file with a waveform has the seek slider between the played time and the length, and the shown range in the control row', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    const times = bar(page).locator('.jp-AdvancedMediaViewer-times');
    const slider = times.locator('input.jp-AdvancedMediaViewer-seek');
    await expect(slider).toBeVisible();
    const left = (await times
      .locator('.jp-AdvancedMediaViewer-time')
      .boundingBox())!;
    const right = (await times
      .locator('.jp-AdvancedMediaViewer-length')
      .boundingBox())!;
    const box = (await slider.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(box.x + box.width).toBeLessThanOrEqual(right.x);
    expect(box.width).toBeGreaterThan(100);

    // The shown range is in the left cell of the control row, left of Back,
    // and no longer in the time row.
    const row = bar(page).locator('.jp-AdvancedMediaViewer-controls');
    const range = row.locator('.jp-AdvancedMediaViewer-range');
    await expect(range).toHaveText('showing 00:00.0 - 01:00.0');
    await expect(times.locator('.jp-AdvancedMediaViewer-range')).toHaveCount(0);
    const rowBox = (await row.boundingBox())!;
    const rangeBox = (await range.boundingBox())!;
    const back = (await control(page, 'Back 5 seconds').boundingBox())!;
    expect(Math.abs(rangeBox.x - rowBox.x)).toBeLessThan(1);
    expect(rangeBox.x + rangeBox.width).toBeLessThanOrEqual(back.x);
    expect(rangeBox.y).toBeGreaterThanOrEqual(rowBox.y - 0.5);
    expect(rangeBox.y + rangeBox.height).toBeLessThanOrEqual(
      rowBox.y + rowBox.height + 0.5
    );

    // A click at the middle moves playback to 30 s, a drag to three quarters
    // to 45 s. The thumb centre runs from 8 px inside one end to 8 px inside
    // the other.
    const track = (fraction: number) => box.x + 8 + (box.width - 16) * fraction;
    const y = box.y + box.height / 2;
    await page.mouse.click(track(0.5), y);
    await expect.poll(() => currentTime(page)).toBeGreaterThan(29.5);
    expect(await currentTime(page)).toBeLessThan(30.5);
    await page.mouse.move(track(0.5), y);
    await page.mouse.down();
    await page.mouse.move(track(0.6), y);
    await page.mouse.move(track(0.75), y);
    await page.mouse.up();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(44.5);
    expect(await currentTime(page)).toBeLessThan(45.5);

    // With the slider focused, Right and Left move playback 5 s, and the
    // slider follows.
    await expect(slider).toBeFocused();
    let before = await currentTime(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentTime(page)).toBeCloseTo(before + 5, 1);
    await expect
      .poll(async () => Number(await slider.inputValue()))
      .toBeCloseTo(before + 5, 1);
    before = await currentTime(page);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTime(page)).toBeCloseTo(before - 5, 1);
    await expect
      .poll(async () => Number(await slider.inputValue()))
      .toBeCloseTo(before - 5, 1);

    // The slider follows playback.
    const start = Number(await slider.inputValue());
    await control(page, 'Play').click();
    await expect.poll(() => paused(page)).toBe(false);
    await expect
      .poll(async () => Number(await slider.inputValue()))
      .toBeGreaterThan(start + 0.5);
    await control(page, 'Pause').click();
  });

  // ACC-AUDIO-54-LARGE. The test server's own server part computes the peaks
  // of the 60 s WAV; the browser decodes nothing.
  test('ACC-AUDIO-54-LARGE every audio file shows the waveform from the peaks of the server and is never downloaded', async ({
    page,
    tmpPath
  }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.decodes = 0;
      const decode = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = function (
        this: BaseAudioContext,
        ...args: any[]
      ) {
        w.decodes++;
        return (decode as any).apply(this, args);
      };
    });
    const requests: { url: string; type: string }[] = [];
    page.on('request', (r: any) =>
      requests.push({ url: r.url(), type: r.resourceType() })
    );
    const peaksRequest = page.waitForRequest(
      (r: any) =>
        r
          .url()
          .includes('/jupyterlab-advanced-image-viewer-extension/waveform'),
      { timeout: 20000 }
    );
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    const asked = await peaksRequest;
    expect(new URL(asked.url()).searchParams.get('path')).toBe(
      `${tmpPath}/${NAME}`
    );
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

    // The waveform, the overview strip and the ruler draw; the seek slider
    // stays in the time row and the shown range shows in the control row
    // (ACC-AUDIO-123-SEEKBAR-ALWAYS).
    const p = await parts(page);
    for (const box of [p.canvas, p.minimap, p.timeline]) {
      expect(box.width).toBeGreaterThan(100);
      expect(box.height).toBeGreaterThan(10);
    }
    await expect(
      bar(page).locator(
        '.jp-AdvancedMediaViewer-times input.jp-AdvancedMediaViewer-seek'
      )
    ).toBeVisible();
    await expect(
      bar(page).locator(
        '.jp-AdvancedMediaViewer-controls .jp-AdvancedMediaViewer-range'
      )
    ).toHaveText('showing 00:00.0 - 01:00.0');
    await expect(message(page)).toHaveText('');
    for (const label of ['Zoom out', 'Zoom in', 'Reset to fit']) {
      await expect(button(page, label)).not.toHaveAttribute('disabled', '');
    }
    await expect(
      toolbar(page).locator('.jp-AdvancedMediaViewer-details')
    ).toHaveText('WAV · mono · 937.5 KB · 01:00');

    // The time under the mouse at the middle reads 00:30.
    const middle = at(p.wrapper, 0.5);
    await page.mouse.move(middle.x - 5, middle.y);
    await page.mouse.move(middle.x, middle.y);
    await expect
      .poll(async () => seconds((await parts(page)).hover || '99:00'))
      .toBeGreaterThan(29.5);
    expect(seconds((await parts(page)).hover)).toBeLessThan(30.5);

    // A drag makes a loop region.
    const from = at(p.wrapper, 10 / 60);
    const to = at(p.wrapper, 20 / 60);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y);
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    await expect.poll(async () => (await parts(page)).regions).toBe(1);
    await expect(labelled(page, 'Loop')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // + narrows the shown range.
    await expect.poll(() => shownSpan(page)).toBeCloseTo(60, 0);
    await button(page, 'Zoom in').click();
    await expect.poll(() => shownSpan(page)).toBeCloseTo(30, 0);

    // The element plays the file URL, and nothing fetches the file.
    expect(
      await media(page).evaluate((m: HTMLMediaElement) => m.src)
    ).toContain('/files/');
    expect(
      requests.filter(
        r =>
          r.url.includes(`/files/`) &&
          r.url.includes(NAME) &&
          ['fetch', 'xhr'].includes(r.type)
      )
    ).toEqual([]);
    expect(await page.evaluate(() => (window as any).decodes)).toBe(0);
  });

  // ACC-MEDIA-131-STREAM-ALL. The test server's file handler answers byte
  // ranges. Tornado answers a range that covers the whole file, as Chromium's
  // first request asks, with 200 and Accept-Ranges.
  test('ACC-MEDIA-131-STREAM-ALL every audio file plays from its file URL with byte ranges', async ({
    page,
    tmpPath
  }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.decodes = 0;
      const decode = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = function (
        this: BaseAudioContext,
        ...args: any[]
      ) {
        w.decodes++;
        return (decode as any).apply(this, args);
      };
    });
    const files: any[] = [];
    const waveforms: string[] = [];
    page.on('request', (r: any) => {
      if (r.url().includes('/files/') && r.url().includes(NAME)) {
        files.push(r);
      }
      if (
        r.url().includes('/jupyterlab-advanced-image-viewer-extension/waveform')
      ) {
        waveforms.push(r.url());
      }
    });
    await open(page, `${tmpPath}/${NAME}`);

    const src: string = await media(page).evaluate(
      (m: HTMLMediaElement) => m.src
    );
    expect(src).toContain('/files/');
    expect(src.startsWith('blob:')).toBe(false);
    expect(files.length).toBeGreaterThan(0);
    for (const request of files) {
      expect(request.resourceType(), request.url()).toBe('media');
    }
    expect((await files[0].allHeaders())['range']).toBe('bytes=0-');
    const answer = await files[0].response();
    expect([200, 206]).toContain(answer.status());
    expect((await answer.allHeaders())['accept-ranges']).toBe('bytes');
    expect(waveforms).toHaveLength(1);
    expect(new URL(waveforms[0]).searchParams.get('path')).toBe(
      `${tmpPath}/${NAME}`
    );
    expect(await page.evaluate(() => (window as any).decodes)).toBe(0);
  });

  // ACC-MEDIA-131-STREAM-ALL. The first request gets the first 15 s of the
  // 60 s file and every later one is held, so the file plays while most of it
  // has not arrived.
  test('ACC-MEDIA-131-STREAM-ALL playback starts before the whole audio file arrives', async ({
    page,
    tmpPath
  }) => {
    const part = 44 + 15 * 2 * RATE;
    let held = 0;
    let served = 0;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      if (served++) {
        held++;
        return;
      }
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes 0-${part - 1}/${TONE.length}`
        },
        body: TONE.subarray(0, part)
      });
    });
    await open(page, `${tmpPath}/${NAME}`);
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
    await expect.poll(() => held).toBeGreaterThan(0);
    const player = await media(page).evaluate((m: HTMLMediaElement) => ({
      duration: m.duration,
      buffered: m.buffered.length ? m.buffered.end(m.buffered.length - 1) : 0
    }));
    expect(player.duration).toBeCloseTo(60, 0);
    expect(player.buffered).toBeLessThan(player.duration - 1);
    await control(page, 'Pause').click();
  });

  // DEF-MEDIA-68-BUFFER-CUE. As ACC-VIDEO-133-BUFFERED: the first request
  // gets the first 15 s, as in ACC-MEDIA-131-STREAM-ALL, and every later one
  // is held. A seek into the part that has not arrived must say on the
  // message line that the audio waits for data, then clear it and play on
  // once the read is answered.
  test('DEF-MEDIA-68-BUFFER-CUE the message line shows Buffering... while a seek waits for data', async ({
    page,
    tmpPath
  }) => {
    const end = 44 + 15 * 2 * RATE - 1;
    const held: any[] = [];
    let served = 0;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      if (served++) {
        held.push(route);
        return;
      }
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes 0-${end}/${TONE.length}`
        },
        body: TONE.subarray(0, end + 1)
      });
    });
    await open(page, `${tmpPath}/${NAME}`);
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
    // Seek into the part the server has not sent: the element waits for it.
    await media(page).evaluate((m: HTMLMediaElement) => {
      m.currentTime = 30;
    });
    await expect(message(page)).toHaveText('Buffering...', { timeout: 5000 });
    await expect.poll(() => held.length, { timeout: 10000 }).toBeGreaterThan(0);
    // Answer every held read with the rest of the file.
    for (const route of held) {
      const start = Number(
        /bytes=(\d+)-/.exec(route.request().headers()['range'] ?? '')?.[1] ?? 0
      );
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${TONE.length - 1}/${TONE.length}`
        },
        body: TONE.subarray(start)
      });
    }
    await expect(message(page)).toHaveText('', { timeout: 10000 });
    await expect
      .poll(() => currentTime(page), { timeout: 10000 })
      .toBeGreaterThan(30.5);
  });

  // DEF-MEDIA-68-BUFFER-CUE. A failed peaks request leaves its sentence on
  // the message line; a wait for data must not replace a sentence it does
  // not own.
  test('DEF-MEDIA-68-BUFFER-CUE a seek that waits for data keeps the waveform failure sentence', async ({
    page,
    tmpPath
  }) => {
    const end = 44 + 15 * 2 * RATE - 1;
    const held: any[] = [];
    let served = 0;
    await page.route(PEAKS, (route: any) => route.abort('failed'));
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      if (served++) {
        held.push(route);
        return;
      }
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes 0-${end}/${TONE.length}`
        },
        body: TONE.subarray(0, end + 1)
      });
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await viewer(page).waitFor();
    await expect(message(page)).toHaveText('The waveform could not be drawn.');
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
    // Seek into the part the server has not sent: the element waits for it.
    await media(page).evaluate((m: HTMLMediaElement) => {
      m.currentTime = 30;
    });
    await expect.poll(() => held.length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await expect(message(page)).toHaveText('The waveform could not be drawn.');
    expect(await message(page).textContent()).not.toBe('Buffering...');
  });

  // DEF-MEDIA-68-BUFFER-CUE. The round-4 probe: with only the 44-byte WAV
  // header served and every later read held, opening stalls at readyState 0,
  // and play() then fires waiting with the metadata still unread. The cue
  // must not hide the Loading cover (ACC-MEDIA-114-SPINNER).
  test('DEF-MEDIA-68-BUFFER-CUE playback started before the metadata keeps the Loading cover', async ({
    page,
    tmpPath
  }) => {
    const held: any[] = [];
    let served = 0;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      if (served++) {
        held.push(route);
        return;
      }
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes 0-43/${TONE.length}`
        },
        body: TONE.subarray(0, 44)
      });
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    const spin = spinner(page);
    await expect(spin).toBeVisible();
    await expect(spin).toContainText('Loading...');
    await expect.poll(() => held.length, { timeout: 10000 }).toBeGreaterThan(0);
    await viewer(page).focus();
    await page.keyboard.press('Space');
    // A short wait: the cue must leave the cover alone.
    await page.waitForTimeout(1000);
    await expect(spin).toBeVisible();
    await expect(spin).toContainText('Loading...');
    // Answer every held read with the rest of the file.
    for (const route of held) {
      const start = Number(
        /bytes=(\d+)-/.exec(route.request().headers()['range'] ?? '')?.[1] ?? 0
      );
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${TONE.length - 1}/${TONE.length}`
        },
        body: TONE.subarray(start)
      });
    }
    await expect(spin).toBeHidden();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.5);
  });

  // ACC-AUDIO-132-BUFFERED. The file request from 0 gets the first 20 s, a
  // request that starts between 38 s and 41 s gets 64 KiB, about 4 s, and
  // every other request is held. Chromium asks in blocks of 32 KiB, so the
  // request of a seek to 40 s can start up to 2 s before it.
  test('ACC-AUDIO-132-BUFFERED the seek slider shows the buffered parts past the played part, at 3:1 against the track and the played part', async ({
    page,
    tmpPath
  }) => {
    const offset = (seconds: number) => 44 + seconds * 2 * RATE;
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      const start = Number(
        /bytes=(\d+)-/.exec(route.request().headers()['range'] ?? '')?.[1] ?? 0
      );
      const end =
        start === 0
          ? offset(20) - 1
          : start >= offset(38) && start < offset(41)
            ? start + 64 * 1024 - 1
            : -1;
      if (end < 0) {
        return;
      }
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/x-wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${TONE.length}`
        },
        body: TONE.subarray(start, end + 1)
      });
    });
    await open(page, `${tmpPath}/${NAME}`);
    // Nothing past 20 s has arrived yet.
    const [before30, before42] = await sliderColours(page, [30, 42], 60);
    expect(before42).toEqual(before30);

    await seek(page, 40);
    await seek(page, 10);
    const ranges = await media(page).evaluate((m: HTMLMediaElement) =>
      Array.from({ length: m.buffered.length }, (_, i) => [
        m.buffered.start(i),
        m.buffered.end(i)
      ])
    );
    expect(ranges, JSON.stringify(ranges)).toHaveLength(2);
    expect(ranges[0][1]).toBeGreaterThan(19);
    expect(ranges[0][1]).toBeLessThan(21);
    expect(ranges[1][0]).toBeLessThan(41);
    expect(ranges[1][1]).toBeGreaterThan(42.5);
    expect(ranges[1][1]).toBeLessThan(50);
    expect(await currentTime(page)).toBeCloseTo(10, 0);

    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.theme.setDarkTheme();
        await expect
          .poll(async () => (await sliderColours(page, [30], 60))[0])
          .not.toEqual(before30);
      }
      const [played, fill15, track30, fill42, track52] = await sliderColours(
        page,
        [5, 15, 30, 42, 52],
        60
      );
      const colours = JSON.stringify({
        played,
        fill15,
        track30,
        fill42,
        track52
      });
      expect(fill42, `${theme} ${colours}`).toEqual(fill15);
      expect(track52, `${theme} ${colours}`).toEqual(track30);
      for (const fill of [fill15, fill42]) {
        expect(
          contrast(fill, track30),
          `${theme} ${colours}`
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(fill, played),
          `${theme} ${colours}`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // DEF-WAVE-57-SOURCE-CHANNELS. The server mixes more than two channels down
  // to two for the peaks; the details name the channels of the file.
  test('DEF-WAVE-57-SOURCE-CHANNELS the file details of a 4-channel file read 4 channels', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      wav(10, 4).toString('base64'),
      'base64',
      `${tmpPath}/${NAME}`
    );
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
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
    await expect(
      toolbar(page).locator('.jp-AdvancedMediaViewer-details')
    ).toHaveText('WAV · 4 channels · 625.0 KB · 00:10');
  });

  // DEF-WAVE-58-CANCEL-ABANDONED, the viewer half. The peaks answer is held
  // unanswered, as while the server decodes; leaving the file must close the
  // request, so the server sees no one waits on the decode.
  test('DEF-WAVE-58-CANCEL-ABANDONED Page Down closes the peaks request of the file it leaves', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      wav(2).toString('base64'),
      'base64',
      `${tmpPath}/voice.wav`
    );
    await page.route(PEAKS, () => undefined);
    const isPeaks = (r: any) =>
      r.url().includes('/jupyterlab-advanced-image-viewer-extension/waveform');
    const asked = page.waitForRequest(isPeaks, { timeout: 20000 });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    const held = await asked;
    const closed = page.waitForEvent('requestfailed', {
      predicate: (r: any) => r.url() === held.url(),
      timeout: 10000
    });
    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await expect(currentTab(page)).toHaveText('voice.wav');
    await closed;
  });

  // ACC-WAVE-120-PROGRESS. The peaks answer is held until the spinner and
  // playback are checked.
  test('ACC-WAVE-120-PROGRESS while the peaks compute, the waveform area shows a spinner with a line and the file already plays', async ({
    page,
    tmpPath
  }) => {
    let release = (): void => undefined;
    const released = new Promise<void>(resolve => (release = resolve));
    let asked = false;
    await page.route(PEAKS, async (route: any) => {
      asked = true;
      await released;
      await route.continue();
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await expect.poll(() => asked, { timeout: 20000 }).toBe(true);

    // The spinner of the waveform area, above the time row, with a line a
    // screen reader reads as a status.
    const peaks = viewer(page).locator('.jp-AdvancedMediaViewer-peaks');
    await expect(peaks).toBeVisible();
    await expect(peaks.locator('.jp-SpinnerContent')).toBeVisible();
    await expect(peaks.getByRole('status')).toHaveText(
      'Drawing the waveform...'
    );
    const area = (await peaks.boundingBox())!;
    const times = (await bar(page)
      .locator('.jp-AdvancedMediaViewer-times')
      .boundingBox())!;
    expect(area.y + area.height).toBeLessThanOrEqual(times.y);
    expect(area.width).toBeGreaterThan(400);

    // The file plays meanwhile, from the control row.
    await expect(spinner(page)).toBeHidden({ timeout: 15000 });
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.5);
    await control(page, 'Pause').click();

    release();
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
    await expect(peaks).toBeHidden();
    // The waveform takes the place the spinner held.
    const wave = (await viewer(page)
      .locator('.jp-AdvancedMediaViewer-wave')
      .boundingBox())!;
    expect(Math.abs(wave.y - area.y)).toBeLessThan(2);
    expect(Math.abs(wave.height - area.height)).toBeLessThan(2);
  });

  // ACC-WAVE-121-FALLBACK. Each failed answer leaves the tab of
  // ACC-AUDIO-113-SEEKBAR with a sentence.
  test('ACC-WAVE-121-FALLBACK a failed peaks request leaves the seek slider and says that the waveform could not be drawn', async ({
    page,
    tmpPath
  }) => {
    const answers: [string, (route: any) => Promise<void>][] = [
      ['404', route => route.fulfill({ status: 404, json: { message: '' } })],
      ['500', route => route.fulfill({ status: 500, json: { message: '' } })],
      ['a network error', route => route.abort('failed')],
      [
        'an answer that is not peaks',
        route => route.fulfill({ status: 200, body: 'not peaks' })
      ]
    ];
    // One route for the whole test: Galata's page proxy keeps page.unroute
    // from removing a handler, so a second route would never be asked.
    let answer = answers[0][1];
    let asked = false;
    await page.route(PEAKS, (route: any) => {
      asked = true;
      return answer(route);
    });
    for (const [index, [name, respond]] of answers.entries()) {
      answer = respond;
      asked = false;
      if (index === 0) {
        await page.filebrowser.open(`${tmpPath}/${NAME}`);
      } else {
        await button(page, 'Reload audio from disk').click();
      }
      await expect
        .poll(() => asked, { message: name, timeout: 20000 })
        .toBe(true);
      await expect(message(page), name).toHaveText(
        'The waveform could not be drawn.'
      );
      await expect(spinner(page), name).toBeHidden();
      await expect(
        viewer(page).locator('.jp-AdvancedMediaViewer-peaks'),
        name
      ).toBeHidden();
      expect(
        await media(page).evaluate((m: HTMLMediaElement) =>
          m.hasAttribute('controls')
        ),
        name
      ).toBe(false);
      for (const label of ['Zoom out', 'Zoom in', 'Reset to fit']) {
        await expect(button(page, label), name).toHaveAttribute('disabled', '');
      }
      // The slider at 50% moves playback to 30 s.
      await expect
        .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
        .toBeCloseTo(60, 0);
      const box = (await seekBar(page).boundingBox())!;
      await page.mouse.click(
        box.x + 8 + (box.width - 16) * 0.5,
        box.y + box.height / 2
      );
      await expect
        .poll(() => currentTime(page), { message: name })
        .toBeGreaterThan(29.5);
      expect(await currentTime(page), name).toBeLessThan(30.5);
    }
  });

  // DEF-MEDIA-22-LARGE-VIDEO
  test('DEF-MEDIA-22-LARGE-VIDEO an audio file request that never answers keeps Loading...', async ({
    page,
    tmpPath
  }) => {
    let asked = (): void => undefined;
    const requested = new Promise<void>(resolve => (asked = resolve));
    await page.route(`**/files/**/${NAME}*`, () => asked());
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await requested;
    await page.waitForTimeout(1000);
    // ACC-MEDIA-114-SPINNER: Loading... shows under the spinner.
    await expect(spinner(page)).toBeVisible();
    await expect(spinner(page)).toContainText('Loading...');
    await expect(message(page)).toHaveText('');
  });

  // ACC-MEDIA-114-SPINNER. The file URL answer is held until the spinner is
  // checked.
  test('ACC-MEDIA-114-SPINNER a spinner with Loading... under it shows in the centre of the audio viewer until the file can play, and goes on an error', async ({
    page,
    tmpPath
  }) => {
    let release = (): void => undefined;
    const released = new Promise<void>(resolve => (release = resolve));
    let asked = (): void => undefined;
    const requested = new Promise<void>(resolve => (asked = resolve));
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      asked();
      await released;
      await route.continue();
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await requested;
    const spin = spinner(page);
    await expect(spin).toBeVisible();
    await expect(spin).toContainText('Loading...');
    // The line is a status, so a screen reader reads it.
    await expect(spin.getByRole('status')).toHaveText('Loading...');
    // The circle and the line under it are centred in the viewer.
    const panel = (await viewer(page).boundingBox())!;
    // The circle turns, and the box of a turned square is up to 1.41 times
    // its side; the box it is laid out in has the same centre and its side.
    const turning = spin.locator('.jp-SpinnerContent');
    const turned = (await turning.boundingBox())!;
    const side = await turning.evaluate((el: HTMLElement) => el.offsetWidth);
    const circle = {
      x: turned.x + (turned.width - side) / 2,
      y: turned.y + (turned.height - side) / 2,
      width: side,
      height: side
    };
    const line = (await spin.getByText('Loading...').boundingBox())!;
    expect(line.y).toBeGreaterThanOrEqual(circle.y + circle.height);
    expect(
      Math.abs(circle.x + circle.width / 2 - (panel.x + panel.width / 2))
    ).toBeLessThan(2);
    expect(
      Math.abs(line.x + line.width / 2 - (panel.x + panel.width / 2))
    ).toBeLessThan(2);
    expect(
      Math.abs(
        (circle.y + line.y + line.height) / 2 - (panel.y + panel.height / 2)
      )
    ).toBeLessThan(2);
    // Nothing at the foot of the panel.
    await expect(message(page)).toHaveText('');

    release();
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
    // Polled: the peaks are not held by the route, so the waveform can be
    // drawn before the released file request gives the element its metadata
    // (DEF-BUILD-78-SPINNER-RACE).
    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.readyState))
      .toBeGreaterThanOrEqual(1);
    await expect(spin).toBeHidden();

    // An unreadable file: the error sentence and no spinner.
    await page.contents.uploadContent(
      'this is not an mp3 file',
      'text',
      `${tmpPath}/broken.mp3`
    );
    await page.filebrowser.open(`${tmpPath}/broken.mp3`);
    await expect(currentTab(page)).toHaveText('broken.mp3');
    await expect(message(page)).toHaveText(
      'This file cannot be played: the file is damaged or in a format this browser cannot play',
      { timeout: 15000 }
    );
    await expect(spinner(page)).toBeHidden();
  });

  // DEF-MEDIA-63-LIVE-REGIONS. A screen reader reads a change of the text of a
  // live region it already has; a region that appears with its text in it is
  // not reliably read. So each line is empty while its region is first drawn,
  // and its text comes at least one drawn frame later. The file answer and
  // the peaks answer are held, so both lines stay up.
  test('DEF-MEDIA-63-LIVE-REGIONS Loading... and Drawing the waveform... are written into their live regions a drawn frame after the regions show', async ({
    page,
    tmpPath
  }) => {
    let releasePeaks = (): void => undefined;
    const peaksReleased = new Promise<void>(
      resolve => (releasePeaks = resolve)
    );
    await page.route(PEAKS, async (route: any) => {
      await peaksReleased;
      await route.continue();
    });
    await page.evaluate(() => {
      const w = window as any;
      // The frames drawn so far.
      w.frames = 0;
      const tick = () => {
        w.frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      // Each new state of a line: the frame, whether it shows, its text.
      const selectors: Record<string, string> = {
        loading: '.jp-AdvancedMediaViewer > .jp-Spinner [role="status"]',
        drawing: '.jp-AdvancedMediaViewer-peaks [role="status"]'
      };
      w.lines = { loading: [], drawing: [] };
      new MutationObserver(() => {
        for (const [key, selector] of Object.entries(selectors)) {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) {
            continue;
          }
          const state = {
            frame: w.frames,
            shown: el.checkVisibility(),
            text: el.textContent
          };
          const list = w.lines[key];
          const last = list[list.length - 1];
          if (!last || last.shown !== state.shown || last.text !== state.text) {
            list.push(state);
          }
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
    });
    let release = (): void => undefined;
    const released = new Promise<void>(resolve => (release = resolve));
    let asked = (): void => undefined;
    const requested = new Promise<void>(resolve => (asked = resolve));
    await page.route(`**/files/**/${NAME}*`, async (route: any) => {
      asked();
      await released;
      await route.continue();
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await requested;
    await expect(spinner(page).getByRole('status')).toHaveText('Loading...');
    release();
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-peaks').getByRole('status')
    ).toHaveText('Drawing the waveform...');

    const lines = await page.evaluate(() => (window as any).lines);
    for (const [key, text] of [
      ['loading', 'Loading...'],
      ['drawing', 'Drawing the waveform...']
    ]) {
      const list = lines[key];
      const written = list.findIndex((s: any) => s.shown && s.text === text);
      expect(written, `${key}: ${JSON.stringify(list)}`).toBeGreaterThan(0);
      const before = list[written - 1];
      expect(before, `${key}: ${JSON.stringify(list)}`).toMatchObject({
        shown: true,
        text: ''
      });
      expect(
        list[written].frame - before.frame,
        `${key}: ${JSON.stringify(list)}`
      ).toBeGreaterThanOrEqual(2);
    }
    releasePeaks();
  });

  // DEF-MEDIA-22-LARGE-VIDEO and ACC-MEDIA-134-LOST-CONNECTION. 'failed' is a
  // request that gets no answer; 'connectionfailed' fails it as a connection
  // the browser found dead does (the repro of DEF-MEDIA-67-NO-RETRY). One
  // route for the whole test.
  test('DEF-MEDIA-22-LARGE-VIDEO ACC-MEDIA-134-LOST-CONNECTION a failed audio file request says the connection was lost, and Reload plays the file', async ({
    page,
    tmpPath
  }) => {
    let error: string | null = null;
    await page.route(`**/files/**/${NAME}*`, (route: any) =>
      error ? route.abort(error) : route.continue()
    );
    for (const [index, code] of ['failed', 'connectionfailed'].entries()) {
      error = code;
      if (index === 0) {
        await page.filebrowser.open(`${tmpPath}/${NAME}`);
      } else {
        await button(page, 'Reload audio from disk').click();
      }
      await expect(message(page), code).toHaveText(LOST);

      error = null;
      await button(page, 'Reload audio from disk').click();
      await expect
        .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration), {
          message: code
        })
        .toBeCloseTo(60, 0);
      await expect(message(page), code).toHaveText('');
      await control(page, 'Play').click();
      await expect
        .poll(() => currentTime(page), { message: code })
        .toBeGreaterThan(0.5);
      await control(page, 'Pause').click();
    }
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
    // A MIDI file of one note, which this browser does not play.
    await page.contents.uploadContent(
      Buffer.from(
        '4d546864000000060000000100604d54726b0000000c00903c6460803c0000ff2f00',
        'hex'
      ).toString('base64'),
      'base64',
      `${tmpPath}/tune.mid`
    );
    // Both play from their file URL, which the server answers in full, so the
    // sentence is the damaged file's, not the lost connection's.
    for (const file of ['broken.mp3', 'tune.mid']) {
      await page.filebrowser.open(`${tmpPath}/${file}`);
      await expect(currentTab(page)).toHaveText(file);
      const message = viewer(page).locator('.jp-AdvancedMediaViewer-message');
      await expect(message, file).toHaveText(
        'This file cannot be played: the file is damaged or in a format this browser cannot play',
        { timeout: 15000 }
      );
      // The browser's own MediaError text is jargon and does not reach the
      // user (DEF-MEDIA-11).
      await expect(message, file).not.toHaveText(
        /MediaError|Failed to load|no supported source|DEMUXER|PIPELINE|codec/i
      );
    }
  });

  // DEF-MEDIA-29-DECODE-FAIL. The server part answers 422 when PyAV cannot
  // decode the file.
  test('DEF-MEDIA-29-DECODE-FAIL a waveform the server cannot decode leaves no browser control and a seek slider that seeks', async ({
    page,
    tmpPath
  }) => {
    await page.route(PEAKS, (route: any) =>
      route.fulfill({ status: 422, json: { message: '' } })
    );
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await expect(
      viewer(page).locator('.jp-AdvancedMediaViewer-message')
    ).toHaveText('The waveform could not be drawn.', { timeout: 15000 });
    // One seek bar: the slider of the time row, never the browser audio
    // control beside it (ACC-AUDIO-113-SEEKBAR).
    expect(
      await media(page).evaluate((m: HTMLMediaElement) =>
        m.hasAttribute('controls')
      )
    ).toBe(false);
    await expect(media(page)).toBeHidden();
    const slider = seekBar(page);
    await expect(slider).toBeVisible();
    await expect
      .poll(() => media(page).evaluate((m: HTMLMediaElement) => m.duration))
      .toBeCloseTo(60, 0);
    // A click at the middle of the slider's track, inset by half of the 16 px
    // Chromium thumb at each end, moves playback to the middle.
    const box = (await slider.boundingBox())!;
    await page.mouse.click(
      box.x + 8 + (box.width - 16) * 0.5,
      box.y + box.height / 2
    );
    await expect.poll(() => currentTime(page)).toBeCloseTo(30, 0);
  });

  // DEF-MEDIA-48-LOAD-COVER and DEF-MEDIA-54-ZOOM-DECODE. The peaks answer is
  // held until the tab is checked, then the next one fails. One route for the
  // whole test.
  test('DEF-MEDIA-48-LOAD-COVER DEF-MEDIA-54-ZOOM-DECODE the file plays from the bar while the peaks are on their way with the zoom buttons disabled, and a failed peaks request leaves no empty waveform box', async ({
    page,
    tmpPath
  }) => {
    let release = (): void => undefined;
    const released = new Promise<void>(resolve => (release = resolve));
    let fail = false;
    await page.route(PEAKS, async (route: any) => {
      if (fail) {
        await route.fulfill({ status: 500, json: { message: '' } });
        return;
      }
      await released;
      await route.continue();
    });
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await viewer(page).waitFor();
    const peaks = viewer(page).locator('.jp-AdvancedMediaViewer-peaks');
    const wave = viewer(page).locator('.jp-AdvancedMediaViewer-wave');
    // The cover goes when the file can play, and the spinner of the waveform
    // stands in the waveform's place until the peaks arrive.
    await expect(spinner(page)).toBeHidden({ timeout: 15000 });
    await expect(peaks).toBeVisible();
    await expect(peaks.getByRole('status')).toHaveText(
      'Drawing the waveform...'
    );
    await expect(wave).toBeHidden();
    // There is no waveform to zoom yet.
    for (const label of ['Zoom out', 'Zoom in', 'Reset to fit']) {
      await expect(button(page, label)).toHaveAttribute('disabled', '');
    }
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.5);
    await control(page, 'Pause').click();

    release();
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
    await expect(peaks).toBeHidden();
    await expect(wave).toBeVisible();
    await expect
      .poll(async () => (await parts(page)).canvas?.width ?? 0)
      .toBeGreaterThan(100);
    for (const label of ['Zoom out', 'Zoom in', 'Reset to fit']) {
      await expect(button(page, label)).not.toHaveAttribute('disabled', '');
    }

    // A failed peaks request keeps the waveform box hidden.
    fail = true;
    await button(page, 'Reload audio from disk').click();
    await expect(message(page)).toHaveText('The waveform could not be drawn.', {
      timeout: 15000
    });
    await expect(wave).toBeHidden();
    await expect(peaks).toBeHidden();
    await expect(spinner(page)).toBeHidden();
  });

  // DEF-MEDIA-23-STALE-CHUNK. A page left open across an install asks for
  // chunk names that no longer exist; on a fresh page a blocked chunk fails the
  // same way.
  test('DEF-MEDIA-23-STALE-CHUNK a missing player chunk asks for a page reload and shows no player', async ({
    page,
    tmpPath
  }) => {
    await page.route(CHUNKS, (route: any) => route.abort('failed'));
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await expect(message(page)).toHaveText(STALE, { timeout: 15000 });
    await expect(viewer(page)).not.toContainText('ChunkLoadError');
    expect(
      await media(page).evaluate((m: HTMLMediaElement) => m.controls)
    ).toBe(false);
    await expect(media(page)).toBeHidden();
  });

  // DEF-MEDIA-59-CHUNK-SENTENCE. The player chunk loads with the peaks, after
  // the file already plays from its URL.
  test('DEF-MEDIA-59-CHUNK-SENTENCE a missing player chunk asks for a page reload and the file still plays', async ({
    page,
    tmpPath
  }) => {
    await page.route(CHUNKS, (route: any) => route.abort('failed'));
    await page.filebrowser.open(`${tmpPath}/${NAME}`);
    await expect(message(page)).toHaveText(STALE, { timeout: 15000 });
    await expect(spinner(page)).toBeHidden();
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.5);
    await control(page, 'Pause').click();
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
        '@stellarshenson/jupyterlab-advanced-image-viewer-extension:plugin',
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

    await page.contents.uploadContent('ab', 'text', `${tmpPath}/scope.txt`);
    await page.filebrowser.open(`${tmpPath}/scope.txt`);
    await page.locator('.jp-FileEditor .cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    await page.keyboard.press('Space');
    expect(
      (await page.locator('.jp-FileEditor .cm-content').innerText()).trim()
    ).toBe('aX b');
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
  test('ACC-MEDIA-66-TOOLBAR the audio toolbar matches the image viewer toolbar and holds Reload, -, +, Fit, Loop, the details and help in that order', async ({
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
    // The same zoom buttons with the same tooltips, in that order; their
    // labels are icons now, so the button text is empty.
    const zoom = (list: any[]) =>
      list
        .filter(item => /^advanced-(zoom|reset)/.test(item.name ?? ''))
        .map(item => [item.text, item.title]);
    expect(zoom(audio)).toEqual([
      ['', 'Zoom out'],
      ['', 'Zoom in'],
      ['', 'Reset to fit']
    ]);
    expect(zoom(audio)).toEqual(zoom(image));
    // Reload, -, +, Fit, Loop, a spacer, the details and help, in that order:
    // the playback controls sit under the waveform.
    expect(audio.map(item => item.name)).toEqual([
      'advanced-refresh',
      'advanced-zoom-out',
      'advanced-zoom-in',
      'advanced-reset-fit',
      'advanced-loop',
      'advanced-spacer',
      'advanced-details',
      'advanced-help'
    ]);
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
    await expect(help).toHaveAttribute('aria-label', 'Keybindings and help');
    await expect(help.locator('svg')).toHaveCount(1);
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
      'Seek bar - click or drag to move playback to that point',
      'Drag - mark a region and loop it',
      'Mute - turn the sound off and on',
      'Volume - set the sound level'
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

  // DEF-MEDIA-16-RELOAD-DELETED
  test('DEF-MEDIA-16-RELOAD-DELETED Reload on a deleted file shows one sentence and no dialog, and Reload on the restored file plays it', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/${NAME}`;
    const details = toolbar(page).locator('.jp-AdvancedMediaViewer-details');
    await open(page, file);
    await expect(details).toHaveText(/./);
    expect(await page.contents.deleteFile(file)).toBe(true);
    await button(page, 'Reload audio from disk').click();
    const message = viewer(page).locator(
      '.jp-AdvancedMediaViewer-message[role="status"]'
    );
    await expect(message).toHaveText(
      'This file cannot be read from the server.'
    );
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    await expect(details).toHaveText('');
    // Nothing of the old file stays: no source and no waveform.
    expect(
      await media(page).evaluate((m: HTMLMediaElement) => m.getAttribute('src'))
    ).toBeNull();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as any
            ).jupyterapp.shell.currentWidget.content.wavesurfer.getDecodedData()
              ?.duration ?? 0
        )
      )
      .toBeLessThan(1);
    await expect(message).toHaveText(
      'This file cannot be read from the server.'
    );

    await page.contents.uploadContent(
      wav(30).toString('base64'),
      'base64',
      file
    );
    await button(page, 'Reload audio from disk').click();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 00:30.0');
    await expect(message).toHaveText('');
    await expect(details).toHaveText('WAV · mono · 468.8 KB · 00:30');
  });

  // DEF-MEDIA-31-FILE-RELOAD
  test('DEF-MEDIA-31-FILE-RELOAD File > Reload from Disk reads the changed file, and on a deleted file shows one sentence and no dialog', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/${NAME}`;
    // The command of File > Reload Audio from Disk. Not awaited, so a dialog it
    // raises is seen by the assertions below, not as a rejected evaluate.
    const reloadFromDisk = () =>
      page.evaluate(() => {
        void (window as any).jupyterapp.commands
          .execute('docmanager:reload')
          .catch(() => undefined);
      });
    await open(page, file);
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
    await page.contents.uploadContent(
      wav(30).toString('base64'),
      'base64',
      file
    );
    await reloadFromDisk();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 00:30.0');
    await expect(
      toolbar(page).locator('.jp-AdvancedMediaViewer-details')
    ).toHaveText('WAV · mono · 468.8 KB · 00:30');

    expect(await page.contents.deleteFile(file)).toBe(true);
    await reloadFromDisk();
    await expect(message(page)).toHaveText(
      'This file cannot be read from the server.'
    );
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    expect(
      await media(page).evaluate((m: HTMLMediaElement) => m.getAttribute('src'))
    ).toBeNull();
  });

  // DEF-MEDIA-32-SPEED-RELOAD
  test('DEF-MEDIA-32-SPEED-RELOAD the chosen speed still holds after Reload', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/${NAME}`;
    const rate = (): Promise<number> =>
      media(page).evaluate((m: HTMLMediaElement) => m.playbackRate);
    await open(page, file);
    const speed = speedMenu(page);
    await speed.selectOption('2');
    expect(await rate()).toBe(2);
    // A shorter file, so the read-out shows when Reload has set the new source.
    await page.contents.uploadContent(
      wav(30).toString('base64'),
      'base64',
      file
    );
    await button(page, 'Reload audio from disk').click();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 00:30.0');
    await expect(speed).toHaveValue('2');
    expect(await rate()).toBe(2);
  });

  // DEF-MEDIA-61-AUDIO-SETTINGS and ACC-AUDIO-124-SETTINGS-CARRY. Page Down
  // opens the next file in a new viewer, and a page reload restores the tab
  // in a new viewer.
  test('DEF-MEDIA-61-AUDIO-SETTINGS ACC-AUDIO-124-SETTINGS-CARRY volume, mute and speed carry to the next audio file and across a page reload', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/carry`;
    for (const name of ['a.wav', 'b.wav']) {
      await page.contents.uploadContent(
        wav(2).toString('base64'),
        'base64',
        `${dir}/${name}`
      );
    }
    const settings = () =>
      media(page).evaluate((m: HTMLMediaElement) => ({
        volume: m.volume,
        muted: m.muted,
        speed: m.playbackRate
      }));
    const chosen = { volume: 0.4, muted: true, speed: 1.5 };
    const carried = async (name: string) => {
      await expect(currentTab(page)).toHaveText(name);
      await expect.poll(settings).toEqual(chosen);
      await expect(speedMenu(page)).toHaveValue('1.5');
      await expect(control(page, 'Unmute')).toBeVisible();
      await expect(volume(page)).toHaveValue('0');
    };
    await open(page, `${dir}/a.wav`);
    await volume(page).fill('0.4');
    await control(page, 'Mute').click();
    await speedMenu(page).selectOption('1.5');
    expect(await settings()).toEqual(chosen);

    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await carried('b.wav');

    // Galata's readiness check waits for a Launcher tab, which the restored
    // layout does not have.
    await page.reload({ waitForIsReady: false });
    await viewer(page).waitFor();
    await carried('b.wav');
  });

  // DEF-MEDIA-65-SETTINGS-MERGE. As Plyr's storage, a change writes only its
  // own keys into the stored record.
  test('DEF-MEDIA-65-SETTINGS-MERGE a volume change in one audio tab leaves the speed chosen in another tab in the stored settings', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/merge`;
    for (const name of ['a.wav', 'b.wav']) {
      await page.contents.uploadContent(
        wav(2).toString('base64'),
        'base64',
        `${dir}/${name}`
      );
    }
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem(
            'jupyterlab-advanced-image-viewer-extension:audio'
          ) ?? '{}'
        )
      );
    await open(page, `${dir}/a.wav`);
    await speedMenu(page).selectOption('1.5');
    await open(page, `${dir}/b.wav`);
    await expect(currentTab(page)).toHaveText('b.wav');
    await speedMenu(page).selectOption('2');
    await expect.poll(async () => (await stored()).speed).toBe(2);

    await page
      .locator('#jp-main-dock-panel .lm-TabBar-tab')
      .filter({ hasText: 'a.wav' })
      .click();
    await expect(currentTab(page)).toHaveText('a.wav');
    await expect(speedMenu(page)).toHaveValue('1.5');
    await volume(page).fill('0.3');
    await expect.poll(async () => (await stored()).volume).toBe(0.3);
    expect((await stored()).speed).toBe(2);
  });

  // DEF-MEDIA-17-CHECKPOINT
  test('DEF-MEDIA-17-CHECKPOINT opening an audio file writes no checkpoint, and the viewer still works', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/${NAME}`;
    await open(page, file);
    // JupyterLab writes the checkpoint as the document opens.
    await page.waitForTimeout(1000);
    const checkpoints = () =>
      page.evaluate(
        (path: string) =>
          (window as any).jupyterapp.serviceManager.contents.listCheckpoints(
            path
          ),
        file
      );
    expect(await checkpoints()).toEqual([]);
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(0.2);
    await control(page, 'Pause').click();

    await button(page, 'Reload audio from disk').click();
    await expect.poll(() => timeText(page)).toBe('00:00.0 / 01:00.0');
    expect(await checkpoints()).toEqual([]);
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
    await control(page, 'Play').click();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(1);
    await button(page, 'Zoom in').click();
    await control(page, 'Pause').click();
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
      expect(new URL(url).searchParams.get('hash')).toBe('0');
    }
  });

  // ACC-MEDIA-72-CLOSE
  test('ACC-MEDIA-72-CLOSE closing a playing tab stops it and removes its element', async ({
    page,
    tmpPath
  }) => {
    await open(page, `${tmpPath}/${NAME}`);
    await control(page, 'Play').click();
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

    // Stock JupyterLab shows no context menu on the media viewer's content; an extension may add one, and when none opens there is nothing to check.
    await viewer(page)
      .locator('.jp-AdvancedMediaViewer-times')
      .click({ button: 'right' });
    const menu = page.locator('.lm-Menu');
    const opened = await menu
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      const onContent = await labels();
      expect(onContent.length).toBeGreaterThan(0);
      expect(repeated(onContent)).toEqual([]);
    }
  });

  // DEF-MEDIA-18-SAVE-EMPTIES
  test('DEF-MEDIA-18-SAVE-EMPTIES Ctrl+S after a rename keeps the audio file and its waveform', async ({
    page,
    request,
    tmpPath
  }) => {
    const file = `${tmpPath}/${NAME}`;
    await open(page, file);
    const decoded = () =>
      page.evaluate(
        () =>
          !!(
            window as any
          ).jupyterapp.shell.currentWidget?.content?.wavesurfer?.getDecodedData()
      );
    expect(await decoded()).toBe(true);

    // A rename makes the document model writable again.
    const renamed = `${tmpPath}/renamed.wav`;
    expect(await page.contents.renameFile(file, renamed)).toBe(true);
    await expect(currentTab(page)).toHaveText('renamed.wav');

    // Ctrl+S is refused through the notification system, shows no error dialog
    // and writes nothing. The notification stays in the bell's list, so its
    // count is the evidence of the refusal.
    const bell = () =>
      page.locator('.jp-Notification-Status').innerText().then(Number);
    const before = await bell();
    await viewer(page).focus();
    await page.keyboard.press('Control+s');
    await expect.poll(bell, { timeout: 5000 }).toBe(before + 1);
    // DEF-MEDIA-33-SAVE-TOAST: the refusal also shows as a toast; the newest
    // toast is the first in the DOM.
    await expect(
      page
        .locator('.Toastify__toast-container .jp-Notification-Toast-warning')
        .filter({
          hasText: 'This viewer does not save files, so the file is unchanged.'
        })
        .first()
    ).toBeVisible();
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    const saved = await page.evaluate(async (path: string) => {
      const model = await (
        window as any
      ).jupyterapp.serviceManager.contents.get(path, { content: true });
      return model.content as string;
    }, renamed);
    // The server wraps its base64 at 76 characters; the bytes are the same.
    expect(saved.replace(/\s+/g, '')).toBe(TONE.toString('base64'));
    expect(await decoded()).toBe(true);

    // Delete the file behind the context's back, so the context still holds
    // the writable model from the rename. Its save path then finds a 404 and
    // writes the empty document model through the default contents provider;
    // Ctrl+S must leave the file absent.
    expect((await request.delete(`/api/contents/${renamed}`)).status()).toBe(
      204
    );
    const beforeDeleted = await bell();
    await page.keyboard.press('Control+s');
    await expect.poll(bell, { timeout: 5000 }).toBe(beforeDeleted + 1);
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    expect((await request.get(`/api/contents/${renamed}`)).status()).toBe(404);
  });
});
