// Shared parts of the audio and video viewers: the document widget that owns
// the media element every control and key acts on, and its widget factory.

import { PathExt } from '@jupyterlab/coreutils';

import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
  IDocumentWidget
} from '@jupyterlab/docregistry';

import { Contents } from '@jupyterlab/services';

import { TranslationBundle } from '@jupyterlab/translation';

import { Widget } from '@lumino/widgets';

import { formatSize, formatTime, WAVEFORM_LIMIT } from './mediautil';

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
    this.node.append(this.media, this.message);
    // A file the browser cannot play fires `error` and nothing else, so this
    // is the one place an unreadable file becomes visible.
    this.media.addEventListener('error', () =>
      this.showMessage(
        this.trans.__(
          'This file cannot be played: %1',
          this.trans.__(
            'the file is damaged or in a format this browser cannot play'
          )
        )
      )
    );
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
  // The file size in bytes, unknown until readSize() returns.
  protected size: number | undefined;
  // Counts load() calls, so a superseded load stops before it sets the source.
  protected loads = 0;
  // The blob URL of the current file, to revoke when it is replaced.
  private mediaUrl: string | null = null;

  // Read the file (again) and point the player at it. Up to the 100 MB
  // waveform limit it is downloaded once and played from the copy, so the
  // player seeks in memory, also on a server that ignores byte ranges; above
  // the limit it plays from the file URL, which needs byte ranges from the
  // server (DEF-MEDIA-7-SEEK).
  async load(): Promise<void> {
    const token = ++this.loads;
    this.showMessage(this.trans.__('Loading...'));
    try {
      const size = await this.readSize();
      const url = await this.contents.getDownloadUrl(this.context.path);
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      if (size > WAVEFORM_LIMIT) {
        this.setFile(url);
        this.showMessage('');
        return;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      // A reload or a close while this one was fetching supersedes it.
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      this.setFile(blob);
      this.showMessage('');
    } catch (reason) {
      if (!this.isDisposed && token === this.loads) {
        this.showMessage(
          this.trans.__('This file cannot be played: %1', String(reason))
        );
      }
    }
  }

  // The document context drops the size from the file model, so it is read
  // again here, still without the content.
  protected async readSize(): Promise<number> {
    const model = await this.contents.get(this.context.path, {
      content: false
    });
    this.size = model.size;
    return model.size ?? 0;
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

  protected showMessage(text: string): void {
    this.message.textContent = text;
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

  // Point the player at the file; a blob URL made here is revoked when the
  // next file replaces it and when the tab closes.
  private setFile(file: string | Blob): void {
    this.release();
    if (typeof file !== 'string') {
      this.mediaUrl = URL.createObjectURL(file);
      file = this.mediaUrl;
    }
    this.media.src = file;
  }

  private release(): void {
    if (this.mediaUrl) {
      URL.revokeObjectURL(this.mediaUrl);
      this.mediaUrl = null;
    }
  }

  // Closing the tab stops the sound and drops the element, so no detached
  // element keeps playing or holds the file.
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.release();
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

export class MediaFactory extends ABCWidgetFactory<
  IDocumentWidget<MediaViewer>
> {
  constructor(
    options: DocumentRegistry.IWidgetFactoryOptions<
      IDocumentWidget<MediaViewer>
    >,
    create: (context: DocumentRegistry.Context) => MediaViewer
  ) {
    super(options);
    this.create = create;
  }

  protected createNewWidget(
    context: DocumentRegistry.Context
  ): IDocumentWidget<MediaViewer> {
    return new DocumentWidget({ content: this.create(context), context });
  }

  private create: (context: DocumentRegistry.Context) => MediaViewer;
}
