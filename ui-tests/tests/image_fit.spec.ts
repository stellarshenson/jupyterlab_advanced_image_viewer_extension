import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';

// The image fit rule this extension took over from
// jupyterlab_fit_image_size_extension 1.0.9 (style/fit.css). The test server
// disables that extension in its own page config, so these tests measure this
// extension's rule alone, as in CI where that extension is not installed.
const FIT_EXTENSION = '@stellarshenson/jupyterlab-fit-image-size-extension';

// A solid PNG of the given size, base64, drawn by the browser.
const png = (page: IJupyterLabPageFixture, w: number, h: number) =>
  page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.fillStyle = '#3366cc';
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    [w, h]
  );

// An SVG with intrinsic width and height, so its natural size is w x h.
const svg = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
  `viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#3366cc"/></svg>`;

type Rect = { width: number; height: number; content: number };

// Width within 2px of the container's content width, aspect within 1%.
const expectFitted = (r: Rect, aspect: number) => {
  expect(r.content).toBeLessThan(3000);
  expect(Math.abs(r.width - r.content)).toBeLessThanOrEqual(2);
  expect(Math.abs(r.width / r.height / aspect - 1)).toBeLessThanOrEqual(0.01);
};

const expectNatural = (
  r: { width: number; height: number },
  w: number,
  h: number
) => {
  expect(Math.abs(r.width - w)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.height - h)).toBeLessThanOrEqual(1);
};

const output = (data: Record<string, string>, metadata = {}) => ({
  output_type: 'display_data',
  data,
  metadata
});

// Write a notebook of the given cells, open it, trust it (an SVG output renders
// only in a trusted notebook) and wait for its `count` images to load.
const openNotebook = async (
  page: IJupyterLabPageFixture,
  tmpPath: string,
  cells: Record<string, unknown>[],
  count: number
) => {
  const notebook = {
    cells: cells.map(cell => ({ metadata: {}, ...cell })),
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3' }
    },
    nbformat: 4,
    nbformat_minor: 5
  };
  await page.contents.uploadContent(
    JSON.stringify(notebook),
    'text',
    `${tmpPath}/fit.ipynb`
  );
  await page.notebook.openByPath(`${tmpPath}/fit.ipynb`);
  await page.notebook.activate('fit.ipynb');
  await page.notebook.trust();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Array.from(
            document.querySelectorAll<HTMLImageElement>('.jp-Notebook img')
          ).filter(i => i.complete && i.naturalWidth > 0).length
      )
    )
    .toBe(count);
};

// The rendered size of every notebook image inside `container`, with the
// content width of that container.
const measure = (page: IJupyterLabPageFixture, container: string) =>
  page.evaluate(
    sel =>
      Array.from(
        document.querySelectorAll<HTMLImageElement>(`.jp-Notebook ${sel} img`)
      ).map(img => {
        const box = img.closest(sel) as HTMLElement;
        const cs = getComputedStyle(box);
        const r = img.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          content:
            box.clientWidth -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight)
        };
      }),
    container
  );

