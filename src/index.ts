import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Dialog,
  showDialog,
  Toolbar,
  WidgetTracker
} from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';

import { IImageTracker, ImageViewer } from '@jupyterlab/imageviewer';

import { Contents, IDefaultDrive } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { imageIcon } from '@jupyterlab/ui-components';

import { IDisposable } from '@lumino/disposable';

import { Widget } from '@lumino/widgets';

// eslint-disable-next-line jupyter/prefer-lazy-imports -- the layout restorer opens saved audio tabs at activation; wavesurfer.js itself loads on first use
import { AudioViewer } from './audio';

// eslint-disable-next-line jupyter/prefer-lazy-imports -- activation attaches the controller to restored image tabs at once
import { ViewerController } from './controller';

// eslint-disable-next-line jupyter/prefer-lazy-imports -- activation registers the media widget factories at once
import { MediaFactory, MediaViewer } from './media';

import { SEEK_STEP } from './mediautil';

import { navigate } from './navigate';

import { addHelpLink, addReloadButton, addZoomButtons } from './toolbar';

// eslint-disable-next-line jupyter/prefer-lazy-imports -- the layout restorer opens saved video tabs at activation; Plyr itself loads on first use
import { VideoViewer } from './video';

const PLUGIN_ID =
  '@stellarshenson/jupyterlab-advanced-image-viewer-extension:plugin';

const CommandIDs = {
  zoomIn: 'advanced-image-viewer:zoom-in',
  zoomOut: 'advanced-image-viewer:zoom-out',
  resetFit: 'advanced-image-viewer:reset-fit',
  previous: 'advanced-image-viewer:previous-image',
  next: 'advanced-image-viewer:next-image',
  copyClipboard: 'advanced-image-viewer:copy-to-clipboard',
  seekBack: 'advanced-media-viewer:seek-back',
  seekForward: 'advanced-media-viewer:seek-forward',
  togglePlay: 'advanced-media-viewer:toggle-play',
  previousFile: 'advanced-media-viewer:previous-file',
  nextFile: 'advanced-media-viewer:next-file'
};

const AUDIO_FACTORY = 'AdvancedAudioViewer';
const VIDEO_FACTORY = 'AdvancedVideoViewer';

