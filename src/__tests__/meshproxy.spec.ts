// ACC-MESH-107: the ladder's rungs are the source simplified, never moved, and
// each rung is built from the one above it.

import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

import type { IMeshPart } from '../meshworker';

import { LADDER_FLOOR, PROXY_MIN_PART, levelsOf, proxyOf } from '../meshproxy';

// A sphere of about 100,000 triangles, non-indexed like an STL, with per-corner
// normals and colours.
function spherePart(rows: number, columns: number): IMeshPart {
  const corners = rows * columns * 2 * 3;
  const position = new Float32Array(corners * 3);
  const normal = new Float32Array(corners * 3);
  const color = new Float32Array(corners * 3);
  const point = (row: number, column: number): [number, number, number] => {
    const phi = (row / rows) * Math.PI;
    const theta = (column / columns) * 2 * Math.PI;
    return [
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ];
  };
  let at = 0;
  const put = (row: number, column: number): void => {
    const [x, y, z] = point(row, column);
    position[at] = x;
    position[at + 1] = y;
    position[at + 2] = z;
    normal[at] = x;
    normal[at + 1] = y;
    normal[at + 2] = z;
    color[at] = (x + 1) / 2;
    color[at + 1] = (y + 1) / 2;
    color[at + 2] = (z + 1) / 2;
    at += 3;
  };
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      put(row, column);
      put(row + 1, column);
      put(row + 1, column + 1);
      put(row, column);
      put(row + 1, column + 1);
      put(row, column + 1);
    }
  }
  return {
    position,
    normal,
    color,
    uv: null,
    index: null,
    points: false,
    material: -1,
    tint: null
  };
}

const bitsOf = (values: Float32Array): Uint32Array =>
  new Uint32Array(values.buffer, values.byteOffset, values.length);

const corners = (positions: Float32Array): Set<string> => {
  const bits = bitsOf(positions);
  const set = new Set<string>();
  for (let at = 0; at < bits.length; at += 3) {
    set.add(`${bits[at]},${bits[at + 1]},${bits[at + 2]}`);
  }
  return set;
};

// How many of the rung's corners are corners of the input.
const carried = (positions: Float32Array, input: Float32Array): number => {
  const known = corners(input);
  const bits = bitsOf(positions);
  let found = 0;
  for (let at = 0; at < bits.length; at += 3) {
    if (known.has(`${bits[at]},${bits[at + 1]},${bits[at + 2]}`)) {
      found++;
    }
  }
  return found;
};

// The input's position and one attribute as one key per corner, so a rung's
// corner can be shown to carry exactly the input corner's value.
const pairs = (positions: Float32Array, values: Float32Array): Set<string> => {
  const source = bitsOf(positions);
  const value = bitsOf(values);
  const set = new Set<string>();
  for (let at = 0; at < source.length; at += 3) {
    set.add(
      `${source[at]},${source[at + 1]},${source[at + 2]}|` +
        `${value[at]},${value[at + 1]},${value[at + 2]}`
    );
  }
  return set;
};

// Every corner of the rung is an input corner and carries the input's normal
// and colour, so the simplifier never moved or recoloured a vertex.
const expectCopy = (proxy: IMeshPart, input: IMeshPart): void => {
  expect(proxy.normal).not.toBeNull();
  expect(proxy.color).not.toBeNull();
  expect(proxy.normal!.length).toBe(proxy.position.length);
  expect(proxy.color!.length).toBe(proxy.position.length);
  const normals = pairs(input.position, input.normal!);
  const colors = pairs(input.position, input.color!);
  const position = bitsOf(proxy.position);
  const normal = bitsOf(proxy.normal!);
  const color = bitsOf(proxy.color!);
  let carriedNormals = 0;
  let carriedColors = 0;
  for (let at = 0; at < position.length; at += 3) {
    const corner = `${position[at]},${position[at + 1]},${position[at + 2]}`;
    if (
      normals.has(`${corner}|${normal[at]},${normal[at + 1]},${normal[at + 2]}`)
    ) {
      carriedNormals++;
    }
    if (
      colors.has(`${corner}|${color[at]},${color[at + 1]},${color[at + 2]}`)
    ) {
      carriedColors++;
    }
  }
  expect(carriedNormals).toBe(position.length / 3);
  expect(carriedColors).toBe(position.length / 3);
};

