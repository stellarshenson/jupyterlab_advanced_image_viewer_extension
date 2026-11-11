// The toolbar icons chosen from the mockup page. A path with class="f" in a
// candidate is a filled shape here, so it becomes fill="currentColor" and
// keeps its opacity.

import { LabIcon } from '@jupyterlab/ui-components';

const wrapper = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const CUBE =
  '<path d="M3 5l5-2.5L13 5v6l-5 2.5L3 11z"/><path d="M3 5l5 2.5L13 5M8 7.5V13.5"/>';

const MAG = '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13.5 13.5"/>';

// Zoom out: B zoom_out.
export const zoomOutIcon = new LabIcon({
  name: 'advanced-image-viewer:zoom-out',
  svgstr: wrapper(MAG + '<path d="M5 7h4"/>')
});

// Zoom in: B zoom_in.
export const zoomInIcon = new LabIcon({
  name: 'advanced-image-viewer:zoom-in',
  svgstr: wrapper(MAG + '<path d="M5 7h4M7 5v4"/>')
});

// Fit: A frame corners.
export const fitIcon = new LabIcon({
  name: 'advanced-image-viewer:fit',
  svgstr: wrapper(
    '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>'
  )
});

// Shading: C gradient (Material Symbols).
export const shadingIcon = new LabIcon({
  name: 'advanced-image-viewer:shading',
  svgstr: wrapper(
    '<rect x="2.5" y="2.5" width="11" height="11"/><path fill="currentColor" stroke="none" d="M2.5 13.5v-11l11 11z" opacity=".45"/>'
  )
});

// Wireframe: D wire globe.
export const wireframeIcon = new LabIcon({
  name: 'advanced-image-viewer:wireframe',
  svgstr: wrapper(
    '<circle cx="8" cy="8" r="5"/><path d="M3 8h10M8 3c2.5 2.7 2.5 7.3 0 10M8 3c-2.5 2.7-2.5 7.3 0 10"/>'
  )
});

// Grid: A grid_on.
export const gridIcon = new LabIcon({
  name: 'advanced-image-viewer:grid',
  svgstr: wrapper('<path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12"/>')
});

// Orthographic: A view_in_ar.
export const orthographicIcon = new LabIcon({
  name: 'advanced-image-viewer:orthographic',
  svgstr: wrapper(
    CUBE +
      '<path fill="currentColor" stroke="none" d="M8 7.5L13 5v6l-5 2.5z" opacity=".22"/>'
  )
});

// Views: E axis triad.
export const viewsIcon = new LabIcon({
  name: 'advanced-image-viewer:views',
  svgstr: wrapper(
    '<path d="M3 13V3M3 13h10M3 13l4-4"/><path d="M3 3L1.5 4.5M3 3l1.5 1.5M13 13l-1.5-1.5M13 13l-1.5 1.5"/>'
  )
});

// Lighting: B lightbulb.
export const lightingIcon = new LabIcon({
  name: 'advanced-image-viewer:lighting',
  svgstr: wrapper(
    '<path d="M6.2 13.5h3.6M6.8 15h2.4M8 1.8a4.2 4.2 0 0 0-2.6 7.5c.5.4.6 1 .6 1.7h4c0-.7.1-1.3.6-1.7A4.2 4.2 0 0 0 8 1.8z"/>'
  )
});

// Help: A question mark.
export const helpIcon = new LabIcon({
  name: 'advanced-image-viewer:help',
  svgstr: wrapper(
    '<path d="M6 5.5a2 2 0 1 1 3.2 1.6c-.7.5-1.2 1-1.2 2M8 12.2v.4"/>'
  )
});
