// Shared parts of the audio and video viewers: the document widget that owns
// the media element every control and key acts on, and the widget factory, which
// the mesh viewer uses as well.

import { Notification, Spinner } from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
  IDocumentWidget
} from '@jupyterlab/docregistry';

import { Contents } from '@jupyterlab/services';

import { TranslationBundle } from '@jupyterlab/translation';

import { PanelLayout, Widget } from '@lumino/widgets';

import { formatSize, formatTime } from './mediautil';

// A file request that fails before the metadata gets the code of a damaged file,
// MEDIA_ERR_SRC_NOT_SUPPORTED. Only the text differs: a damaged file names the
// demuxer. Measured on Chromium. A 404 or 502 on the file URL gets the same text,
// so it reads as a lost connection.
// shortcut: other browsers keep the damaged-file sentence, measure them to add theirs.
const REQUEST_FAILED = 'MEDIA_ELEMENT_ERROR: Format error';

// A screen reader reads a change of the text of a live region it already
// has, not a region that appears with its text in it. So the line is emptied
// as its region shows, and `text` is written once a frame has been drawn.
export const announce = (line: HTMLElement, text: string): void => {
  line.textContent = '';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => (line.textContent = text))
  );
};

export class MediaViewer extends Widget {
  constructor(options: MediaViewer.IOptions) {
    super();
    this.addClass('jp-AdvancedMediaViewer');
    // Focusable, so the main area focuses the viewer on activation and the
    // media keys reach it.
    this.node.tabIndex = 0;
    this.context = options.context;
    this.factory = options.factory;
    this.contents = options.contents;
    this.trans = options.trans;
    this.media = document.createElement(options.kind);
    this.media.className = 'jp-AdvancedMediaViewer-media';
    this.message = document.createElement('div');
    this.message.className = 'jp-AdvancedMediaViewer-message';
    this.message.setAttribute('role', 'status');
    this.details = document.createElement('span');
    this.details.className = 'jp-AdvancedMediaViewer-details';
    // Covers the viewer from the start of a load until the file can play. Its
    // line is a status, so a screen reader reads it while the message line is
    // empty.
    this.spinner = new Spinner();
    this.loading = document.createElement('div');
    this.loading.setAttribute('role', 'status');
    this.spinner.node.append(this.loading);
    this.spinner.hide();
    this.node.append(this.media, this.message, this.spinner.node);
    // A file the browser cannot play fires `error` and nothing else, so this
    // is the one place an unreadable file becomes visible.
    this.media.addEventListener('error', () => {
      const error = this.media.error;
      this.showMessage(
        error?.code === MediaError.MEDIA_ERR_NETWORK ||
          error?.message === REQUEST_FAILED
          ? this.trans.__(
              'The connection to the server was lost; press Reload to try again.'
            )
          : this.trans.__(
              'This file cannot be played: %1',
              this.trans.__(
                'the file is damaged or in a format this browser cannot play'
              )
            )
      );
    });
    // File > Reload from Disk calls revert(), which re-reads only the empty
    // document model and answers a deleted file with its own dialog. The
    // viewer reads the file instead and says so in its sentence.
    this.context.revert = () => this.load();
    void this.context.ready.then(() => this.load());
  }

  readonly context: DocumentRegistry.Context;
  readonly factory: string;
  readonly media: HTMLMediaElement;
  // Toolbar read-out of the file format, size and duration.
  readonly details: HTMLElement;
  protected readonly contents: Contents.IManager;
  protected readonly trans: TranslationBundle;
  protected readonly message: HTMLElement;
  private readonly spinner: Spinner;
  private readonly loading: HTMLElement;
  // The file size in bytes, unknown until readSize() returns.
  protected size: number | undefined;
  // Counts load() calls, so a superseded load stops before it sets the source.
  protected loads = 0;

  // Read the file (again) and play it from its file URL, which the browser
  // streams; seeking needs byte ranges from the server (DEF-MEDIA-7-SEEK).
  async load(): Promise<void> {
    const token = ++this.loads;
    this.showLoading();
    try {
      await this.readSize();
      const url = await this.contents.getDownloadUrl(this.context.path);
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      this.playUrl(url);
    } catch (reason) {
      if (!this.isDisposed && token === this.loads) {
        this.fail(reason);
      }
    }
  }

  // The server did not give the file or the player: nothing of the old file
  // stays, and one sentence says so.
  protected fail(reason: unknown): void {
    console.error('Media viewer: the file was not read', reason);
    this.media.removeAttribute('src');
    this.media.load();
    this.details.textContent = '';
    // A TypeError is a request that got no answer: the connection broke.
    this.showMessage(
      this.reloadSentence(reason) ??
        (reason instanceof TypeError
          ? this.trans.__(
              'The connection to the server was lost; press Reload to try again.'
            )
          : this.trans.__('This file cannot be read from the server.'))
    );
  }

