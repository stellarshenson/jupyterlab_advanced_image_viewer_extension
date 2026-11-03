import {
  exceedsMeshLimit,
  formatDimensions,
  MESH_FORMATS,
  MESH_LIGHTING,
  MESH_LIMIT,
  meshFormat,
  MESH_VIEWS,
  meshViewDirection
} from '../meshutil';

// ACC-MESH-104-VIEWS: ten named directions per up axis.
describe('the standard views', () => {
  it('holds ten named views', () => {
    expect(MESH_VIEWS.map(view => view.name)).toEqual([
      'Front',
      'Back',
      'Right',
      'Left',
      'Top',
      'Bottom',
      'Front-Left',
      'Front-Right',
      'Back-Left',
      'Back-Right'
    ]);
  });

  it('gives a unit direction for each view on each up axis', () => {
    for (const view of MESH_VIEWS) {
      for (const up of ['z', 'y'] as const) {
        const direction = meshViewDirection(view.name, up);
        expect(direction).toBeDefined();
        expect(Math.hypot(...direction!)).toBeCloseTo(1, 12);
      }
    }
  });

  it('puts each axis view on its axis and each corner view on three axes', () => {
    expect(meshViewDirection('Front', 'z')).toEqual([0, -1, 0]);
    expect(meshViewDirection('Front', 'y')).toEqual([0, 0, 1]);
    expect(meshViewDirection('Back', 'z')).toEqual([0, 1, 0]);
    expect(meshViewDirection('Right', 'y')).toEqual([1, 0, 0]);
    expect(meshViewDirection('Left', 'y')).toEqual([-1, 0, 0]);
    expect(meshViewDirection('Top', 'z')).toEqual([0, 0, 1]);
    expect(meshViewDirection('Bottom', 'y')).toEqual([0, -1, 0]);
    for (const up of ['z', 'y'] as const) {
      for (const name of [
        'Front-Left',
        'Front-Right',
        'Back-Left',
        'Back-Right'
      ]) {
        const direction = meshViewDirection(name, up)!;
        expect(direction.every(value => Math.abs(value) > 0.5)).toBe(true);
      }
    }
  });

  it('finds nothing for a name the table does not hold', () => {
    expect(meshViewDirection('Sideways', 'z')).toBeUndefined();
    expect(meshViewDirection('Sideways', 'y')).toBeUndefined();
  });
});

// ACC-MESH-101-LIGHTS: the three styles and the lights each parents.
describe('the lighting styles', () => {
  it('holds Studio, Neutral and Three-point, with Studio the lit environment', () => {
    expect(
      MESH_LIGHTING.map(style => [
        style.name,
        style.label,
        style.environment,
        style.lights.length
      ])
    ).toEqual([
      ['studio', 'Studio', true, 1],
      ['neutral', 'Neutral', false, 2],
      ['three-point', 'Three-point', false, 3]
    ]);
  });

  it('names each light with its intensity and parent', () => {
    const rig = (name: string) =>
      MESH_LIGHTING.find(style => style.name === name)!.lights.map(light => [
        light.name,
        light.intensity,
        light.parent
      ]);
    expect(rig('studio')).toEqual([['cameraLight', 2.9, 'camera']]);
    expect(rig('neutral')).toEqual([
      ['cameraLight', 1.5, 'camera'],
      ['hemisphere', 4, 'scene']
    ]);
    expect(rig('three-point')).toEqual([
      ['key', 6, 'camera'],
      ['fill', 3, 'camera'],
      ['rim', 0.6, 'camera']
    ]);
  });
});

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

// ACC-MESH-87-READOUT: three extents with no unit.
describe('formatDimensions', () => {
  it('reads three extents with one decimal for a model of ordinary size', () => {
    expect(formatDimensions([12.4, 8, 3.1])).toBe('12.4 × 8.0 × 3.1');
    expect(formatDimensions([200, 3, 0.5])).toBe('200.0 × 3.0 × 0.5');
    expect(formatDimensions([1234.56, 10, 1])).toBe('1234.6 × 10.0 × 1.0');
  });

  it('keeps three significant digits of a small model', () => {
    expect(formatDimensions([1.24, 0.8, 0.31])).toBe('1.24 × 0.80 × 0.31');
    expect(formatDimensions([0.0124, 0.008, 0.001])).toBe(
      '0.0124 × 0.0080 × 0.0010'
    );
  });

  // toFixed throws above 100 decimals, and log10(0) is -Infinity.
  it('does not throw at the extremes', () => {
    expect(formatDimensions([0, 0, 0])).toBe('0.0 × 0.0 × 0.0');
    expect(formatDimensions([1e-30, 0, 0])).toBe(
      '0.00000000000000000000 × 0.00000000000000000000 × 0.00000000000000000000'
    );
  });
});
