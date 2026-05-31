import { ViewerController } from '../controller';

// jsdom has no ResizeObserver; provide a no-op stub.
class MockResizeObserver {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

describe('ViewerController', () => {
  let host: HTMLElement;
  let img: HTMLImageElement;

  beforeAll(() => {
    (window as any).ResizeObserver = MockResizeObserver;
  });

  beforeEach(() => {
    host = document.createElement('div');
    img = document.createElement('img');
    host.appendChild(img);
    document.body.appendChild(host);
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
});