// Opens a media file without its content, so no media file is ever read
// through the contents API; the player reads it from its file URL.
const MEDIA_PROVIDER = 'advanced-media-provider';

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
    'Advanced image viewer: cursor-anchored wheel zoom, drag-to-pan, fit-to-screen reset, and arrow-key folder navigation; audio viewer with a waveform, and media keys.',
  autoStart: true,
  requires: [IImageTracker, IDefaultDrive],
  optional: [
    ISettingRegistry,
    IDefaultFileBrowser,
    ITranslator,
    ILayoutRestorer
  ],
  activate: (
    app: JupyterFrontEnd,
    tracker: IImageTracker,
    drive: Contents.IDrive,
    settingRegistry: ISettingRegistry | null,
    fileBrowser: IDefaultFileBrowser | null,
    translator: ITranslator | null,
    restorer: ILayoutRestorer | null
  ): void => {
    console.log(
      'JupyterLab extension @stellarshenson/jupyterlab-advanced-image-viewer-extension is activated!'
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
      addReloadButton(
        widget.toolbar,
        trans.__('Reload image from disk'),
        async () => {
          await widget.context.revert();
          widget.update();
        }
      );
      addZoomButtons(
        widget.toolbar,
        trans,
        () => void app.commands.execute(CommandIDs.zoomOut),
        () => void app.commands.execute(CommandIDs.zoomIn),
        () => void app.commands.execute(CommandIDs.resetFit)
      );
      widget.toolbar.addItem('advanced-spacer', Toolbar.createSpacerItem());
      addHelpLink(widget.toolbar, trans, showHelp);
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

    const navigateImages = (delta: number): Promise<void> =>
      navigate(app, fileBrowser, tracker, IMAGE_EXTS, 'Image', delta);

    app.commands.addCommand(CommandIDs.previous, {
      label: trans.__('Previous Image In Folder'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => state.navEnabled && tracker.currentWidget !== null,
      execute: () => navigateImages(-1)
    });
    app.commands.addCommand(CommandIDs.next, {
      label: trans.__('Next Image In Folder'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => state.navEnabled && tracker.currentWidget !== null,
      execute: () => navigateImages(1)
    });

    // ---------------------------------------------------------------------
    // Media viewers. They replace JupyterLab's audio and video viewers, which
    // package.json disables, and share the toolbar parts, the help link and
    // the folder navigation of the image viewer above.
    // ---------------------------------------------------------------------

    drive.contentProviderRegistry?.register(MEDIA_PROVIDER, {
      get: (path: string, options?: Contents.IFetchOptions) =>
        drive.get(path, {
          ...options,
          contentProviderId: undefined,
          content: false
        }),
      save: (path: string, options: Partial<Contents.IModel> = {}) =>
        drive.save(path, { ...options, contentProviderId: undefined })
    });

    // Audio and video widgets share one tracker, so the media keys and tab
    // restore find either kind.
    const mediaTracker = new WidgetTracker<IDocumentWidget<MediaViewer>>({
      namespace: 'advanced-media-viewer'
    });
    restorer?.restore(mediaTracker, {
      command: 'docmanager:open',
      args: widget => ({
        path: widget.context.path,
        factory: widget.content.factory
      }),
      name: widget => widget.context.path
    });
    // The file extensions of each media kind, by the factory that opens it;
    // folder navigation steps through files of the same kind.
    const mediaExts = new Map<string, Set<string>>();

    // Every file type JupyterLab registers with a MIME type of this kind, as
    // the stock viewers bind them.
    const fileTypesOf = (kind: 'audio' | 'video') =>
      Array.from(app.docRegistry.fileTypes()).filter(type =>
        type.mimeTypes.some(mime => mime.startsWith(`${kind}/`))
      );

    const showMediaHelp = (kind: 'audio' | 'video'): void => {
      const body = new Widget();
      body.addClass('jp-AdvancedImageViewer-help');
      const section = (title: string, items: string[][]): void => {
        const heading = document.createElement('p');
        heading.className = 'jp-AdvancedImageViewer-help-section';
        heading.textContent = title;
        const list = document.createElement('ul');
        for (const [keys, text] of items) {
          const item = document.createElement('li');
          const bold = document.createElement('b');
          bold.textContent = keys;
          item.append(bold, ` - ${text}`);
          list.append(item);
        }
        body.node.append(heading, list);
      };
      section(trans.__('Keys'), [
        [trans.__('Space'), trans.__('play / pause')],
        [
          trans.__('Left / Right'),
          trans.__('back / forward %1 seconds', SEEK_STEP)
        ],
        [
          trans.__('Page Up / Page Down'),
          trans.__('previous / next file of the same kind in the folder')
        ]
      ]);
      if (kind === 'audio') {
        section(trans.__('Waveform'), [
          [trans.__('Click'), trans.__('move playback to that point')],
          [
            trans.__('Overview strip'),
            trans.__('click or drag to move playback anywhere in the file')
          ],
          [trans.__('Drag'), trans.__('mark a region and loop it')],
          [
            trans.__('Wheel, - / + / Fit'),
            trans.__('zoom out / in, show the whole file')
          ],
          [trans.__('Loop'), trans.__('loop the region; off removes it')],
          [trans.__('Speed'), trans.__('play at 0.5x to 2x the normal speed')]
        ]);
      } else {
        section(trans.__('Player'), [
          [trans.__('Play / pause'), trans.__('start or stop playback')],
          [
            trans.__('Seek bar'),
            trans.__('click or drag to move playback to that point')
          ],
          [
            trans.__('Current time'),
            trans.__('the time played and the length of the file')
          ],
          [trans.__('Mute'), trans.__('turn the sound off and on')],
          [trans.__('Volume'), trans.__('set the sound level')],
          [trans.__('Speed'), trans.__('choose a playback speed')],
          [
            trans.__('Picture in picture'),
            trans.__('play in a small floating window')
          ],
          [trans.__('Full screen'), trans.__('fill the screen with the video')]
        ]);
      }
      void showDialog({
        title: trans.__('Media Viewer'),
        body,
        buttons: [Dialog.okButton({ label: trans.__('Close') })]
      });
    };

    const trackMedia = (widget: IDocumentWidget<MediaViewer>): void => {
      void mediaTracker.add(widget);
      widget.context.pathChanged.connect(() => void mediaTracker.save(widget));
      const icon = app.docRegistry
        .getFileTypesForPath(widget.context.path)
        .find(type => type.icon)?.icon;
      if (icon) {
        widget.title.icon = icon;
      }
    };

    const audioTypes = fileTypesOf('audio');
    mediaExts.set(
      AUDIO_FACTORY,
      new Set(([] as string[]).concat(...audioTypes.map(t => t.extensions)))
    );
    const audioFactory = new MediaFactory(
      {
        name: AUDIO_FACTORY,
        label: trans.__('Audio Viewer'),
        fileTypes: audioTypes.map(type => type.name),
        defaultFor: audioTypes.map(type => type.name),
        readOnly: true,
        modelName: 'base64',
        contentProviderId: MEDIA_PROVIDER,
        translator: translator ?? nullTranslator
      },
      context =>
        new AudioViewer({
          context,
          factory: AUDIO_FACTORY,
          contents: app.serviceManager.contents,
          trans
        })
    );
    app.docRegistry.addWidgetFactory(audioFactory);
    audioFactory.widgetCreated.connect((_, widget) => {
      const viewer = widget.content as AudioViewer;
      trackMedia(widget);
      addReloadButton(
        widget.toolbar,
        trans.__('Reload audio from disk'),
        async () => {
          await widget.context.revert();
          await viewer.load();
        }
      );
      viewer.addControls(widget.toolbar);
      widget.toolbar.addItem('advanced-spacer', Toolbar.createSpacerItem());
      widget.toolbar.addItem(
        'advanced-details',
        new Widget({ node: viewer.details })
      );
      addHelpLink(widget.toolbar, trans, () => showMediaHelp('audio'));
    });

    const videoTypes = fileTypesOf('video');
    mediaExts.set(
      VIDEO_FACTORY,
      new Set(([] as string[]).concat(...videoTypes.map(t => t.extensions)))
    );
    const videoFactory = new MediaFactory(
      {
        name: VIDEO_FACTORY,
        label: trans.__('Video Viewer'),
        fileTypes: videoTypes.map(type => type.name),
        defaultFor: videoTypes.map(type => type.name),
        readOnly: true,
        modelName: 'base64',
        contentProviderId: MEDIA_PROVIDER,
        translator: translator ?? nullTranslator
      },
      context =>
        new VideoViewer({
          context,
          factory: VIDEO_FACTORY,
          contents: app.serviceManager.contents,
          trans
        })
    );
    app.docRegistry.addWidgetFactory(videoFactory);
    videoFactory.widgetCreated.connect((_, widget) => {
      const viewer = widget.content as VideoViewer;
      trackMedia(widget);
      addReloadButton(
        widget.toolbar,
        trans.__('Reload video from disk'),
        async () => {
          await widget.context.revert();
          await viewer.load();
        }
      );
      widget.toolbar.addItem('advanced-spacer', Toolbar.createSpacerItem());
      widget.toolbar.addItem(
        'advanced-details',
        new Widget({ node: viewer.details })
      );
      addHelpLink(widget.toolbar, trans, () => showMediaHelp('video'));
    });

    const currentMedia = (): MediaViewer | null =>
      mediaTracker.currentWidget?.content ?? null;
    const navigateMedia = (delta: number): Promise<void> => {
      const viewer = currentMedia();
      const exts = viewer && mediaExts.get(viewer.factory);
      if (!viewer || !exts) {
        return Promise.resolve();
      }
      return navigate(
        app,
        fileBrowser,
        mediaTracker,
        exts,
        viewer.factory,
        delta
      );
    };

    app.commands.addCommand(CommandIDs.seekBack, {
      label: trans.__('Back %1 Seconds (Media Viewer)', SEEK_STEP),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => currentMedia() !== null,
      execute: () => currentMedia()?.seekBy(-SEEK_STEP)
    });
    app.commands.addCommand(CommandIDs.seekForward, {
      label: trans.__('Forward %1 Seconds (Media Viewer)', SEEK_STEP),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => currentMedia() !== null,
      execute: () => currentMedia()?.seekBy(SEEK_STEP)
    });
    app.commands.addCommand(CommandIDs.togglePlay, {
      label: trans.__('Play / Pause (Media Viewer)'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => currentMedia() !== null,
      execute: () => currentMedia()?.togglePlay()
    });
    app.commands.addCommand(CommandIDs.previousFile, {
      label: trans.__('Previous Media File In Folder'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => state.navEnabled && currentMedia() !== null,
      execute: () => navigateMedia(-1)
    });
    app.commands.addCommand(CommandIDs.nextFile, {
      label: trans.__('Next Media File In Folder'),
      describedBy: { args: { type: 'object', properties: {} } },
      isEnabled: () => state.navEnabled && currentMedia() !== null,
      execute: () => navigateMedia(1)
    });
    for (const [command, key] of [
      [CommandIDs.seekBack, 'ArrowLeft'],
      [CommandIDs.seekForward, 'ArrowRight'],
      [CommandIDs.togglePlay, 'Space']
    ]) {
      app.commands.addKeyBinding({
        command,
        keys: [key],
        selector: '.jp-AdvancedMediaViewer'
      });
    }

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
      keyBindings.push(
        app.commands.addKeyBinding({
          command: CommandIDs.previousFile,
          keys: ['PageUp'],
          selector: '.jp-AdvancedMediaViewer'
        })
      );
      keyBindings.push(
        app.commands.addKeyBinding({
          command: CommandIDs.nextFile,
          keys: ['PageDown'],
          selector: '.jp-AdvancedMediaViewer'
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
