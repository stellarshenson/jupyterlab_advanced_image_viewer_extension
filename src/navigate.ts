// Folder navigation shared by the image viewer (Left / Right) and the media
// viewers (Page Up / Page Down): open the previous or next file of the same
// kind in the order the file browser lists the folder, inside one tab.

import { JupyterFrontEnd } from '@jupyterlab/application';

import { IWidgetTracker } from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { DirListing, IDefaultFileBrowser } from '@jupyterlab/filebrowser';

// The path one step from `path` in the ordered `paths`, or null at either end,
// for a folder of one file, and for a path that is not in the list.
export function stepPath(
  paths: string[],
  path: string,
  delta: number
): string | null {
  const idx = paths.indexOf(path);
  const target = idx + (delta < 0 ? -1 : 1);
  if (idx === -1 || target < 0 || target >= paths.length) {
    return null;
  }
  return paths[target];
}

export async function navigate(
  app: JupyterFrontEnd,
  fileBrowser: IDefaultFileBrowser | null,
  tracker: IWidgetTracker<IDocumentWidget>,
  extensions: Set<string>,
  factory: string,
  delta: number
): Promise<void> {
  const widget = tracker.currentWidget;
  if (!widget) {
    return;
  }
  const path = widget.context.path;
  const dirPath = PathExt.dirname(path);
  const accept = (item: { name: string; type: string }): boolean =>
    item.type === 'file' &&
    extensions.has(PathExt.extname(item.name).toLowerCase());
  // Step through the files in the order the file browser shows them when it
  // lists this folder, so its sort key, its direction and any sort plugin
  // decide what comes next: a C-locale sort puts '.' before '_' where
  // localeCompare puts '_' first, and a re-sort here skipped files.
  // FileBrowser keeps `listing` protected, but it is the only source of the
  // displayed order. The listing re-sorts on a refresh only while it is
  // visible, so a hidden one is re-sorted here; re-sorting a visible one would
  // re-render every row on each step. Otherwise fall back to natural name
  // order, the stock file browser default.
  let files: Array<{ name: string; path: string; type: string }> = [];
  if (fileBrowser && fileBrowser.model.path === dirPath) {
    const shown = (fileBrowser as unknown as { listing: DirListing }).listing;
    if (!shown.isVisible) {
      shown.sort(shown.sortState);
    }
    files = Array.from(shown.sortedItems()).filter(accept);
  }
  if (!files.some(item => item.path === path)) {
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
    files = content.filter(accept).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    );
  }
  const target = stepPath(
    files.map(item => item.path),
    path,
    delta
  );
  if (!target) {
    return;
  }
  // Advance within a single viewer: open the next file, then close the
  // previous one. Each file is bound to its own DocumentWidget, so an
  // in-place file swap is not possible; opening and disposing the previous
  // widget leaves one tab that advances.
  const previous = widget;
  await app.commands.execute('docmanager:open', { path: target, factory });
  if (!previous.isDisposed && previous !== tracker.currentWidget) {
    previous.dispose();
  }
}