const bounds = (positions: Float32Array): [number[], number[]] => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let at = 0; at < positions.length; at += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], positions[at + axis]);
      max[axis] = Math.max(max[axis], positions[at + axis]);
    }
  }
  return [min, max];
};

describe('the motion ladder', () => {
  beforeAll(async () => {
    await MeshoptSimplifier.ready;
  });

  it('chains level 2 from level 1 without moving a vertex', () => {
    const part = spherePart(224, 224);
    const sourceTriangles = part.position.length / 9;
    expect(sourceTriangles).toBeGreaterThan(100_000);

    const level1 = proxyOf(part, 25_000);
    expect(level1).not.toBeNull();
    const level1Triangles = level1!.position.length / 9;
    expect(level1Triangles).toBeLessThan(sourceTriangles);
    expect(Math.abs(level1Triangles - 25_000)).toBeLessThanOrEqual(250);

    // Level 2 is simplified from level 1's arrays, not from the full mesh.
    const level2 = proxyOf(level1!, 6_250);
    expect(level2).not.toBeNull();
    const level2Triangles = level2!.position.length / 9;
    expect(level2Triangles).toBeLessThan(level1Triangles);
    expect(Math.abs(level2Triangles - 6_250)).toBeLessThanOrEqual(62);

    expect(carried(level1!.position, part.position)).toBe(
      level1!.position.length / 3
    );
    expect(carried(level2!.position, level1!.position)).toBe(
      level2!.position.length / 3
    );
    expectCopy(level1!, part);
    expectCopy(level2!, level1!);

    const [sourceMin, sourceMax] = bounds(part.position);
    const [proxyMin, proxyMax] = bounds(level1!.position);
    for (let axis = 0; axis < 3; axis++) {
      expect(proxyMin[axis]).toBeGreaterThanOrEqual(sourceMin[axis]);
      expect(proxyMax[axis]).toBeLessThanOrEqual(sourceMax[axis]);
      // The rung covers the sphere's extents. A rung built from arbitrary
      // vertex triples collapses to a cap and fails this.
      const extent = sourceMax[axis] - sourceMin[axis];
      expect(proxyMin[axis]).toBeLessThanOrEqual(
        sourceMin[axis] + 0.02 * extent
      );
      expect(proxyMax[axis]).toBeGreaterThanOrEqual(
        sourceMax[axis] - 0.02 * extent
      );
    }
  }, 60000);

  it('builds no ladder below 150,000 or above 4,000,000 triangles', () => {
    expect(levelsOf(149_999)).toBeNull();
    expect(levelsOf(4_000_001)).toBeNull();
    expect(levelsOf(150_000)).toEqual([37_500, 10_000, 10_000, 10_000]);
    expect(levelsOf(1_000_000)).toEqual([250_000, 62_500, 15_625, 10_000]);
    expect(levelsOf(2_000_000)).toEqual([500_000, 125_000, 31_250, 10_000]);
    expect(levelsOf(4_000_000)).toEqual([1_000_000, 250_000, 62_500, 15_625]);
  });

  it('leaves a small part and a points cloud whole', () => {
    const small = spherePart(10, 10);
    expect(small.position.length / 9).toBeLessThan(PROXY_MIN_PART);
    expect(proxyOf(small, LADDER_FLOOR)).toBeNull();
    const points = { ...spherePart(40, 40), points: true };
    expect(points.position.length / 9).toBeGreaterThan(PROXY_MIN_PART);
    expect(proxyOf(points, LADDER_FLOOR)).toBeNull();
  });
});