  // A page left open across an install asks for chunk names that no longer
  // exist, and only a page reload helps; null for any other failure.
  protected reloadSentence(reason: unknown): string | null {
    return (reason as Error)?.name === 'ChunkLoadError'
      ? this.trans.__('This viewer was updated; reload the page to use it.')
      : null;
  }

  // The document context drops the size from the file model, so it is read
  // again here, still without the content.
  protected async readSize(): Promise<void> {
    const model = await this.contents.get(this.context.path, {
      content: false
    });
    this.size = model.size;
  }

  togglePlay(): void {
    if (this.media.paused) {
      // A file that cannot play rejects here; its `error` event reports it.
      this.media.play().catch(() => undefined);
    } else {
      this.media.pause();
    }
  }

  seekBy(seconds: number): void {
    const duration = this.media.duration;
    if (Number.isNaN(duration)) {
      return;
    }
    this.media.currentTime = Math.min(
      Math.max(this.media.currentTime + seconds, 0),
      duration
    );
  }

  // A sentence, or none, at the panel foot; it ends the loading state.
  protected showMessage(text: string): void {
    this.message.textContent = text;
    this.spinner.hide();
  }

  protected showLoading(): void {
    this.message.textContent = '';
    this.spinner.show();
    announce(this.loading, this.trans.__('Loading...'));
  }

  // The format from the extension, then whatever the viewer measured.
  protected setDetails(parts: string[]): void {
    const ext = PathExt.extname(this.context.path).slice(1);
    this.details.textContent = [
      ext.toUpperCase(),
      ...parts,
      ...(this.size === undefined ? [] : [formatSize(this.size)]),
      formatTime(this.media.duration, 0)
    ].join(' · ');
  }

  // Play from the file URL. The spinner stays until the element has the
  // metadata, so a request that stalls or fails never leaves an empty player
  // with no message.
  protected playUrl(url: string): void {
    const token = this.loads;
    this.media.src = url;
    this.media.addEventListener(
      'loadedmetadata',
      () => {
        if (token === this.loads) {
          this.showMessage('');
        }
      },
      { once: true }
    );
  }

  // Closing the tab stops the sound and drops the element, so no detached
  // element keeps playing or holds the file.
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.media.pause();
    this.media.removeAttribute('src');
    this.media.load();
    this.media.remove();
    super.dispose();
  }
}

export namespace MediaViewer {
  export interface IOptions {
    context: DocumentRegistry.Context;
    // The widget factory that opened the file; navigation and tab restore
    // open the next file with it.
    factory: string;
    kind: 'audio' | 'video';
    contents: Contents.IManager;
    trans: TranslationBundle;
  }
}

export class MediaFactory<T extends Widget> extends ABCWidgetFactory<
  IDocumentWidget<T>
> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<IDocumentWidget<T>>,
    create: (context: DocumentRegistry.Context) => T
  ) {
    super(options);
    this.create = create;
    this.trans = this.translator.load(
      'jupyterlab_advanced_image_viewer_extension'
    );
  }

  protected createNewWidget(
    context: DocumentRegistry.Context
  ): IDocumentWidget<T> {
    const widget = new DocumentWidget({
      content: this.create(context),
      context
    });
    // Save As writes the document model to the new path without asking the
    // content provider, and Ctrl+S writes it through the default contents
    // provider once the file has disappeared, because the context then saves
    // the empty model itself. The viewers never load the file into that model,
    // so both would write an empty file. Refuse them, as the provider refuses
    // a save; ModalCancelError is what the save command treats as cancelled,
    // so it adds no checkpoint after the refusal.
    const refuseSave = (): void => {
      // Notification defaults autoClose to 0, which shows no toast at all.
      void Notification.warning(
        this.trans.__(
          'This viewer does not save files, so the file is unchanged.'
        ),
        { autoClose: 5000 }
      );
    };
    context.save = async () => {
      refuseSave();
      const error = new Error('Save refused');
      error.name = 'ModalCancelError';
      throw error;
    };
    context.saveAs = async () => {
      refuseSave();
      return false;
    };
    // JupyterLab labels a file that is not writable on the toolbar. A viewer
    // edits nothing, so the label tells nothing.
    void context.ready.then(() => {
      if (!widget.isDisposed) {
        (widget.toolbar.layout as PanelLayout).widgets
          .find(item => item.node.dataset.jpItemName === 'read-only-indicator')
          ?.dispose();
      }
    });
    return widget;
  }

  private create: (context: DocumentRegistry.Context) => T;
  private readonly trans: TranslationBundle;
}
