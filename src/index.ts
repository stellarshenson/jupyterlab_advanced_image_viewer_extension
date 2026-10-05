import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Dialog,
  showDialog,
  Toolbar,
  ToolbarButton
} from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { DirListing, IDefaultFileBrowser } from '@jupyterlab/filebrowser';

import { IImageTracker, ImageViewer } from '@jupyterlab/imageviewer';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { imageIcon, refreshIcon } from '@jupyterlab/ui-components';

import { IDisposable } from '@lumino/disposable';

import { Widget } from '@lumino/widgets';

// eslint-disable-next-line jupyter/prefer-lazy-imports -- activation attaches the controller to restored image tabs at once
import { ViewerController } from './controller';

const PLUGIN_ID = 'jupyterlab_advanced_image_viewer_extension:plugin';

const CommandIDs = {
  zoomIn: 'advanced-image-viewer:zoom-in',
  zoomOut: 'advanced-image-viewer:zoom-out',
  resetFit: 'advanced-image-viewer:reset-fit',
  previous: 'advanced-image-viewer:previous-image',
  next: 'advanced-image-viewer:next-image',
  copyClipboard: 'advanced-image-viewer:copy-to-clipboard'
};

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.svg',
  '.webp',
  '.avif'
]);

// Raster formats that can be drawn to a canvas and copied as PNG. SVG is
// excluded - the drawio/SVG extension already adds its own "Copy as PNG".
const RASTER_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.avif'
]);

interface ISettingsState {
  navEnabled: boolean;
  zoomStep: number;
}

