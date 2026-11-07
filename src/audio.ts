// Audio viewer: the shared media widget with a wavesurfer.js waveform, an
// overview strip, a time ruler, the time under the mouse, a loop region and
// zoom. wavesurfer.js loads when the first audio file opens, not at start-up.

import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

import {
  jumpBackIcon,
  jumpForwardIcon,
  LabIcon,
  pauseIcon,
  runIcon
} from '@jupyterlab/ui-components';

import type WaveSurfer from 'wavesurfer.js';

import type { GenericPlugin } from 'wavesurfer.js/dist/base-plugin.js';

import type { Region } from 'wavesurfer.js/dist/plugins/regions.js';

// The sprite the video viewer bundles for Plyr.
import sprite from '../style/plyr.svg';

import { announce, MediaViewer } from './media';

import { drawsWaveform, formatTime, readPeaks, SEEK_STEP } from './mediautil';

import { addZoomButtons } from './toolbar';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// The localStorage key of the volume, mute and speed that every audio viewer
// opens with, as Plyr keeps them for the video viewer.
const SETTINGS = 'jupyterlab-advanced-image-viewer-extension:audio';

// The volume and muted icons of the Plyr sprite: JupyterLab's icon set has
// no volume icon, and these match the video viewer's.
const plyrIcon = (id: string): LabIcon => {
  const symbol = new DOMParser()
    .parseFromString(sprite, 'image/svg+xml')
    .getElementById(id)!;
  return new LabIcon({
    name: `advanced-media-viewer:${id}`,
    svgstr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.getAttribute('viewBox')}">${symbol.innerHTML}</svg>`
  });
};
const volumeIcon = plyrIcon('plyr-volume');
const mutedIcon = plyrIcon('plyr-muted');

// An element of the bar under the waveform, with its class and children.
const part = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  name: string,
  ...children: Node[]
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = `jp-AdvancedMediaViewer-${name}`;
  element.append(...children);
  return element;
};

// Show `icon` on `button`, named `label` for the tooltip and screen readers.
const setIcon = (button: HTMLElement, icon: LabIcon, label: string): void => {
  icon.element({ container: button });
  button.title = label;
  button.setAttribute('aria-label', label);
};

// A range input from 0 to `max`, named `label`.
const slider = (name: string, label: string, max: string): HTMLInputElement => {
  const input = part('input', name);
  input.type = 'range';
  input.min = '0';
  input.max = max;
  input.step = 'any';
  input.title = label;
  input.setAttribute('aria-label', label);
  return input;
};

// The shortest drag, in seconds, that makes a loop region: a click that
// moves a few pixels must not arm Loop on a sub-second region.
const MIN_LOOP = 1;

// How far, in pixels, a press must move to count as a drag: wavesurfer drops
// the click of a drag, so an unsteady click would not seek.
const DRAG_THRESHOLD = 8;

// wavesurfer.js and the plugins the viewer uses.
const loadPlayer = () =>
  Promise.all([
    import('wavesurfer.js'),
    import('wavesurfer.js/dist/plugins/minimap.js'),
    import('wavesurfer.js/dist/plugins/timeline.js'),
    import('wavesurfer.js/dist/plugins/hover.js'),
    import('wavesurfer.js/dist/plugins/regions.js'),
    import('wavesurfer.js/dist/plugins/zoom.js')
  ]);

