// ViewerController adds zoom + pan ON TOP of JupyterLab's stock image viewer.
// The stock viewer OWNS the <img> transform - it writes rotate / flip / its own
// scale there for its keybindings (], [, h, v, 0). If we also wrote the <img>
// transform we would clobber that (and it would clobber ours). Instead we wrap
// the <img> in a pan layer and apply our translate+scale to the LAYER; the two
// transforms then compose. The stock CSS (object-fit: contain, max-width/height:
// 100%) still fits the image inside the layer, so the identity layer transform
// equals the correct fit-to-screen view, and stock rotate/flip keeps working.

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

export class ViewerController {
  private host: HTMLElement;
  private layer: HTMLElement;
  private s = 1;
  private tx = 0;
  private ty = 0;
  private panning = false;
  private start = { x: 0, y: 0, tx: 0, ty: 0 };
  private zoomStep: number;
  private disposed = false;

  constructor(host: HTMLElement, img: HTMLImageElement, zoomStep: number) {
    this.host = host;
    this.zoomStep = zoomStep;
    this.host.style.overflow = 'hidden';
    // Wrap the image so our zoom/pan compose with the stock rotate/flip
    // transform that the viewer writes onto the <img> element itself. The
    // layer fills the host (which is a positioned widget), so the stock
    // object-fit/max-width CSS fits the image exactly as before.
    const layer = document.createElement('div');
    layer.className = 'jp-AdvancedImageViewer-panlayer';
    const parent = img.parentNode;
    if (parent) {
      parent.insertBefore(layer, img);
    }
    layer.appendChild(img);
    this.layer = layer;
    this.host.addEventListener('wheel', this.onWheel, { passive: false });
    this.host.addEventListener('mousedown', this.onDown);
    this.apply();
  }

  setZoomStep(zoomStep: number): void {
    this.zoomStep = zoomStep;
  }

  reset(): void {
    this.s = 1;
    this.tx = 0;
    this.ty = 0;
    this.apply();
  }

  private viewport(): { vw: number; vh: number } {
    return { vw: this.host.clientWidth, vh: this.host.clientHeight };
  }

  private clampScale(v: number): number {
    return Math.min(Math.max(v, MIN_SCALE), MAX_SCALE);
  }

  // Cursor-anchored zoom about the host centre. With transform
  // M(p) = C + s*(p - C) + t, keeping the point under (ax, ay) fixed gives
  // t' = a - C - (s'/s) * (a - C - t).
  private zoomAt(factor: number, ax: number, ay: number): void {
    const sNew = this.clampScale(this.s * factor);
    if (sNew === this.s) {
      return;
    }
    const { vw, vh } = this.viewport();
    const cx = vw / 2;
    const cy = vh / 2;
    const k = sNew / this.s;
    this.tx = ax - cx - k * (ax - cx - this.tx);
    this.ty = ay - cy - k * (ay - cy - this.ty);
    this.s = sNew;
    this.apply();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.host.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1 + this.zoomStep : 1 / (1 + this.zoomStep);
    this.zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
  };

  zoomIn(): void {
    const { vw, vh } = this.viewport();
    this.zoomAt(1 + this.zoomStep, vw / 2, vh / 2);
  }

  zoomOut(): void {
    const { vw, vh } = this.viewport();
    this.zoomAt(1 / (1 + this.zoomStep), vw / 2, vh / 2);
  }

  private onDown = (e: MouseEvent): void => {
    e.preventDefault();
    this.panning = true;
    this.start = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
    this.host.style.cursor = 'grabbing';
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
  };

  private onMove = (e: MouseEvent): void => {
    if (!this.panning) {
      return;
    }
    this.tx = this.start.tx + (e.clientX - this.start.x);
    this.ty = this.start.ty + (e.clientY - this.start.y);
    this.apply();
  };

  private onUp = (): void => {
    this.panning = false;
    this.updateCursor();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  };

  // Pan is always available (canvas-style): show grab normally, grabbing
  // while a drag is in progress (apply() re-runs on every pan move).
  private updateCursor(): void {
    this.host.style.cursor = this.panning ? 'grabbing' : 'grab';
  }

  private apply(): void {
    this.layer.style.transformOrigin = 'center center';
    this.layer.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    this.updateCursor();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.host.removeEventListener('wheel', this.onWheel);
    this.host.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    // Unwrap: restore the <img> as a direct child and drop the layer.
    const img = this.layer.querySelector('img');
    const parent = this.layer.parentNode;
    if (img && parent) {
      parent.insertBefore(img, this.layer);
    }
    this.layer.remove();
  }
}
