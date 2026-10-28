// Video viewer: the shared media widget with a Plyr player. Plyr loads when
// the first video file opens, not at start-up.

import type Plyr from 'plyr';

// Bundled as text and handed to Plyr as a data URL, so the icons and the
// blank video never come from cdn.plyr.io.
import sprite from '../style/plyr.svg';

import { MediaViewer } from './media';

import { SEEK_STEP } from './mediautil';

const SPRITE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sprite)}`;

// A 0.2 s black 16x16 MP4, used by Plyr to abort a pending load when the
// player is destroyed.
const BLANK_VIDEO =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMwbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAADIAAAAAAABAAAAAAHTbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAACABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT5zdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFExhdmM2MS4zLjEwMCBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2Z7ARAAAAwAEAAADAFA8SJZoAQAGaOl4OSyL/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAHBYAABwWAAAABhzdHRzAAAAAAAAAAEAAAACAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAACwwAAAAwAAAAUc3RjbwAAAAAAAAABAAADYAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjEuMS4xMDAAAAAIZnJlZQAAAtdtZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzE5MSA0NjEzYWMzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTUgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9OCBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MiA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MyB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NTAgcmM9Y3JmIG1idHJlZT0xIGNyZj00MC4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAADWWIhAA7//7Ad4FLRK0AAAAIQZohbEN/q4A=';

const CONTROLS = [
  'play',
  'progress',
  'current-time',
  'duration',
  'mute',
  'volume',
  'settings',
  'pip',
  'fullscreen'
];

export class VideoViewer extends MediaViewer {
  constructor(options: Omit<MediaViewer.IOptions, 'kind'>) {
    super({ ...options, kind: 'video' });
    this.addClass('jp-AdvancedMediaViewer-video');
    this.frame = document.createElement('div');
    this.frame.className = 'jp-AdvancedMediaViewer-frame';
    this.node.insertBefore(this.frame, this.media);
    this.frame.append(this.media);
    for (const type of ['loadedmetadata', 'durationchange']) {
      this.media.addEventListener(type, () => this.refresh());
    }
    this.resizeObserver = new ResizeObserver(() => this.fitVideo());
    this.resizeObserver.observe(this.frame);
  }

  // The player of the tab; null before the first file and after a close.
  player: Plyr | null = null;

  async load(): Promise<void> {
    const { default: Player } = await import('plyr');
    if (this.isDisposed) {
      return;
    }
    // One player per tab: making a second one would drop the listeners of
    // the first.
    this.player ??= new Player(this.media, {
      controls: CONTROLS,
      seekTime: SEEK_STEP,
      // Focused only: the player stops the event for these keys, so the
      // viewer's own ArrowLeft and Space bindings do not act a second time.
      keyboard: { focused: true, global: false },
      iconUrl: SPRITE,
      loadSprite: true,
      blankVideo: BLANK_VIDEO,
      i18n: {
        play: this.trans.__('Play'),
        pause: this.trans.__('Pause'),
        mute: this.trans.__('Mute'),
        unmute: this.trans.__('Unmute'),
        volume: this.trans.__('Volume'),
        settings: this.trans.__('Settings'),
        speed: this.trans.__('Speed'),
        normal: this.trans.__('Normal'),
        pip: this.trans.__('Picture in picture'),
        enterFullscreen: this.trans.__('Enter fullscreen'),
        exitFullscreen: this.trans.__('Exit fullscreen')
      }
    });
    await super.load();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.resizeObserver.disconnect();
    this.player?.destroy();
    this.player = null;
    super.dispose();
  }

  private refresh(): void {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (width && height) {
      this.setDetails([`${width}×${height}`]);
    }
    this.fitVideo();
  }

  // Size the player to the video's ratio inside the frame, so the whole
  // picture shows, centred, at any panel size.
  private fitVideo(): void {
    const container = this.player?.elements.container;
    const width = this.frame.clientWidth;
    const height = this.frame.clientHeight;
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    if (!container || !width || !height || !videoWidth || !videoHeight) {
      return;
    }
    const scale = Math.min(width / videoWidth, height / videoHeight);
    container.style.width = `${Math.floor(videoWidth * scale)}px`;
    container.style.height = `${Math.floor(videoHeight * scale)}px`;
  }

  // The base class makes the element from the kind, so it is a video here.
  private get video(): HTMLVideoElement {
    return this.media as HTMLVideoElement;
  }

  private frame: HTMLElement;
  private resizeObserver: ResizeObserver;
}
