import {
  exceedsMeshLimit,
  MESH_FORMATS,
  MESH_LIMIT,
  meshFormat
} from '../meshformat';

// ACC-MESH-86-UP: the up axis of each format.
describe('the file type table', () => {
  it('holds every format with its extensions and up axis', () => {
    expect(
      MESH_FORMATS.map(format => [format.name, format.extensions, format.up])
    ).toEqual([
      ['stl', ['.stl'], 'z'],
      ['ply', ['.ply'], 'z'],
      ['3mf', ['.3mf'], 'z'],
      ['step', ['.step', '.stp'], 'z'],
      ['obj', ['.obj'], 'y'],
      ['glb', ['.glb'], 'y']
    ]);
  });

  it('finds the format of a path, in any case and after other dots', () => {
    expect(meshFormat('d/part.stl')?.name).toBe('stl');
    expect(meshFormat('d/PART.STL')?.name).toBe('stl');
    expect(meshFormat('d/part.v2.stp')?.name).toBe('step');
    expect(meshFormat('d/part.step')?.name).toBe('step');
    expect(meshFormat('d/part.glb')?.up).toBe('y');
  });

  it('finds nothing for another type or a path with no extension', () => {
    expect(meshFormat('d/part.txt')).toBeUndefined();
    expect(meshFormat('d/part')).toBeUndefined();
  });
});

// ACC-MESH-91-ERROR: a file over 1 GiB is refused; exactly 1 GiB is not.
describe('the size limit', () => {
  it('is 1 GiB', () => {
    expect(MESH_LIMIT).toBe(1073741824);
  });

  it('refuses only a file over the limit', () => {
    expect(exceedsMeshLimit(0)).toBe(false);
    expect(exceedsMeshLimit(MESH_LIMIT)).toBe(false);
    expect(exceedsMeshLimit(MESH_LIMIT + 1)).toBe(true);
  });
});