test.describe('Image fit', () => {
  // The isolation the other tests rely on: the fit extension is off (or not
  // installed) and exactly one `.jp-ImageViewer img` contain rule is loaded,
  // the one in this extension's style/fit.css.
  test('the fit rule comes from this extension alone', async ({ page }) => {
    const state = await page.evaluate(name => {
      const config = JSON.parse(
        (document.getElementById('jupyter-config-data') as HTMLElement)
          .textContent as string
      );
      const installed = config.federated_extensions.some(
        (e: { name: string }) => e.name === name
      );
      let rules = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        let list: CSSRuleList;
        try {
          list = sheet.cssRules;
        } catch {
          continue; // a cross-origin sheet hides its rules
        }
        for (const rule of Array.from(list)) {
          if (
            rule instanceof CSSStyleRule &&
            rule.selectorText === '.jp-ImageViewer img' &&
            rule.style.objectFit === 'contain'
          ) {
            rules++;
          }
        }
      }
      return {
        off: !installed || config.disabledExtensions.includes(name),
        rules
      };
    }, FIT_EXTENSION);
    expect(state).toEqual({ off: true, rules: 1 });
  });

  // ACC-FIT-125: an image larger than the viewer opens whole, at its aspect,
  // flush to the host on one axis; a smaller one keeps its natural size.
  test('the image viewer fits an image larger than the panel', async ({
    page,
    tmpPath
  }) => {
    const files: [string, string, 'base64' | 'text', number][] = [
      ['fit-wide.png', await png(page, 3000, 300), 'base64', 10],
      ['fit-tall.png', await png(page, 300, 3000), 'base64', 0.1],
      ['fit-wide.svg', svg(3000, 300), 'text', 10]
    ];
    for (const [name, content, format] of files) {
      await page.contents.uploadContent(content, format, `${tmpPath}/${name}`);
    }
    await page.contents.uploadContent(
      await png(page, 200, 150),
      'base64',
      `${tmpPath}/fit-small.png`
    );

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
      return viewer.evaluate((host: HTMLElement) => {
        const h = host.getBoundingClientRect();
        const i = (
          host.querySelector('img') as HTMLElement
        ).getBoundingClientRect();
        return { host: h.toJSON(), img: i.toJSON() };
      });
    };

    for (const [name, , , aspect] of files) {
      const { host, img } = await opened(name);
      expect(img.left, name).toBeGreaterThanOrEqual(host.left - 2);
      expect(img.top, name).toBeGreaterThanOrEqual(host.top - 2);
      expect(img.right, name).toBeLessThanOrEqual(host.right + 2);
      expect(img.bottom, name).toBeLessThanOrEqual(host.bottom + 2);
      const flush =
        Math.abs(img.width - host.width) <= 2 ||
        Math.abs(img.height - host.height) <= 2;
      expect(flush, name).toBe(true);
      expect(
        Math.abs(img.width / img.height / aspect - 1),
        name
      ).toBeLessThanOrEqual(0.01);
    }

    const small = await opened('fit-small.png');
    expectNatural(small.img, 200, 150);
  });

  // ACC-FIT-126: a PNG output wider than the output shrinks to its width, a
  // narrower one keeps its size. The third image is marked unconfined, which
  // stock JupyterLab leaves at natural size; the migrated rule fits it too.
  test('a notebook PNG output fits the output width', async ({
    page,
    tmpPath
  }) => {
    const large = await png(page, 3000, 300);
    await openNotebook(
      page,
      tmpPath,
      [
        {
          cell_type: 'code',
          execution_count: null,
          source: '',
          outputs: [
            output({ 'image/png': large }),
            output({ 'image/png': await png(page, 200, 150) }),
            output(
              { 'image/png': large },
              { 'image/png': { unconfined: true } }
            )
          ]
        }
      ],
      3
    );
    const [wide, small, unconfined] = await measure(
      page,
      '.jp-OutputArea-output'
    );
    expectFitted(wide, 10);
    expectNatural(small, 200, 150);
    expectFitted(unconfined, 10);
  });

  // ACC-FIT-127: an SVG output renders as an <img> in .jp-RenderedSVG, which
  // no stock rule fits.
  test('a notebook SVG output fits the output width', async ({
    page,
    tmpPath
  }) => {
    await openNotebook(
      page,
      tmpPath,
      [
        {
          cell_type: 'code',
          execution_count: null,
          source: '',
          outputs: [
            output({ 'image/svg+xml': svg(3000, 300) }),
            output({ 'image/svg+xml': svg(200, 150) })
          ]
        }
      ],
      2
    );
    const [wide, small] = await measure(page, '.jp-OutputArea-output');
    expectFitted(wide, 10);
    expectNatural(small, 200, 150);
  });

  // ACC-FIT-128
  test('a markdown cell image fits the cell width', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      await png(page, 3000, 300),
      'base64',
      `${tmpPath}/fit-large.png`
    );
    await page.contents.uploadContent(
      await png(page, 200, 150),
      'base64',
      `${tmpPath}/fit-small.png`
    );
    await openNotebook(
      page,
      tmpPath,
      [
        {
          cell_type: 'markdown',
          source: '![large](fit-large.png)\n\n![small](fit-small.png)'
        }
      ],
      2
    );
    const [wide, small] = await measure(page, '.jp-RenderedMarkdown');
    expectFitted(wide, 10);
    expectNatural(small, 200, 150);
  });

  // ACC-FIT-129
  test('an HTML output image fits the output width', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      await png(page, 3000, 300),
      'base64',
      `${tmpPath}/fit-large.png`
    );
    await page.contents.uploadContent(
      await png(page, 200, 150),
      'base64',
      `${tmpPath}/fit-small.png`
    );
    await openNotebook(
      page,
      tmpPath,
      [
        {
          cell_type: 'code',
          execution_count: null,
          source: '',
          outputs: [
            output({
              'text/html': '<img src="fit-large.png"><img src="fit-small.png">'
            })
          ]
        }
      ],
      2
    );
    const [wide, small] = await measure(page, '.jp-OutputArea-output');
    expectFitted(wide, 10);
    expectNatural(small, 200, 150);
  });
});
