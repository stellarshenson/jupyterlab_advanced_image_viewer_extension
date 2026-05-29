import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ToolbarButton } from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { IImageTracker, ImageViewer } from '@jupyterlab/imageviewer';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IDisposable } from '@lumino/disposable';

import { ViewerController } from './controller';

const PLUGIN_ID = 'jupyterlab_advanced_image_viewer_extension:plugin';

const CommandIDs = {
  zoomIn: 'advanced-image-viewer:zoom-in',
  zoomOut: 'advanced-image-viewer:zoom-out',
  resetFit: 'advanced-image-viewer:reset-fit',
  previous: 'advanced-image-viewer:previous-image',
  next: 'advanced-image-viewer:next-image'
};

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.svg',
  '.webp'
]);

interface ISettingsState {
  navEnabled: boolean;
  prevKey: string;
  nextKey: string;
  zoomStep: number;
}

const defaults: ISettingsState = {
  navEnabled: true,
  prevKey: 'ArrowLeft',
  nextKey: 'ArrowRight',
  zoomStep: 0.1
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Advanced image viewer: cursor-anchored wheel zoom, drag-to-pan, fit-to-screen reset, and configurable folder navigation.',
  autoStart: true,
  requires: [IImageTracker],
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    tracker: IImageTracker,
    settingRegistry: ISettingRegistry | null
  ): void => {
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

    const attach = (
      widget: IDocumentWidget<ImageViewer>
    ): void => {
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

      widget.toolbar.addItem(
        'advanced-zoom-out',
        new ToolbarButton({
          label: '-',
          tooltip: 'Zoom out',
          onClick: () => app.commands.execute(CommandIDs.zoomOut)
        })
      );
      widget.toolbar.addItem(
        'advanced-zoom-in',
        new ToolbarButton({
          label: '+',
          tooltip: 'Zoom in',
          onClick: () => app.commands.execute(CommandIDs.zoomIn)
        })
      );
      widget.toolbar.addItem(
        'advanced-reset-fit',
        new ToolbarButton({
          label: 'Fit',
          tooltip: 'Reset to fit',
          onClick: () => app.commands.execute(CommandIDs.resetFit)
        })
      );
    };

    tracker.forEach(widget => attach(widget));
    tracker.widgetAdded.connect((_, widget) => attach(widget));

    app.commands.addCommand(CommandIDs.zoomIn, {
      label: 'Zoom In (Advanced Image Viewer)',
      isEnabled: () => currentController() !== null,
      execute: () => currentController()?.zoomIn()
    });
    app.commands.addCommand(CommandIDs.zoomOut, {
      label: 'Zoom Out (Advanced Image Viewer)',
      isEnabled: () => currentController() !== null,
      execute: () => currentController()?.zoomOut()
    });
    app.commands.addCommand(CommandIDs.resetFit, {
      label: 'Reset to Fit (Advanced Image Viewer)',
      isEnabled: () => currentController() !== null,
      execute: () => currentController()?.reset()
    });

    const navigate = async (delta: number): Promise<void> => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      const path = widget.context.path;
      const dirPath = PathExt.dirname(path);
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
      const images = content
        .filter(
          item =>
            item.type === 'file' &&
            IMAGE_EXTS.has(PathExt.extname(item.name).toLowerCase())
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: 'base'
          })
        );
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
      await app.commands.execute('docmanager:open', {
        path: images[target].path,
        factory: 'Image'
      });
    };

    app.commands.addCommand(CommandIDs.previous, {
      label: 'Previous Image In Folder',
      isEnabled: () => state.navEnabled && tracker.currentWidget !== null,
      execute: () => navigate(-1)
    });
    app.commands.addCommand(CommandIDs.next, {
      label: 'Next Image In Folder',
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
          keys: [state.prevKey],
          selector: '.jp-ImageViewer'
        })
      );
      keyBindings.push(
        app.commands.addKeyBinding({
          command: CommandIDs.next,
          keys: [state.nextKey],
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
            state.prevKey = c.prevKey ?? defaults.prevKey;
            state.nextKey = c.nextKey ?? defaults.nextKey;
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
