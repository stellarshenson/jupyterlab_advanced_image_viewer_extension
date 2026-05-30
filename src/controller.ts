// ViewerController adds zoom + pan ON TOP of JupyterLab's stock image viewer.
// The stock viewer already fits the image with CSS (object-fit: contain,
// max-width/height: 100%), so the identity transform IS the correct
// fit-to-screen view for both raster and SVG. We never read naturalWidth /
// naturalHeight (an SVG with only a viewBox reports a bogus intrinsic size).
// Zoom is a single relative factor s (s = 1 is fit); pan is a translate.
// transform-origin is the host centre, matching the centred object-fit layout.

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

export class ViewerController {
  private host: HTMLElement;
  private img: HTMLImageElement;
  private s = 1;
  private tx = 0;
  private ty = 0;
  private panning = false;
  private start = { x: 0, y: 0, tx: 0, ty: 0 };
  private zoomStep: number;
  private ro: ResizeObserver;
  private disposed = false;

  constructor(host: HTMLElement, img: HTMLImageElement, zoomStep: number) {
    this.host = host;
    this.img = img;
    this.zoomStep = zoomStep;
    this.host.style.overflow = 'hidden';
    this.img.style.transformOrigin = 'center center';
    this.host.addEventListener('wheel', this.onWheel, { passive: false });
    this.host.addEventListener('mousedown', this.onDown);
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(this.host);
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
    this.clampPan();
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

  private canPan(): boolean {
    return this.s > 1;
  }

  // Bound the translate to the overflow implied by the zoom so the image
  // cannot be panned out of view. Range collapses to 0 as s approaches 1.
  private clampPan(): void {
    const { vw, vh } = this.viewport();
    const mx = (Math.max(this.s, 1) - 1) * vw * 0.5;
    const my = (Math.max(this.s, 1) - 1) * vh * 0.5;
    this.tx = Math.min(mx, Math.max(-mx, this.tx));
    this.ty = Math.min(my, Math.max(-my, this.ty));
  }

  private onDown = (e: MouseEvent): void => {
    if (!this.canPan()) {
      return;
    }
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
    this.clampPan();
    this.apply();
  };

  private onUp = (): void => {
    this.panning = false;
    this.updateCursor();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  };

  private onResize(): void {
    this.clampPan();
    this.apply();
  }

  private updateCursor(): void {
    this.host.style.cursor = this.canPan() ? 'grab' : 'default';
  }

  private apply(): void {
    this.img.style.transformOrigin = 'center center';
    this.img.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    this.updateCursor();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.ro.disconnect();
    this.host.removeEventListener('wheel', this.onWheel);
    this.host.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }
}
