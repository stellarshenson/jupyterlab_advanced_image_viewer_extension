// Mesh viewer: the document widget of one mesh file, with its messages, its
// read-out and its toolbar actions. All three.js code is in meshscene.ts, which
// loads when the first mesh file opens, not at start-up.

import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { Contents } from '@jupyterlab/services';

import { TranslationBundle } from '@jupyterlab/translation';

import type { CommandRegistry } from '@lumino/commands';

import { Menu, Widget } from '@lumino/widgets';

import { formatSize } from './mediautil';

import {
  gridIcon,
  lightingIcon,
  orthographicIcon,
  shadingIcon,
  viewsIcon,
  wireframeIcon
} from './icons';

import type { IMeshStats, MeshScene } from './meshscene';

import {
  exceedsMeshLimit,
  formatDimensions,
  MESH_LIGHTING,
  MESH_LIMIT,
  meshFormat,
  MESH_VIEWS,
  MeshLighting
} from './meshutil';

// The commands of the Views and Lighting menus; registered in src/index.ts.
export const LIGHTING_COMMAND = 'advanced-mesh-viewer:lighting';
export const VIEW_COMMAND = 'advanced-mesh-viewer:view';

export class MeshViewer extends Widget {
  constructor(options: MeshViewer.IOptions) {
    super();
    this.addClass('jp-AdvancedMeshViewer');
    // Focusable, so the main area focuses the viewer on activation and the
    // keys reach it; a pointer press does the same, also after a drag.
    this.node.tabIndex = 0;
    this.node.addEventListener('pointerdown', () => this.node.focus());
    // A right drag pans, so JupyterLab's context menu stays closed.
    this.node.dataset.jpSuppressContextMenu = '';
    this.context = options.context;
    this.contents = options.contents;
    this.trans = options.trans;
    this.message = document.createElement('div');
    this.message.className = 'jp-AdvancedMediaViewer-message';
    this.message.setAttribute('role', 'status');
    this.details = document.createElement('span');
    this.details.className = 'jp-AdvancedMediaViewer-details';
    this.node.append(this.message);
    this.shading = new ToolbarButton({
      icon: shadingIcon,
      tooltip: this.trans.__('Turn the smooth shading on'),
      pressedTooltip: this.trans.__(
        'Turn the shading off and show the flat facets'
      ),
      className: 'jp-AdvancedMeshViewer-toggle',
      noFocusOnClick: true,
      pressed: true,
      onClick: () => this.applyShading()
    });
    this.wireframe = new ToolbarButton({
      icon: wireframeIcon,
      tooltip: this.trans.__('Show the triangle edges instead of the surface'),
      pressedTooltip: this.trans.__(
        'Show the surface instead of the triangle edges'
      ),
      className: 'jp-AdvancedMeshViewer-toggle',
      noFocusOnClick: true,
      onClick: () => this.applyShading()
    });
    this.grid = new ToolbarButton({
      icon: gridIcon,
      tooltip: this.trans.__('Show the ground grid'),
      pressedTooltip: this.trans.__('Hide the ground grid'),
      className: 'jp-AdvancedMeshViewer-toggle',
      noFocusOnClick: true,
      onClick: () => this.scene?.setGrid(this.grid.pressed)
    });
    this.orthographic = new ToolbarButton({
      icon: orthographicIcon,
      tooltip: this.trans.__('Show the model in orthographic projection'),
      pressedTooltip: this.trans.__('Show the model in perspective'),
      className: 'jp-AdvancedMeshViewer-toggle',
      noFocusOnClick: true,
      onClick: () => this.scene?.setProjection(this.orthographic.pressed)
    });
    // ToolbarButton has no menu prop, so the menus are opened beside it.
    this.viewsMenu = new Menu({ commands: options.commands });
    for (const view of MESH_VIEWS) {
      this.viewsMenu.addItem({
        command: VIEW_COMMAND,
        args: { name: view.name }
      });
    }
    this.lightingMenu = new Menu({ commands: options.commands });
    for (const style of MESH_LIGHTING) {
      this.lightingMenu.addItem({
        command: LIGHTING_COMMAND,
        args: { style: style.name }
      });
    }
    this.views = new ToolbarButton({
      icon: viewsIcon,
      tooltip: this.trans.__('Choose a standard view'),
      noFocusOnClick: true,
      onClick: () => this.openMenu(this.viewsMenu, this.views)
    });
    this.lightingButton = new ToolbarButton({
      icon: lightingIcon,
      tooltip: this.trans.__('Choose the lighting style'),
      noFocusOnClick: true,
      onClick: () => this.openMenu(this.lightingMenu, this.lightingButton)
    });
    // Escape and a choice both close a menu; the button takes the focus back.
    this.viewsMenu.aboutToClose.connect(() => this.focusButton(this.views));
    this.lightingMenu.aboutToClose.connect(() =>
      this.focusButton(this.lightingButton)
    );
    void this.context.ready.then(() => this.load());
  }

