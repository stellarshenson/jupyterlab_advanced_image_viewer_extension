// Audio viewer: the shared media widget with a wavesurfer.js waveform, an
// overview strip, a time ruler, the time under the mouse, a loop region and
// zoom. wavesurfer.js loads when the first audio file opens, not at start-up.

import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import {
  jumpBackIcon,
  jumpForwardIcon,
  pauseIcon,
  runIcon
} from '@jupyterlab/ui-components';

import { Widget } from '@lumino/widgets';

import type WaveSurfer from 'wavesurfer.js';

import type { GenericPlugin } from 'wavesurfer.js/dist/base-plugin.js';

import type { Region } from 'wavesurfer.js/dist/plugins/regions.js';

import { MediaViewer } from './media';

import {
  drawsWaveform,
  formatTime,
  SEEK_STEP,
  WAVEFORM_LIMIT
} from './mediautil';

import { addZoomButtons } from './toolbar';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// The shortest drag, in seconds, that makes a loop region: a click that
// moves a few pixels must not arm Loop on a sub-second region.
const MIN_LOOP = 1;

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
    this.wave = document.createElement('div');
    this.wave.className = 'jp-AdvancedMediaViewer-wave';
    const status = document.createElement('div');
    status.className = 'jp-AdvancedMediaViewer-status';
    this.time = document.createElement('span');
    this.view = document.createElement('span');
    status.append(this.time, this.view);
    this.node.prepend(this.wave, status);
    for (const type of ['timeupdate', 'durationchange', 'seeking', 'emptied']) {
      this.media.addEventListener(type, () => this.showTime());
    }
    this.media.addEventListener('durationchange', () => this.showDetails());
    // The waveform colours are painted on a canvas, which cannot read CSS
    // variables, so they are resolved here and again on every theme change.
    this.themeObserver = new MutationObserver(() => this.paint());
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-name']
    });
  }

  // The player of the waveform; null before the first one and above the
  // limit.
  wavesurfer: WaveSurfer | null = null;

  async load(): Promise<void> {
    const token = ++this.loads;
    this.setLoop(false);
    this.showMessage(this.trans.__('Loading...'));
    try {
      const size = await this.readSize();
      const url = await this.contents.getDownloadUrl(this.context.path);
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      this.showDetails();
      if (!drawsWaveform(size)) {
        // Played from the file URL: seeking needs a server that answers byte
        // ranges, as the stock file handler does.
        this.wavesurfer?.destroy();
        this.wavesurfer = null;
        // There is no waveform to zoom, so the buttons would do nothing.
        this.setZoomEnabled(false);
        this.media.controls = true;
        this.media.src = url;
        this.showMessage(
          this.trans.__(
            'The waveform is skipped for files over %1 MB.',
            WAVEFORM_LIMIT / 1024 / 1024
          )
        );
        return;
      }
      this.media.controls = false;
      this.setZoomEnabled(true);
      // Fetched once and handed over as a blob: the player then seeks in
      // memory, also on a server that ignores byte ranges.
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const modules = await loadPlayer();
      // A reload or a close while this one was fetching supersedes it.
      if (this.isDisposed || token !== this.loads) {
        return;
      }
      // One player per tab: a new player would load the element's previous
      // source on its own, so a reload hands the existing one the new blob.
      this.wavesurfer ??= this.createPlayer(modules);
      await this.wavesurfer.loadBlob(blob);
      this.showMessage('');
    } catch (reason) {
      // AbortError: a newer load of the same player took over.
      if (
        !this.isDisposed &&
        token === this.loads &&
        (reason as Error).name !== 'AbortError'
      ) {
        this.showMessage(
          this.trans.__('This file cannot be played: %1', String(reason))
        );
      }
    }
  }

  // The playback controls, zoom, loop and speed, between Reload and the
  // details on the toolbar.
  addControls(toolbar: Toolbar): void {
    const trans = this.trans;
    const play = new ToolbarButton({
      icon: runIcon,
      pressedIcon: pauseIcon,
      tooltip: trans.__('Play'),
      pressedTooltip: trans.__('Pause'),
      noFocusOnClick: true,
      onClick: () => this.togglePlay()
    });
    for (const type of ['play', 'pause', 'emptied']) {
      this.media.addEventListener(
        type,
        () => (play.pressed = !this.media.paused)
      );
    }
    toolbar.addItem('advanced-play', play);
    toolbar.addItem(
      'advanced-back',
      new ToolbarButton({
        icon: jumpBackIcon,
        tooltip: trans.__('Back %1 seconds', SEEK_STEP),
        noFocusOnClick: true,
        onClick: () => this.seekBy(-SEEK_STEP)
      })
    );
    toolbar.addItem(
      'advanced-forward',
      new ToolbarButton({
        icon: jumpForwardIcon,
        tooltip: trans.__('Forward %1 seconds', SEEK_STEP),
        noFocusOnClick: true,
        onClick: () => this.seekBy(SEEK_STEP)
      })
    );
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
    const speed = document.createElement('select');
    speed.className = 'jp-AdvancedMediaViewer-speed';
    speed.title = trans.__('Playback speed');
    for (const rate of SPEEDS) {
      speed.add(new Option(`${rate}×`, String(rate), rate === 1, rate === 1));
    }
    speed.addEventListener('change', () => {
      this.media.playbackRate = Number(speed.value);
    });
    toolbar.addItem('advanced-speed', new Widget({ node: speed }));
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
    super.dispose();
  }

  private setZoomEnabled(on: boolean): void {
    this.zoomEnabled = on;
    if (this.zoomButtons) {
      this.zoomButtons.zoomOut.enabled = on;
      this.zoomButtons.zoomIn.enabled = on;
      this.zoomButtons.fit.enabled = on;
    }
  }

  private createPlayer([
    { default: Player },
    { default: Minimap },
    { default: Timeline },
    { default: Hover },
    { default: Regions },
    { default: Zoom }
  ]: Awaited<ReturnType<typeof loadPlayer>>): WaveSurfer {
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
      cursorColor: 'var(--jp-ui-font-color0)',
      cursorWidth: 2,
      plugins: [
        this.minimap,
        Timeline.create({
          height: 18,
          insertPosition: 'beforebegin',
          formatTimeCallback: (seconds: number) => formatTime(seconds, 0),
          style: { color: 'var(--jp-ui-font-color2)' }
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
    regions.enableDragSelection({
      color: 'color-mix(in srgb, var(--jp-brand-color1) 20%, transparent)',
      minLength: MIN_LOOP
    });
    // One loop region at a time: a new drag replaces the old one.
    regions.on('region-created', region => {
      // wavesurfer stretches a shorter drag to exactly minLength instead of
      // dropping it; the small margin covers the float error of that sum.
      if (region.end - region.start < MIN_LOOP + 0.01) {
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
    ws.on('decode', () => this.showDetails());
    return ws;
  }

  private colours(): { waveColor: string; progressColor: string } {
    const style = getComputedStyle(document.body);
    return {
      // color3 is 2.68:1 on white; the waveform is graphical content and
      // WCAG 1.4.11 asks 3:1, which color2 clears.
      waveColor: style.getPropertyValue('--jp-ui-font-color2').trim(),
      progressColor: style.getPropertyValue('--jp-brand-color1').trim()
    };
  }

  private paint(): void {
    const ws = this.wavesurfer;
    if (!ws || !this.minimap || !this.createMinimap) {
      return;
    }
    ws.setOptions(this.colours());
    // The overview copies its colours when it is made, so it is made anew.
    ws.unregisterPlugin(this.minimap);
    this.minimap = ws.registerPlugin(this.createMinimap());
  }

  private labelRegion(): void {
    const r = this.region;
    r?.setContent(
      this.trans.__('Loop %1 - %2', formatTime(r.start), formatTime(r.end))
    );
  }

  private showTime(): void {
    this.time.textContent = `${formatTime(this.media.currentTime)} / ${formatTime(this.media.duration)}`;
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
    const channels = this.wavesurfer?.getDecodedData()?.numberOfChannels;
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
  private time: HTMLElement;
  private view: HTMLElement;
  private themeObserver: MutationObserver;
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
