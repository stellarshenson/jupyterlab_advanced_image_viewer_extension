// ViewerController owns scale + translate for ONE ImageViewer widget.
// It layers a CSS transform 'translate(tx,ty) scale(s)' on the default
// viewer's inner <img> (transform-origin top left), keeping a fit-to-screen
// baseline that 'reset' returns to. The host node is forced to
// overflow:hidden so panning is purely our translate, never native scroll.

export class ViewerController {
  private host: HTMLElement;
  private img: HTMLImageElement;
  private nw = 0;
  private nh = 0;
  private fitScale = 1;
  private tx0 = 0;
  private ty0 = 0;
  private s = 1;
  private tx = 0;
  private ty = 0;
  private wasModified = false;
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
    this.img.style.transformOrigin = 'top left';
    this.host.addEventListener('wheel', this.onWheel, { passive: false });
    this.host.addEventListener('mousedown', this.onDown);
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(this.host);
    if (this.img.complete && this.img.naturalWidth) {
      this.onImageReady();
    } else {
      this.img.addEventListener('load', this.onImageReady, { once: true });
    }
  }

  setZoomStep(zoomStep: number): void {
    this.zoomStep = zoomStep;
  }

  private onImageReady = (): void => {
    this.nw = this.img.naturalWidth;
    this.nh = this.img.naturalHeight;
    this.reset();
  };

  private viewport(): { vw: number; vh: number } {
    return { vw: this.host.clientWidth, vh: this.host.clientHeight };
  }

  private computeFit(): void {
    const { vw, vh } = this.viewport();
    this.fitScale = Math.min(vw / this.nw, vh / this.nh);
    this.tx0 = (vw - this.fitScale * this.nw) / 2;
    this.ty0 = (vh - this.fitScale * this.nh) / 2;
  }

  reset(): void {
    if (!this.nw) {
      return;
    }
    this.computeFit();
    this.s = this.fitScale;
    this.tx = this.tx0;
    this.ty = this.ty0;
    this.wasModified = false;
    this.apply();
  }

  private minScale(): number {
    return this.fitScale;
  }

  private maxScale(): number {
    return Math.max(8 * this.fitScale, 4);
  }

  private clampScale(v: number): number {
    return Math.min(Math.max(v, this.minScale()), this.maxScale());
  }

  private zoomAt(factor: number, ax: number, ay: number): void {
    if (!this.nw) {
      return;
    }
    const sNew = this.clampScale(this.s * factor);
    if (sNew === this.s) {
      return;
    }
    this.tx = ax - (sNew / this.s) * (ax - this.tx);
    this.ty = ay - (sNew / this.s) * (ay - this.ty);
    this.s = sNew;
    this.wasModified = true;
    this.clampPan();
    this.apply();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.host.getBoundingClientRect();
    const ax = e.clientX - r.left;
    const ay = e.clientY - r.top;
    const factor =
      e.deltaY < 0 ? 1 + this.zoomStep : 1 / (1 + this.zoomStep);
    this.zoomAt(factor, ax, ay);
  };

  zoomIn(): void {
    const { vw, vh } = this.viewport();
    this.zoomAt(1 + this.zoomStep, vw / 2, vh / 2);
  }

  zoomOut(): void {
    const { vw, vh } = this.viewport();
    this.zoomAt(1 / (1 + this.zoomStep), vw / 2, vh / 2);
  }

  private overflow(): { x: boolean; y: boolean } {
    const { vw, vh } = this.viewport();
    return { x: this.s * this.nw > vw + 0.5, y: this.s * this.nh > vh + 0.5 };
  }

  private canPan(): boolean {
    const o = this.overflow();
    return o.x || o.y;
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
    const o = this.overflow();
    this.tx = this.start.tx + (o.x ? e.clientX - this.start.x : 0);
    this.ty = this.start.ty + (o.y ? e.clientY - this.start.y : 0);
    this.wasModified = true;
    this.clampPan();
    this.apply();
  };

  private onUp = (): void => {
    this.panning = false;
    this.updateCursor();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  };

  private clampPan(): void {
    const { vw, vh } = this.viewport();
    const cw = this.s * this.nw;
    const ch = this.s * this.nh;
    this.tx = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, this.tx));
    this.ty = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, this.ty));
  }

  private onResize(): void {
    if (!this.nw) {
      return;
    }
    if (!this.wasModified) {
      this.reset();
    } else {
      this.computeFit();
      this.clampPan();
      this.apply();
    }
  }

  private updateCursor(): void {
    this.host.style.cursor = this.canPan() ? 'grab' : 'default';
  }

  private apply(): void {
    this.img.style.transformOrigin = 'top left';
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
    this.img.removeEventListener('load', this.onImageReady);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }
}
