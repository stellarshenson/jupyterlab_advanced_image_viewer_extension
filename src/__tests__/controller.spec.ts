import { ViewerController } from '../controller';

// jsdom has no ResizeObserver; provide a no-op stub.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: () => void;
  disconnected = false;
  targets: Element[] = [];

  constructor(callback: () => void) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe(t: Element): void {
    this.targets.push(t);
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

const HOST_X = 50;
const HOST_Y = 30;
const HOST_W = 200;
const HOST_H = 100;

function rect(left: number, top: number, w: number, h: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + w,
    bottom: top + h,
    width: w,
    height: h,
    toJSON: () => ({})
  } as DOMRect;
}

describe('ViewerController', () => {
  let host: HTMLElement;
  let img: HTMLImageElement;
  let baseW = 0;
  let baseH = 0;

  // jsdom runs no layout, so model the geometry the clamp measures: the host
  // is a fixed box at (HOST_X, HOST_Y), away from the viewport origin, and the
  // image is a baseW x baseH box at the layer top-left, moved by the layer
  // transform the controller writes (translate in host pixels, scale about the
  // layer centre). Call it again to change the rendered size, as a reload or a
  // stock rotate does.
  function stubGeometry(w: number, h: number): void {
    baseW = w;
    baseH = h;
    host.getBoundingClientRect = () => rect(HOST_X, HOST_Y, HOST_W, HOST_H);
    img.getBoundingClientRect = () => {
      const layer = host.querySelector(
        '.jp-AdvancedImageViewer-panlayer'
      ) as HTMLElement;
      const m =
        /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
          layer.style.transform
        )!;
      const s = parseFloat(m[3]);
      return rect(
        HOST_X + (1 - s) * (HOST_W / 2) + parseFloat(m[1]),
        HOST_Y + (1 - s) * (HOST_H / 2) + parseFloat(m[2]),
        baseW * s,
        baseH * s
      );
    };
  }

  function drag(dx: number, dy: number): void {
    host.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientX: dx, clientY: dy })
    );
    window.dispatchEvent(new MouseEvent('mouseup'));
  }

  function offset(): { tx: number; ty: number } {
    const layer = host.querySelector(
      '.jp-AdvancedImageViewer-panlayer'
    ) as HTMLElement;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
      layer.style.transform
    )!;
    return { tx: parseFloat(m[1]), ty: parseFloat(m[2]) };
  }

  beforeAll(() => {
    (window as any).ResizeObserver = MockResizeObserver;
  });

  beforeEach(() => {
    host = document.createElement('div');
    img = document.createElement('img');
    host.appendChild(img);
    document.body.appendChild(host);
    MockResizeObserver.instances = [];
  });

  afterEach(() => {
    host.remove();
  });

  it('wraps the image in a pan layer so the stock viewer keeps the img transform', () => {
    const c = new ViewerController(host, img, 0.1);
    const layer = host.querySelector('.jp-AdvancedImageViewer-panlayer');
    expect(layer).not.toBeNull();
    expect(img.parentElement).toBe(layer);
    c.dispose();
  });

  it('applies the transform to the layer, never to the image', () => {
    const c = new ViewerController(host, img, 0.1);
    const layer = host.querySelector(
      '.jp-AdvancedImageViewer-panlayer'
    ) as HTMLElement;
    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(img.style.transform).toBe('');
    c.dispose();
  });

  it('zooms the layer in, allows zoom-out below fit, and resets to identity', () => {
    const c = new ViewerController(host, img, 0.1);
    const layer = host.querySelector(
      '.jp-AdvancedImageViewer-panlayer'
    ) as HTMLElement;
    c.zoomIn();
    expect(layer.style.transform).toContain('scale(1.1)');
    c.reset();
    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)');
    c.zoomOut();
    const scale = parseFloat(
      /scale\(([0-9.]+)\)/.exec(layer.style.transform)![1]
    );
    expect(scale).toBeLessThan(1);
    c.dispose();
  });

  it('never writes the image transform even after zooming (no clobber of rotate/flip)', () => {
    const c = new ViewerController(host, img, 0.1);
    c.zoomIn();
    c.zoomIn();
    expect(img.style.transform).toBe('');
    c.dispose();
  });

  it('unwraps the image on dispose', () => {
    const c = new ViewerController(host, img, 0.1);
    c.dispose();
    expect(host.querySelector('.jp-AdvancedImageViewer-panlayer')).toBeNull();
    expect(img.parentElement).toBe(host);
  });

  // ACC-PAN-38: an image smaller than the host stops with its edge flush.
  it('keeps an image smaller than the host inside the viewport', () => {
    stubGeometry(80, 60);
    const c = new ViewerController(host, img, 0.1);
    expect(offset()).toEqual({ tx: 0, ty: 0 });

    // Both drags stay inside the legal range (x in [0, 120], y in [0, 40]),
    // so the offset follows the drag delta with the clamp active.
    drag(10, 10);
    drag(10, 10);
    expect(offset()).toEqual({ tx: 20, ty: 20 });

    drag(500, 0);
    expect(offset().tx).toBe(120);
    expect(img.getBoundingClientRect().right).toBe(HOST_X + HOST_W);
    expect(img.getBoundingClientRect().left).toBeGreaterThanOrEqual(HOST_X);

    drag(-500, -500);
    expect(offset()).toEqual({ tx: 0, ty: 0 });
    expect(img.getBoundingClientRect().left).toBe(HOST_X);
    expect(img.getBoundingClientRect().top).toBe(HOST_Y);
    c.dispose();
  });

  // ACC-PAN-39: an image larger than the host never uncovers it.
  it('keeps an image larger than the host covering the viewport', () => {
    stubGeometry(400, 300);
    const c = new ViewerController(host, img, 0.1);
    expect(offset()).toEqual({ tx: 0, ty: 0 });

    drag(-500, 0);
    expect(offset().tx).toBe(-200);
    expect(img.getBoundingClientRect().right).toBe(HOST_X + HOST_W);
    expect(img.getBoundingClientRect().left).toBeLessThanOrEqual(HOST_X);

    drag(500, 0);
    expect(offset().tx).toBe(0);
    expect(img.getBoundingClientRect().left).toBe(HOST_X);

    drag(0, -500);
    expect(offset().ty).toBe(-200);
    expect(img.getBoundingClientRect().bottom).toBe(HOST_Y + HOST_H);
    c.dispose();
  });

  // ACC-PAN-40: the clamp is an invariant, so shrinking the legal range by
  // zooming out pulls an offset that was legal at the larger scale back in.
  it('snaps an out-of-range offset back on zoom-out', () => {
    stubGeometry(400, 300);
    const c = new ViewerController(host, img, 1);
    c.zoomIn();
    drag(-1000, 0);
    expect(offset().tx).toBe(-500);

    c.zoomOut();
    // Undoing the zoom alone would leave tx at -250, which is outside the
    // range [-200, 0] that a 400px-wide image has over a 200px host.
    expect(offset().tx).toBe(-200);
    expect(img.getBoundingClientRect().right).toBe(HOST_X + HOST_W);
    c.dispose();
  });

  // ACC-PAN-41: the panel resize changes the range, the ResizeObserver reports
  // it and the stored offset is measured against the new one.
  it('re-clamps when the host is resized', () => {
    stubGeometry(80, 60);
    const c = new ViewerController(host, img, 0.1);
    drag(500, 0);
    expect(offset().tx).toBe(120);

    host.getBoundingClientRect = () => rect(HOST_X, HOST_Y, 100, HOST_H);
    expect(MockResizeObserver.instances[0].targets).toContain(host);
    MockResizeObserver.instances[0].callback();
    expect(offset().tx).toBe(20);
    expect(img.getBoundingClientRect().right).toBe(HOST_X + 100);
    c.dispose();
  });

  // ACC-PAN-42: a refresh renders a differently sized source into the same
  // <img>, and the load event re-clamps the stored offset against it.
  it('re-clamps when a differently sized image loads', () => {
    stubGeometry(80, 60);
    const c = new ViewerController(host, img, 0.1);
    drag(500, 0);
    expect(offset().tx).toBe(120);

    stubGeometry(150, 60);
    img.dispatchEvent(new Event('load'));
    expect(offset().tx).toBe(50);
    expect(img.getBoundingClientRect().right).toBe(HOST_X + HOST_W);
    c.dispose();
  });

  // ACC-PAN-43: a stock rotate or flip changes the rendered bounds through
  // img.style alone, so the clamp is recomputed from the measured box.
  it('re-clamps on a stock rotate written to the image style', async () => {
    stubGeometry(80, 60);
    const c = new ViewerController(host, img, 0.1);
    drag(500, 0);
    expect(offset().tx).toBe(120);

    stubGeometry(160, 60);
    img.style.transform = 'rotate(90deg)';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(offset().tx).toBe(40);
    expect(img.getBoundingClientRect().right).toBe(HOST_X + HOST_W);
    c.dispose();
  });

  // A hidden widget and an image with no source yet both measure zero, and a
  // correction taken against them would pin a false offset.
  it('does not clamp against zero-sized boxes', () => {
    host.getBoundingClientRect = () => rect(50, 30, HOST_W, HOST_H);
    img.getBoundingClientRect = () => rect(0, 0, 0, 0);
    const c = new ViewerController(host, img, 0.1);
    const layer = host.querySelector(
      '.jp-AdvancedImageViewer-panlayer'
    ) as HTMLElement;
    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)');

    drag(40, 20);
    expect(layer.style.transform).toBe('translate(40px, 20px) scale(1)');
    c.dispose();
  });

  // A rendered box overhanging a border by less than half a pixel is inside
  // the deadband, so the baseline transform stays exactly at the identity.
  it('leaves a sub-pixel overhang uncorrected', () => {
    host.getBoundingClientRect = () => rect(HOST_X, HOST_Y, HOST_W, HOST_H);
    img.getBoundingClientRect = () => rect(HOST_X - 0.4, HOST_Y, 80, 60);
    const c = new ViewerController(host, img, 0.1);
    const layer = host.querySelector(
      '.jp-AdvancedImageViewer-panlayer'
    ) as HTMLElement;
    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)');
    c.dispose();
  });

  it('stops observing the host and the image on dispose', () => {
    stubGeometry(80, 60);
    const c = new ViewerController(host, img, 0.1);
    c.dispose();
    expect(MockResizeObserver.instances[0].disconnected).toBe(true);
    // The geometry stub needs the layer, which dispose removed, so a surviving
    // load listener would throw here.
    expect(() => img.dispatchEvent(new Event('load'))).not.toThrow();
  });
});
