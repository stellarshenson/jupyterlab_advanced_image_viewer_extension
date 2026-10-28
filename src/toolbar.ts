// Toolbar items shared by the image viewer and the media viewers, so the
// Reload button, the zoom buttons and the help link look and read the same.

import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { TranslationBundle } from '@jupyterlab/translation';

import { refreshIcon } from '@jupyterlab/ui-components';

import { Widget } from '@lumino/widgets';

export function addReloadButton(
  toolbar: Toolbar,
  tooltip: string,
  onClick: () => Promise<void>
): void {
  toolbar.addItem(
    'advanced-refresh',
    new ToolbarButton({
      icon: refreshIcon,
      tooltip,
      noFocusOnClick: true,
      onClick
    })
  );
}

export function addZoomButtons(
  toolbar: Toolbar,
  trans: TranslationBundle,
  zoomOut: () => void,
  zoomIn: () => void,
  fit: () => void
): { zoomOut: ToolbarButton; zoomIn: ToolbarButton; fit: ToolbarButton } {
  const zoomOutButton = new ToolbarButton({
    label: '-',
    tooltip: trans.__('Zoom out'),
    noFocusOnClick: true,
    onClick: zoomOut
  });
  toolbar.addItem('advanced-zoom-out', zoomOutButton);
  const zoomInButton = new ToolbarButton({
    label: '+',
    tooltip: trans.__('Zoom in'),
    noFocusOnClick: true,
    onClick: zoomIn
  });
  toolbar.addItem('advanced-zoom-in', zoomInButton);
  const fitButton = new ToolbarButton({
    label: trans.__('Fit'),
    tooltip: trans.__('Reset to fit'),
    noFocusOnClick: true,
    onClick: fit
  });
  toolbar.addItem('advanced-reset-fit', fitButton);
  return { zoomOut: zoomOutButton, zoomIn: zoomInButton, fit: fitButton };
}

// The help text link; added last, after a spacer, it sits at the right end.
export function addHelpLink(
  toolbar: Toolbar,
  trans: TranslationBundle,
  showHelp: () => void
): void {
  const helpLink = new Widget({ node: document.createElement('a') });
  const helpAnchor = helpLink.node as HTMLAnchorElement;
  helpAnchor.textContent = trans.__('help');
  helpAnchor.href = '#';
  helpAnchor.title = trans.__('Keybindings and help');
  helpAnchor.className = 'jp-AdvancedImageViewer-help-link';
  helpAnchor.addEventListener('click', event => {
    event.preventDefault();
    showHelp();
  });
  toolbar.addItem('advanced-help', helpLink);
}