  readonly context: DocumentRegistry.Context;
  // Toolbar read-out of the format, the triangle count, the dimensions and the
  // file size.
  readonly details: HTMLElement;
  // Null before the first file is read.
  scene: MeshScene | null = null;
  // The lighting style in force; the Lighting command checks it.
  lighting: MeshLighting = 'studio';

  // Read the file (again) and show it. A reload keeps the camera while the new
  // model can be seen from it.
  async load(): Promise<void> {
    const token = ++this.loads;
    // A reload or a close while this one runs supersedes it, and stops a STEP
    // read that is still in its worker.
    this.read?.abort();
    const read = (this.read = new AbortController());
    // A reload or a close while this one runs supersedes it.
    const stale = () => this.isDisposed || token !== this.loads;
    const trans = this.trans;
    const path = this.context.path;
    this.showMessage(trans.__('Loading...'));
    // Up to the end of the download a failure is the server's, then the file's.
    let failure = trans.__('This file cannot be read from the server.');
    // Duplicated from the media viewer rather than imported, so this chunk
    // does not pull in that module: a page left open across an install asks
    // for chunks that no longer exist, and only a page reload helps.
    const outdated = trans.__(
      'This viewer was updated; reload the page to use it.'
    );
    try {
      // The document context drops the size from the file model.
      const { size } = await this.contents.get(path, { content: false });
      if (stale()) {
        return;
      }
      if (exceedsMeshLimit(size ?? 0)) {
        this.fail(
          trans.__(
            'This file is over the %1 GiB limit of the mesh viewer, so it was not downloaded.',
            MESH_LIMIT / 1024 / 1024 / 1024
          )
        );
        return;
      }
      const format = meshFormat(path);
      if (!format) {
        this.fail(failure);
        return;
      }
      const { MeshScene, readModel, read3mf } = await import('./meshscene');
      if (stale()) {
        return;
      }
      failure = trans.__(
        'This file cannot be read, because it is damaged or is not a mesh file of this type.'
      );
      const url = await this.contents.getDownloadUrl(path);
      let result;
      if (format.name === '3mf') {
        // The one reader that needs the DOM, so it stays on this thread.
        const response = await fetch(url, { signal: read.signal });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const data = await response.arrayBuffer();
        if (stale()) {
          return;
        }
        if (!data.byteLength) {
          this.fail(trans.__('This file is empty.'));
          return;
        }
        result = read3mf(data);
      } else {
        result = await readModel(format.name, url, read.signal);
      }
      if (stale()) {
        return;
      }
      if (result && 'compression' in result) {
        this.fail(
          trans.__(
            'This file uses %1 compression, which the mesh viewer does not support.',
            result.compression
          )
        );
        return;
      }
      if (result && 'error' in result) {
        this.fail(
          result.error === 'asset'
            ? outdated
            : result.error === 'download'
              ? trans.__('This file cannot be read from the server.')
              : result.error === 'empty'
                ? trans.__('This file is empty.')
                : failure
        );
        return;
      }
      if (!result || !('read' in result)) {
        this.fail(failure);
        return;
      }
      this.scene ??= new MeshScene(this.node, format.up, () =>
        this.showMessage(
          trans.__(
            'The graphics context was lost, so press the refresh icon to show the model again.'
          )
        )
      );
      const stats = this.scene.setModel(result.read);
      if (!stats) {
        this.fail(trans.__('This file holds no geometry to show.'));
        return;
      }
      this.applyDisplay();
      this.showDetails(format.name, stats, size ?? 0);
      this.showMessage('');
      this.showModel();
    } catch (reason) {
      if (!stale()) {
        console.error('Mesh viewer: the file was not shown', reason);
        const name = (reason as Error)?.name;
        this.fail(
          name === 'ChunkLoadError' || name === 'WorkerLoadError'
            ? outdated
            : failure
        );
      }
    }
  }

  // The display buttons, between the zoom buttons and the details on the
  // toolbar.
  addControls(toolbar: Toolbar): void {
    toolbar.addItem('advanced-shading', this.shading);
    toolbar.addItem('advanced-wireframe', this.wireframe);
    toolbar.addItem('advanced-grid', this.grid);
    toolbar.addItem('advanced-orthographic', this.orthographic);
    toolbar.addItem('advanced-views', this.views);
    toolbar.addItem('advanced-lighting', this.lightingButton);
  }