export class AudioViewer extends MediaViewer {
  constructor(options: Omit<MediaViewer.IOptions, 'kind'>) {
    super({ ...options, kind: 'audio' });
    this.addClass('jp-AdvancedMediaViewer-audio');
    const trans = this.trans;
    // Storage can be blocked or hold a damaged value; the defaults then stay.
    try {
      const { volume, muted, speed } = JSON.parse(
        localStorage.getItem(SETTINGS) ?? '{}'
      );
      if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
        this.media.volume = volume;
      }
      if (typeof muted === 'boolean') {
        this.media.muted = muted;
      }
      if (SPEEDS.includes(speed)) {
        this.media.playbackRate = this.media.defaultPlaybackRate = speed;
      }
    } catch (reason) {
      console.warn(
        'Audio viewer: the saved volume and speed were not read',
        reason
      );
    }
    // As Plyr's storage: only the changed keys are written into the stored
    // record, so another audio tab keeps the keys it set.
    const save = (changes: object): void => {
      try {
        let stored = {};
        try {
          stored = JSON.parse(localStorage.getItem(SETTINGS) ?? '{}');
        } catch {
          // A damaged record counts as empty.
        }
        localStorage.setItem(
          SETTINGS,
          JSON.stringify({ ...stored, ...changes })
        );
      } catch {
        // Blocked or full: the settings hold in this tab only.
      }
    };
    this.wave = part('div', 'wave');
    // In the waveform's place while the server part computes the peaks of a
    // file over the waveform limit, or the browser decodes a smaller file: the
    // circle of the loading spinner and a line a screen reader reads as a
    // status.
    const circle = document.createElement('div');
    circle.className = 'jp-SpinnerContent';
    this.drawing = document.createElement('div');
    this.drawing.setAttribute('role', 'status');
    this.peaks = part('div', 'peaks', circle, this.drawing);
    this.peaks.hidden = true;
    this.time = part('span', 'time');
    this.view = part('span', 'range');
    this.length = part('span', 'length');
    // Seeks the whole file, with or without a waveform.
    this.seek = slider('seek', trans.__('Seek'), '0');
    this.seek.addEventListener(
      'input',
      () => (this.media.currentTime = Number(this.seek.value))
    );
    const play = this.button(runIcon, trans.__('Play'), () =>
      this.togglePlay()
    );
    play.classList.add('jp-AdvancedMediaViewer-play');
    // The volume the slider last settled on above 0.
    let lastVolume = this.media.volume;
    // As Plyr's toggle in the video viewer: volume 0 counts as muted, so the
    // press unmutes and brings back an audible volume.
    const mute = this.button(volumeIcon, trans.__('Mute'), () => {
      const muted = !(this.media.muted || !this.media.volume);
      if (!muted && !this.media.volume) {
        this.media.volume = lastVolume > 0 ? lastVolume : 1;
      }
      this.media.muted = muted;
    });
    const volume = slider('volume', trans.__('Volume'), '1');
    volume.addEventListener('input', () => {
      this.media.volume = Number(volume.value);
      // As in the video viewer, moving the slider above 0 unmutes.
      if (this.media.volume) {
        this.media.muted = false;
      }
    });
    volume.addEventListener('change', () => {
      if (Number(volume.value) > 0) {
        lastVolume = Number(volume.value);
      }
    });
    const speed = part('select', 'speed');
    speed.title = trans.__('Playback speed');
    for (const rate of SPEEDS) {
      const chosen = rate === this.media.defaultPlaybackRate;
      speed.add(new Option(`${rate}×`, String(rate), chosen, chosen));
    }
    speed.addEventListener('change', () => {
      this.media.playbackRate = Number(speed.value);
      // A new source resets playbackRate to this default, so Reload keeps the
      // chosen speed.
      this.media.defaultPlaybackRate = this.media.playbackRate;
      save({ speed: this.media.defaultPlaybackRate });
    });
    // Under the waveform: the time row with the seek slider, then the control
    // row with the shown range at the left, Back, Play and Forward in the
    // centre and the sound at the right.
    this.node.prepend(
      this.wave,
      this.peaks,
      part(
        'div',
        'bar',
        part('div', 'times', this.time, this.seek, this.length),
        part(
          'div',
          'controls',
          this.view,
          part(
            'span',
            'centre',
            this.button(
              jumpBackIcon,
              trans.__('Back %1 seconds', SEEK_STEP),
              () => this.seekBy(-SEEK_STEP)
            ),
            play,
            this.button(
              jumpForwardIcon,
              trans.__('Forward %1 seconds', SEEK_STEP),
              () => this.seekBy(SEEK_STEP)
            )
          ),
          part('span', 'sound', mute, volume, speed)
        )
      )
    );
    for (const type of ['timeupdate', 'durationchange', 'seeking', 'emptied']) {
      this.media.addEventListener(type, () => this.showTime());
    }
    this.showTime();
    for (const type of ['play', 'pause', 'emptied']) {
      this.media.addEventListener(type, () =>
        this.media.paused
          ? setIcon(play, runIcon, trans.__('Play'))
          : setIcon(play, pauseIcon, trans.__('Pause'))
      );
    }
    // As the video viewer shows them: the slider at 0 while muted, and the
    // muted icon and the name Unmute also at volume 0. The element keeps both
    // across a Reload.
    const showVolume = (): void => {
      const muted = this.media.muted;
      setIcon(
        mute,
        muted || !this.media.volume ? mutedIcon : volumeIcon,
        muted || !this.media.volume ? trans.__('Unmute') : trans.__('Mute')
      );
      volume.value = String(muted ? 0 : this.media.volume);
      volume.setAttribute(
        'aria-valuetext',
        trans.__('%1%', Math.round((muted ? 0 : this.media.volume) * 100))
      );
    };
    this.media.addEventListener('volumechange', showVolume);
    this.media.addEventListener('volumechange', () =>
      save({ volume: this.media.volume, muted: this.media.muted })
    );
    showVolume();
    this.media.addEventListener('durationchange', () => this.showDetails());
    // The waveform colours are painted on a canvas, which cannot read CSS
    // variables, so they are resolved here and again on every theme change.
    // The theme manager hides the page while it changes theme and shows it in
    // the next frame; a repaint before that draws the waveform at no width.
    this.themeObserver = new MutationObserver(() =>
      requestAnimationFrame(() => this.paint())
    );
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-name']
    });
  }

  // The player of the waveform; null before the first one, and above the
  // limit until the peaks arrive or when they do not.
  wavesurfer: WaveSurfer | null = null;

  async load(): Promise<void> {
    const token = ++this.loads;
    this.sourceChannels = undefined;
    this.setLoop(false);
    this.showLoading();
    this.peaks.hidden = true;
    this.wave.hidden = false;
    // Until the file and the player are here a failure is the server's, then
    // the file's.
    let downloaded = false;
    try {
      const size = await this.readSize();
      const url = await this.contents.getDownloadUrl(this.context.path);
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      this.showDetails();
      // The bar under the waveform plays the file, not the browser's control.
      this.media.controls = false;
      const large = !drawsWaveform(size);
      this.view.hidden = large;
      // There is no waveform to zoom yet, so the buttons would do nothing.
      this.setZoomEnabled(false);
      if (large) {
        // Played from the file URL: seeking needs a server that answers byte
        // ranges, as the stock file handler does. The waveform is drawn from
        // the peaks of the server part, so the browser never downloads the
        // file.
        this.wavesurfer?.destroy();
        this.wavesurfer = null;
        this.playUrl(url);
        await this.drawPeaks(token);
        return;
      }
      // Fetched once and handed over as a blob: the player then seeks in
      // memory, also on a server that ignores byte ranges.
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const modules = await loadPlayer();
      downloaded = true;
      // A reload or a close while this one was fetching supersedes it.
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      // One player per tab: a new player would load the element's previous
      // source on its own, so a reload hands the existing one the new blob.
      this.wavesurfer ??= this.createPlayer(modules);
      // The file plays before the decode ends: the cover goes when it can, and
      // the spinner of the waveform stands in the waveform's place meanwhile.
      // A file the browser cannot play keeps the cover until its error.
      this.media.addEventListener(
        'loadedmetadata',
        () => {
          if (token === this.loads) {
            this.showMessage('');
            this.wave.hidden = true;
            this.showPeaks();
          }
        },
        { once: true }
      );
      // The player measures the waveform's width when it draws, right after
      // the decode, so the waveform shows again first.
      this.wavesurfer.once('decode', () => {
        if (token === this.loads) {
          this.peaks.hidden = true;
          this.wave.hidden = false;
          this.setZoomEnabled(true);
        }
      });
      await this.wavesurfer.loadBlob(blob);
      this.showMessage('');
    } catch (reason) {
      // AbortError: a newer load of the same player took over.
      if (
        !this.isDisposed &&
        token === this.loads &&
        (reason as Error).name !== 'AbortError'
      ) {
        if (downloaded) {
          // The element reads a file before wavesurfer decodes it, and reports
          // an unreadable one itself, so this file plays without a waveform,
          // from the bar under it.
          console.error('Audio viewer: the waveform was not drawn', reason);
          // The waveform box stays hidden, as above the limit.
          this.peaks.hidden = true;
          this.setZoomEnabled(false);
          this.showMessage(this.trans.__('The waveform could not be drawn.'));
        } else {
          this.fail(reason);
        }
      }
    }
  }

  protected fail(reason: unknown): void {
    // Emptied and kept, because a new player would load the element's previous
    // source on its own.
    this.wavesurfer?.empty();
    this.setZoomEnabled(false);
    this.view.textContent = '';
    super.fail(reason);
  }

  // Zoom and Loop, between Reload and the details on the toolbar.
  addControls(toolbar: Toolbar): void {
    const trans = this.trans;
    this.zoomButtons = addZoomButtons(
      toolbar,
      trans,
      () => this.zoomBy(0.5),
      () => this.zoomBy(2),
      () => this.zoomBy(0)
    );
    this.setZoomEnabled(this.zoomEnabled);
    this.loopButton = new ToolbarButton({
      label: trans.__('Loop'),
      tooltip: trans.__('Loop the selected region, or the whole file'),
      noFocusOnClick: true,
      onClick: () => this.setLoop(!this.looping)
    });
    toolbar.addItem('advanced-loop', this.loopButton);
  }

  // Multiply the shown time scale by `factor`; 0 fits the whole file. The
  // waveform never zooms out past the fit.
  zoomBy(factor: number): void {
    const ws = this.wavesurfer;
    const duration = ws?.getDuration();
    if (!ws?.getDecodedData() || !duration) {
      return;
    }
    // The level comes from wavesurfer's own setting, not from the wrapper
    // width: the wrapper keeps the previous zoom's width until its next
    // render, so a click right after a fit or a wheel zoom would start from
    // the old level. 0 fits the file.
    ws.zoom(
      factor ? (ws.options.minPxPerSec || ws.getWidth() / duration) * factor : 0
    );
  }

  // Loop on repeats the region, or the whole file without one; loop off
  // removes the region.
  setLoop(on: boolean): void {
    this.looping = on;
    if (!on && this.region) {
      this.region.remove();
      this.region = null;
    }
    this.media.loop = on && !this.region;
    if (this.loopButton) {
      this.loopButton.pressed = on;
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.themeObserver.disconnect();
    // Revokes the blob URL it made for the media element.
    this.wavesurfer?.destroy();
    this.wavesurfer = null;
    this.peaksRequest.abort();
    super.dispose();
  }

  // The file plays with the seek slider while the peaks are on their way, and
  // the waveform takes over when they arrive. Without them the tab stays so,
  // with a sentence.
  private async drawPeaks(token: number): Promise<void> {
    this.showPeaks();
    let failure: unknown;
    const answer = await Promise.all([loadPlayer(), this.fetchPeaks()]).catch(
      (reason: unknown) => {
        // A request aborted by dispose() is no failure.
        if (!this.isDisposed) {
          console.error('Audio viewer: the waveform was not drawn', reason);
        }
        failure = reason;
        return null;
      }
    );
    // A reload or a close while the peaks were on their way supersedes them.
    if (this.isDisposed || token !== this.loads) {
      return;
    }
    this.peaks.hidden = true;
    if (answer) {
      const [modules, { sourceChannels, ...peaks }] = answer;
      this.sourceChannels = sourceChannels;
      this.wavesurfer = this.createPlayer(modules, peaks);
      this.view.hidden = false;
      this.setZoomEnabled(true);
      return;
    }
    // The metadata clears the message line, so the sentence waits for it. A
    // file that does not play keeps its own sentence.
    if (!this.media.readyState) {
      await new Promise(resolve =>
        this.media.addEventListener('loadedmetadata', resolve, { once: true })
      );
      if (this.isDisposed || token !== this.loads) {
        return;
      }
    }
    if (!this.media.error) {
      this.showMessage(
        this.reloadSentence(failure) ??
          this.trans.__('The waveform could not be drawn.')
      );
    }
  }

  // The peaks of the open file from the server part, asked with the lab's
  // authentication. The path has no drive prefix, as the server reads it.
  private async fetchPeaks(): Promise<{
    peaks: Float32Array[];
    duration: number;
    sourceChannels: number | undefined;
  }> {
    const settings = this.contents.serverSettings;
    const response = await ServerConnection.makeRequest(
      URLExt.join(
        settings.baseUrl,
        'jupyterlab-advanced-image-viewer-extension',
        'waveform'
      ) +
        URLExt.objectToQueryString({
          path: this.contents.localPath(this.context.path)
        }),
      { signal: this.peaksRequest.signal },
      settings
    );
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const duration = Number(response.headers.get('X-Waveform-Duration'));
    const channels = Number(response.headers.get('X-Waveform-Channels'));
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      peaks: readPeaks(bytes, duration, channels),
      duration,
      // The file's own channel count, before the server mixes more than two
      // down to two.
      sourceChannels:
        Number(response.headers.get('X-Waveform-Source-Channels')) || undefined
    };
  }

  // The spinner in the waveform's place, with its line.
  private showPeaks(): void {
    this.peaks.hidden = false;
    announce(this.drawing, this.trans.__('Drawing the waveform...'));
  }

  private setZoomEnabled(on: boolean): void {
    this.zoomEnabled = on;
    if (this.zoomButtons) {
      this.zoomButtons.zoomOut.enabled = on;
      this.zoomButtons.zoomIn.enabled = on;
      this.zoomButtons.fit.enabled = on;
    }
  }

  private createPlayer(
    [
      { default: Player },
      { default: Minimap },
      { default: Timeline },
      { default: Hover },
      { default: Regions },
      { default: Zoom }
    ]: Awaited<ReturnType<typeof loadPlayer>>,
    // The server's peaks of a file over the limit. A player made for an element
    // with a source downloads that source to decode it, unless it has them.
    peaks?: { peaks: Float32Array[]; duration: number }
  ): WaveSurfer {
    this.createMinimap = () =>
      Minimap.create({
        ...this.colours(),
        cursorColor: 'var(--jp-ui-font-color0)',
        height: 44,
        dragToSeek: true,
        insertPosition: 'beforebegin',
        overlayColor:
          'color-mix(in srgb, var(--jp-brand-color1) 15%, transparent)'
      });
    this.minimap = this.createMinimap();
    const regions = Regions.create();
    const ws = Player.create({
      container: this.wave,
      media: this.media,
      height: 200,
      ...this.colours(),
      ...peaks,
      cursorColor: 'var(--jp-ui-font-color0)',
      cursorWidth: 2,
      plugins: [
        this.minimap,
        Timeline.create({
          height: 18,
          insertPosition: 'beforebegin',
          formatTimeCallback: (seconds: number) => formatTime(seconds, 0),
          style: { color: 'var(--jp-ui-font-color1)' },
          // The ticks and secondary labels are drawn at this opacity over the
          // colour above. The labels are text, so WCAG 1.4.3 asks 4.5:1: 0.65
          // gives about 5.1:1 on the light panel and 6.5:1 on the dark one.
          secondaryLabelOpacity: 0.65
        }),
        Hover.create({
          lineColor: 'var(--jp-ui-font-color2)',
          labelColor: 'var(--jp-ui-font-color0)',
          labelBackground: 'var(--jp-layout-color3)',
          formatTimeCallback: (seconds: number) => formatTime(seconds)
        }),
        regions,
        Zoom.create()
      ]
    });
    regions.enableDragSelection(
      {
        color: 'color-mix(in srgb, var(--jp-brand-color1) 20%, transparent)',
        minLength: MIN_LOOP
      },
      DRAG_THRESHOLD
    );
    // One loop region at a time: a new drag replaces the old one.
    regions.on('region-created', region => {
      // wavesurfer stretches a shorter drag to exactly minLength instead of
      // dropping it; the small margin covers the float error of that sum.
      if (region.end - region.start < MIN_LOOP + 0.01) {
        ws.setTime(region.start);
        region.remove();
        return;
      }
      regions
        .getRegions()
        .filter(other => other !== region)
        .forEach(other => other.remove());
      this.region = region;
      this.labelRegion();
      this.setLoop(true);
    });
    regions.on('region-updated', () => this.labelRegion());
    // Return to the region start when playback runs over its end, not when
    // the user seeks past it.
    ws.on('timeupdate', time => {
      const r = this.region;
      if (
        this.looping &&
        r &&
        ws.isPlaying() &&
        this.last >= r.start &&
        this.last < r.end &&
        time >= r.end
      ) {
        ws.setTime(r.start);
        time = r.start;
      }
      this.last = time;
    });
    ws.on('seeking', time => (this.last = time));
    for (const event of ['zoom', 'scroll', 'redrawcomplete'] as const) {
      ws.on(event, () => this.showView());
    }
    // Emptying the player also decodes, with no file to tell about.
    ws.on('decode', () => {
      if (this.media.hasAttribute('src')) {
        this.showDetails();
      }
    });
    return ws;
  }

  private colours(): { waveColor: string; progressColor: string } {
    const style = getComputedStyle(document.body);
    return {
      // The waveform is graphical content and WCAG 1.4.11 asks 3:1, which
      // this grey clears on both themes. It is opaque: the played part is
      // drawn inside the unplayed shape and takes its alpha.
      waveColor: style.getPropertyValue('--jp-layout-color4').trim(),
      progressColor: style.getPropertyValue('--jp-brand-color1').trim()
    };
  }

  private paint(): void {
    const ws = this.wavesurfer;
    if (!ws || !this.minimap || !this.createMinimap) {
      return;
    }
    // The overview copies its colours when it is made, so it is made anew,
    // before the redraw of setOptions, which sizes its frame.
    ws.unregisterPlugin(this.minimap);
    this.minimap = ws.registerPlugin(this.createMinimap());
    ws.setOptions(this.colours());
  }

  private labelRegion(): void {
    const r = this.region;
    r?.setContent(
      this.trans.__('Loop %1 - %2', formatTime(r.start), formatTime(r.end))
    );
  }

  private showTime(): void {
    const { currentTime, duration } = this.media;
    this.time.textContent = formatTime(currentTime);
    this.length.textContent = formatTime(duration);
    // The maximum first, so the value is not clamped to the old one.
    this.seek.max = String(Number.isFinite(duration) ? duration : 0);
    this.seek.value = String(currentTime);
    this.seek.setAttribute(
      'aria-valuetext',
      this.trans.__(
        '%1 of %2',
        formatTime(currentTime, 0),
        formatTime(duration, 0)
      )
    );
  }

  // A button under the waveform. The press leaves the focus on the viewer, as
  // noFocusOnClick does on the toolbar, so Space, Left and Right still act on
  // the viewer after a click.
  private button(
    icon: LabIcon,
    label: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = part('button', 'button');
    button.type = 'button';
    setIcon(button, icon, label);
    button.addEventListener('mousedown', event => {
      event.preventDefault();
      this.node.focus({ preventScroll: true });
    });
    button.addEventListener('click', onClick);
    return button;
  }

  private showView(): void {
    const ws = this.wavesurfer;
    const duration = ws?.getDuration();
    if (!ws || !duration) {
      return;
    }
    // From the zoom level, not the rendered width: on the zoom event the
    // wrapper still has its old width.
    const width = ws.getWidth();
    const pxPerSec = Math.max(ws.options.minPxPerSec, width / duration);
    const shown = Math.min(width / pxPerSec, duration);
    const start = Math.min(ws.getScroll() / pxPerSec, duration - shown);
    this.view.textContent = this.trans.__(
      'showing %1 - %2',
      formatTime(start),
      formatTime(start + shown)
    );
  }

  private showDetails(): void {
    const channels =
      this.sourceChannels ??
      this.wavesurfer?.getDecodedData()?.numberOfChannels;
    this.setDetails(
      channels === undefined
        ? []
        : [
            channels === 1
              ? this.trans.__('mono')
              : channels === 2
                ? this.trans.__('stereo')
                : this.trans.__('%1 channels', channels)
          ]
    );
  }

  private wave: HTMLElement;
  private peaks: HTMLElement;
  private drawing: HTMLElement;
  // The channels of a file over the limit, from the server.
  private sourceChannels: number | undefined;
  private time: HTMLElement;
  private view: HTMLElement;
  private seek: HTMLInputElement;
  private length: HTMLElement;
  private themeObserver: MutationObserver;
  // Aborted only when the viewer closes, as on Page Up, Page Down or a tab
  // close: the closed request tells the server nobody waits for the peaks. A
  // Reload keeps it, so its new request joins the decode under way.
  private peaksRequest = new AbortController();
  private minimap: GenericPlugin | null = null;
  private createMinimap: (() => GenericPlugin) | null = null;
  private region: Region | null = null;
  private looping = false;
  private loopButton: ToolbarButton | null = null;
  private zoomButtons: ReturnType<typeof addZoomButtons> | null = null;
  // Kept here too, so a load that finishes before addControls() disables the
  // buttons when they are made.
  private zoomEnabled = true;
  // Playback time at the previous update, to tell a run over the region end
  // from a seek.
  private last = 0;
}
