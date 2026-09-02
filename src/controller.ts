// ViewerController adds zoom + pan ON TOP of JupyterLab's stock image viewer.
// The stock viewer OWNS the <img> transform - it writes rotate / flip / its own
// scale there for its keybindings (], [, h, v, 0). If we also wrote the <img>
// transform we would clobber that (and it would clobber ours). Instead we wrap
// the <img> in a pan layer and apply our translate+scale to the LAYER; the two
// transforms then compose. Stock JupyterLab ships only two rules here,
// .jp-ImageViewer { overflow: auto } and .jp-ImageViewer > img { box-sizing:
// border-box; transform-origin: top left }. The contain fit comes from the
// separately installed jupyterlab_fit_image_size_extension, whose
// .jp-ImageViewer img rule is a descendant selector and so still matches
// through the pan layer. With that fit in place the identity layer transform
// equals the fitted view, and stock rotate/flip keeps working.

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;

// Per-axis pan correction, in rendered pixels. An image not larger than the
// host must stay inside it, so an edge that hangs over a border is pushed
// back; an image larger than the host must keep covering it, so a gap between
// an image edge and a border is closed. Differences below half a pixel are
// dropped: rects are fractional and the baseline transform must stay exactly
// translate(0px, 0px) scale(1).
function correction(
  lo: number,
  hi: number,
  hostLo: number,
  hostHi: number
): number {
  let d = 0;
  if (hi - lo <= hostHi - hostLo) {
    if (lo < hostLo) {
      d = hostLo - lo;
    } else if (hi > hostHi) {
      d = hostHi - hi;
    }
  } else {
    if (lo > hostLo) {
      d = hostLo - lo;
    } else if (hi < hostHi) {
      d = hostHi - hi;
    }
  }
  return Math.abs(d) < 0.5 ? 0 : d;
}

export class ViewerController {
  private host: HTMLElement;
  private img: HTMLImageElement;
  private layer: HTMLElement;
  private sizeObserver: ResizeObserver;
  private styleObserver: MutationObserver;
  private s = 1;
  private tx = 0;
  private ty = 0;
  private panning = false;
  private start = { x: 0, y: 0, tx: 0, ty: 0 };
  private zoomStep: number;
  private disposed = false;

  constructor(host: HTMLElement, img: HTMLImageElement, zoomStep: number) {
    this.host = host;
    this.img = img;
    this.zoomStep = zoomStep;
    this.host.style.overflow = 'hidden';
    // Wrap the image so our zoom/pan compose with the stock rotate/flip
    // transform that the viewer writes onto the <img> element itself. The
    // layer fills the host (which is a positioned widget), so the fit CSS
    // sizes the image exactly as before.
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
    // Three things move the rendered image without any pan or zoom of ours,
    // and each one changes the range the clamp allows: the panel is resized,
    // the refresh button re-renders a different source into the same <img>,
    // and the stock viewer writes a rotate or flip onto img.style. Only an
    // attribute change reports the last one, since it moves no layout box.
    this.img.addEventListener('load', this.onRenderChange);
    this.styleObserver = new MutationObserver(this.onRenderChange);
    this.styleObserver.observe(this.img, {
      attributes: true,
      attributeFilter: ['style']
    });
    this.sizeObserver = new ResizeObserver(this.onRenderChange);
    this.sizeObserver.observe(this.host);
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

  private onRenderChange = (): void => {
    this.apply();
  };

  private write(): void {
    this.layer.style.transformOrigin = 'center center';
    this.layer.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
  }

  // The pan clamp is measured, not derived. The layer scales about its centre
  // and the stock viewer writes its own rotate / flip onto the <img>, so the
  // rendered bounds do not follow any offset formula over the natural size.
  // Write the transform, read both boxes, then move the layer by the one
  // correction the measurement asks for. A translate shifts the box 1:1 in
  // host pixels and does not resize it, so a single pass lands on the edge.
  // Doing this in apply() makes the clamp an invariant of every state change:
  // drag, zoom in, zoom out and reset. Zero-sized boxes are skipped, because
  // the widget is hidden or the image has no source yet and any correction
  // measured against them would pin a false offset.
  private apply(): void {
    this.write();
    const h = this.host.getBoundingClientRect();
    const i = this.img.getBoundingClientRect();
    if (h.width > 0 && h.height > 0 && i.width > 0 && i.height > 0) {
      const dx = correction(i.left, i.right, h.left, h.right);
      const dy = correction(i.top, i.bottom, h.top, h.bottom);
      if (dx !== 0 || dy !== 0) {
        this.tx += dx;
        this.ty += dy;
        this.write();
      }
    }
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
    this.img.removeEventListener('load', this.onRenderChange);
    this.styleObserver.disconnect();
    this.sizeObserver.disconnect();
    // Unwrap: restore the <img> as a direct child and drop the layer.
    const img = this.layer.querySelector('img');
    const parent = this.layer.parentNode;
    if (img && parent) {
      parent.insertBefore(img, this.layer);
    }
    this.layer.remove();
  }
}