const defaults: ISettingsState = {
  navEnabled: true,
  zoomStep: 0.1
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Advanced image viewer: cursor-anchored wheel zoom, drag-to-pan, fit-to-screen reset, and arrow-key folder navigation.',
  autoStart: true,
  requires: [IImageTracker],
  optional: [ISettingRegistry, IDefaultFileBrowser, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    tracker: IImageTracker,
    settingRegistry: ISettingRegistry | null,
    fileBrowser: IDefaultFileBrowser | null,
    translator: ITranslator | null
  ): void => {
    console.log(
      'JupyterLab extension jupyterlab_advanced_image_viewer_extension is activated!'
    );
    const trans = (translator ?? nullTranslator).load(
      'jupyterlab_advanced_image_viewer_extension'
    );
    const controllers = new WeakMap<ImageViewer, ViewerController>();
    const state: ISettingsState = { ...defaults };
    let keyBindings: IDisposable[] = [];

    const currentController = (): ViewerController | null => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return null;
      }
      return controllers.get(widget.content) ?? null;
    };

    const showHelp = (): void => {
      const body = new Widget();
      body.addClass('jp-AdvancedImageViewer-help');
      body.node.innerHTML = [
        '<p>Interactive viewing layered on the standard image viewer.</p>',
        '<p class="jp-AdvancedImageViewer-help-section">This extension</p>',
        '<ul>',
        '<li><b>Wheel up / down</b> - zoom in / out at the cursor</li>',
        '<li><b>Click and drag</b> - pan the image at any zoom</li>',
        '<li><b>Toolbar buttons</b> - zoom in, zoom out, reset to fit</li>',
        '<li><b>Left / Right arrows</b> - previous / next image in the folder</li>',
        '</ul>',
        '<p class="jp-AdvancedImageViewer-help-section">Standard viewer keys (compose with the above)</p>',
        '<ul>',
        '<li><b>= / - / 0</b> - zoom in / out / reset</li>',
        '<li><b>] / [</b> - rotate clockwise / counter-clockwise</li>',
        '<li><b>H / V</b> - flip horizontal / vertical</li>',
        '<li><b>I</b> - invert colours</li>',
        '</ul>'
      ].join('');
      void showDialog({
        title: trans.__('Advanced Image Viewer'),
        body,
        buttons: [Dialog.okButton({ label: trans.__('Close') })]
      });
    };

    const attach = (widget: IDocumentWidget<ImageViewer>): void => {
      const viewer = widget.content;
      if (controllers.has(viewer)) {
        return;
      }
      const host = viewer.node;
      const img = host.querySelector('img');
      if (!img) {
        return;
      }
      const controller = new ViewerController(
        host,
        img as HTMLImageElement,
        state.zoomStep
      );
      controllers.set(viewer, controller);
      widget.disposed.connect(() => {
        controller.dispose();
        controllers.delete(viewer);
      });

      // Reload from disk, like the HTML viewer's refresh button. That button
      // skips the reload while the model is dirty; an image model is never
      // edited, so there is nothing here to discard.
      widget.toolbar.addItem(
        'advanced-refresh',
        new ToolbarButton({
          icon: refreshIcon,
          tooltip: trans.__('Reload image from disk'),
          noFocusOnClick: true,
          onClick: async () => {
            await widget.context.revert();
            widget.update();
          }
        })
      );
      widget.toolbar.addItem(
        'advanced-zoom-out',
        new ToolbarButton({
          label: '-',
          tooltip: trans.__('Zoom out'),
          noFocusOnClick: true,
          onClick: () => app.commands.execute(CommandIDs.zoomOut)
        })
      );
      widget.toolbar.addItem(
        'advanced-zoom-in',
        new ToolbarButton({
          label: '+',
          tooltip: trans.__('Zoom in'),
          noFocusOnClick: true,
          onClick: () => app.commands.execute(CommandIDs.zoomIn)
        })
      );
      widget.toolbar.addItem(
        'advanced-reset-fit',
        new ToolbarButton({
          label: trans.__('Fit'),
          tooltip: trans.__('Reset to fit'),
          noFocusOnClick: true,
          onClick: () => app.commands.execute(CommandIDs.resetFit)
        })
      );
      widget.toolbar.addItem('advanced-spacer', Toolbar.createSpacerItem());
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
      widget.toolbar.addItem('advanced-help', helpLink);
    };

    tracker.forEach(widget => attach(widget));
    tracker.widgetAdded.connect((_, widget) => attach(widget));

    // JupyterLab registers a 'webp' file type but binds no image viewer to it,
    // so a .webp falls through to the text editor and fails with "not UTF-8
    // encoded". Bind the stock 'Image' factory to it rather than a factory of
    // our own: the document manager finds an open tab by path and factory
    // name, and the file browser, the /tree route, the layout restorer and
    // navigate() must all name the same factory or each opens its own tab.
    // The stock factory then tracks the widget and sets its icon, as for a PNG.
    const webp = app.docRegistry.getFileType('webp');
    if (webp) {
      app.docRegistry.addFileType(webp, ['Image']);
    }
    // JupyterLab registers no 'avif' file type at all, so add one with the
    // same shape as its other image types, bound to the same factory.
    app.docRegistry.addFileType(
      {
        name: 'avif',
        displayName: 'Image',
        mimeTypes: ['image/avif'],
        extensions: ['.avif'],
        icon: imageIcon,
        fileFormat: 'base64'
      },
      ['Image']
    );

    app.commands.addCommand(CommandIDs.zoomIn, {
      label: trans.__('Zoom In (Advanced Image Viewer)'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => currentController() !== null,
      execute: () => currentController()?.zoomIn()
    });
    app.commands.addCommand(CommandIDs.zoomOut, {
      label: trans.__('Zoom Out (Advanced Image Viewer)'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => currentController() !== null,
      execute: () => currentController()?.zoomOut()
    });
    app.commands.addCommand(CommandIDs.resetFit, {
      label: trans.__('Reset to Fit (Advanced Image Viewer)'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => currentController() !== null,
      execute: () => currentController()?.reset()
    });

    // Resolve the image widget under the context-menu target. Right-click does
    // not activate the widget, so hit-test the clicked node rather than rely on
    // tracker.currentWidget.
    const contextImageWidget = (): IDocumentWidget<ImageViewer> | null => {
      const node = app.contextMenuHitTest(n =>
        n.classList.contains('jp-ImageViewer')
      );
      if (!node) {
        return null;
      }
      return tracker.find(widget => widget.content.node === node) ?? null;
    };

    app.commands.addCommand(CommandIDs.copyClipboard, {
      label: trans.__('Copy to Clipboard'),
      describedBy: { args: { type: 'object', properties: {} } },
      // Raster only - SVG already has "Copy as PNG" from the drawio extension.
      isVisible: () => {
        const widget = contextImageWidget();
        return (
          widget !== null &&
          RASTER_EXTS.has(PathExt.extname(widget.context.path).toLowerCase())
        );
      },
      execute: async () => {
        const img = contextImageWidget()?.content.node.querySelector('img');
        if (!img) {
          return;
        }
        // Copy the source pixels, not the on-screen zoom/pan/rotate view.
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (!blob) {
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
        } catch (err) {
          console.error('Advanced image viewer: clipboard copy failed', err);
        }
      }
    });

    app.contextMenu.addItem({
      command: CommandIDs.copyClipboard,
      selector: '.jp-ImageViewer',
      rank: 0
    });

    const navigate = async (delta: number): Promise<void> => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      const path = widget.context.path;
      const dirPath = PathExt.dirname(path);
      const isImage = (item: { name: string; type: string }): boolean =>
        item.type === 'file' &&
        IMAGE_EXTS.has(PathExt.extname(item.name).toLowerCase());
      // Step through the images in the order the file browser shows them
      // when it lists this folder, so its sort key, its direction and any
      // sort plugin decide what comes next: a C-locale sort puts '.' before
      // '_' where localeCompare puts '_' first, and a re-sort here skipped
      // files. FileBrowser keeps `listing` protected, but it is the only
      // source of the displayed order. The listing re-sorts on a refresh only
      // while it is visible, so a hidden one is re-sorted here; re-sorting a
      // visible one would re-render every row on each step. Otherwise fall
      // back to natural name order, the stock file browser default.
      let images: Array<{ name: string; path: string; type: string }> = [];
      if (fileBrowser && fileBrowser.model.path === dirPath) {
        const shown = (fileBrowser as unknown as { listing: DirListing })
          .listing;
        if (!shown.isVisible) {
          shown.sort(shown.sortState);
        }
        images = Array.from(shown.sortedItems()).filter(isImage);
      }
      if (!images.some(item => item.path === path)) {
        const listing = await app.serviceManager.contents.get(dirPath, {
          content: true
        });
        const content = listing.content as Array<{
          name: string;
          path: string;
          type: string;
        }> | null;
        if (!content) {
          return;
        }
        images = content.filter(isImage).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: 'base'
          })
        );
      }
      if (images.length <= 1) {
        return;
      }
      const idx = images.findIndex(item => item.path === path);
      if (idx === -1) {
        return;
      }
      const target =
        delta < 0 ? Math.max(0, idx - 1) : Math.min(images.length - 1, idx + 1);
      if (target === idx) {
        return;
      }
      // Advance within a single viewer: open the next image, then close the
      // previous one. The stock image viewer binds each file to its own
      // DocumentWidget, so an in-place file swap is not possible; opening and
      // disposing the previous widget leaves one image tab that advances.
      const previous = widget;
      await app.commands.execute('docmanager:open', {
        path: images[target].path,
        factory: 'Image'
      });
      if (!previous.isDisposed && previous !== tracker.currentWidget) {
        previous.dispose();
      }
    };

    app.commands.addCommand(CommandIDs.previous, {
      label: trans.__('Previous Image In Folder'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => state.navEnabled && tracker.currentWidget !== null,
      execute: () => navigate(-1)
    });
    app.commands.addCommand(CommandIDs.next, {
      label: trans.__('Next Image In Folder'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => state.navEnabled && tracker.currentWidget !== null,
      execute: () => navigate(1)
    });

    const bindKeys = (): void => {
      keyBindings.forEach(b => b.dispose());
      keyBindings = [];
      if (!state.navEnabled) {
        return;
      }
      keyBindings.push(
        app.commands.addKeyBinding({
          command: CommandIDs.previous,
          keys: ['ArrowLeft'],
          selector: '.jp-ImageViewer'
        })
      );
      keyBindings.push(
        app.commands.addKeyBinding({
          command: CommandIDs.next,
          keys: ['ArrowRight'],
          selector: '.jp-ImageViewer'
        })
      );
    };

    const applyState = (): void => {
      tracker.forEach(widget => {
        const controller = controllers.get(widget.content);
        if (controller) {
          controller.setZoomStep(state.zoomStep);
        }
      });
      bindKeys();
    };

    if (settingRegistry) {
      settingRegistry
        .load(PLUGIN_ID)
        .then(settings => {
          const read = (): void => {
            const c = settings.composite as Partial<ISettingsState>;
            state.navEnabled = c.navEnabled ?? defaults.navEnabled;
            state.zoomStep = c.zoomStep ?? defaults.zoomStep;
          };
          read();
          applyState();
          settings.changed.connect(() => {
            read();
            applyState();
          });
        })
        .catch(reason => {
          console.error(`Failed to load settings for ${PLUGIN_ID}.`, reason);
          applyState();
        });
    } else {
      applyState();
    }
  }
};

export default plugin;