  zoom(scale: number): void {
    this.scene?.zoom(scale);
  }

  // The standard views and the lighting styles, run by the toolbar menus.
  setView(name: string): void {
    this.scene?.setView(name);
  }

  setLighting(style: MeshLighting): void {
    this.lighting = style;
    this.scene?.setLighting(style);
  }

  // Folder navigation opens each file in a new viewer, which keeps the display
  // state of the one before it.
  takeDisplay(previous: MeshViewer): void {
    this.shading.pressed = previous.shading.pressed;
    this.wireframe.pressed = previous.wireframe.pressed;
    this.grid.pressed = previous.grid.pressed;
    this.orthographic.pressed = previous.orthographic.pressed;
    this.lighting = previous.lighting;
    this.applyDisplay();
  }

  fitModel(): void {
    this.scene?.fit();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.read?.abort();
    this.viewsMenu.dispose();
    this.lightingMenu.dispose();
    this.scene?.dispose();
    this.scene = null;
    super.dispose();
  }

  // A hidden tab holds no WebGL context.
  protected onBeforeHide(): void {
    this.scene?.detach();
  }

  protected onAfterShow(): void {
    this.showModel();
  }

  private showModel(): void {
    if (!this.scene?.model || !this.isVisible) {
      return;
    }
    try {
      this.scene.attach();
      this.showMessage('');
    } catch (reason) {
      console.error('Mesh viewer: no WebGL renderer', reason);
      this.showMessage(
        this.trans.__(
          'WebGL is not available in this browser, so the model cannot be shown.'
        )
      );
    }
  }

  private applyShading(): void {
    this.scene?.setShading(!this.shading.pressed, this.wireframe.pressed);
  }

  // Every display state the viewer holds, in one place, so a new file and a
  // reload show the same view as the one before.
  private applyDisplay(): void {
    this.applyShading();
    this.scene?.setLighting(this.lighting);
    this.scene?.setGrid(this.grid.pressed);
    this.scene?.setProjection(this.orthographic.pressed);
  }

  private openMenu(menu: Menu, button: ToolbarButton): void {
    // ToolbarButton has toggled its pressed state for this click; a menu
    // button is not a toggle.
    button.pressed = false;
    const rect = button.node.getBoundingClientRect();
    menu.open(rect.left, rect.bottom);
  }

  private focusButton(button: ToolbarButton): void {
    const host = button.node.querySelector<HTMLElement>('jp-button');
    // The toolbar keeps one item tabbable and moves the focus into that item
    // when the focus enters from outside, so make this button that item first.
    const toolbar = button.node.parentElement as HTMLElement & {
      activeIndex: number;
      focusableElements: HTMLElement[];
    };
    const index = host ? toolbar.focusableElements.indexOf(host) : -1;
    if (index >= 0) {
      toolbar.activeIndex = index;
    }
    host?.shadowRoot?.querySelector('button')?.focus();
  }

  private showDetails(format: string, stats: IMeshStats, bytes: number): void {
    // _n puts the number itself in %1, so the formatted one is %2.
    const count = (stats.triangles || stats.points).toLocaleString('en-US');
    this.details.textContent = [
      format.toUpperCase(),
      stats.triangles
        ? this.trans._n('%2 triangle', '%2 triangles', stats.triangles, count)
        : this.trans._n('%2 point', '%2 points', stats.points, count),
      formatDimensions(stats.size),
      formatSize(bytes)
    ].join(' · ');
  }

  private fail(sentence: string): void {
    this.scene?.clearModel();
    this.details.textContent = '';
    this.showMessage(sentence);
  }

  private showMessage(text: string): void {
    this.message.textContent = text;
  }

  private readonly contents: Contents.IManager;
  private readonly trans: TranslationBundle;
  private readonly message: HTMLElement;
  private readonly shading: ToolbarButton;
  private readonly wireframe: ToolbarButton;
  private readonly grid: ToolbarButton;
  private readonly orthographic: ToolbarButton;
  private readonly views: ToolbarButton;
  private readonly lightingButton: ToolbarButton;
  private readonly viewsMenu: Menu;
  private readonly lightingMenu: Menu;
  // The read the current load waits on, so a reload or a close stops it.
  private read: AbortController | null = null;
  // Counts load() calls, so a superseded load stops before it shows its file.
  private loads = 0;
}

export namespace MeshViewer {
  export interface IOptions {
    context: DocumentRegistry.Context;
    contents: Contents.IManager;
    commands: CommandRegistry;
    trans: TranslationBundle;
  }
}
