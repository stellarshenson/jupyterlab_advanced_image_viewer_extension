// The mesh file types and the size limit, apart from meshutil.ts because
// src/index.ts registers the file types at activation and a module this small
// stays under the size jupyter/prefer-lazy-imports reports. It imports nothing.

// Above this size a file is refused before any of it is downloaded.
export const MESH_LIMIT = 1024 * 1024 * 1024;

export interface IMeshFormat {
  // The file type name; in capitals it is the format in the read-out.
  name: string;
  extensions: string[];
  mimeType: string;
  // The axis that points up in files of this format.
  up: 'y' | 'z';
}

export const MESH_FORMATS: IMeshFormat[] = [
  { name: 'stl', extensions: ['.stl'], mimeType: 'model/stl', up: 'z' },
  { name: 'ply', extensions: ['.ply'], mimeType: 'model/ply', up: 'z' },
  { name: '3mf', extensions: ['.3mf'], mimeType: 'model/3mf', up: 'z' },
  {
    name: 'step',
    extensions: ['.step', '.stp'],
    mimeType: 'model/step',
    up: 'z'
  },
  { name: 'obj', extensions: ['.obj'], mimeType: 'model/obj', up: 'y' },
  { name: 'glb', extensions: ['.glb'], mimeType: 'model/gltf-binary', up: 'y' }
];

export function meshFormat(path: string): IMeshFormat | undefined {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return MESH_FORMATS.find(format => format.extensions.includes(ext));
}

export function exceedsMeshLimit(size: number): boolean {
  return size > MESH_LIMIT;
}
