// Proves that the memory-bounded crease pass matches three's toCreasedNormals
// on the fixtures of ACC-MESH-82-SMOOTH and DEF-MESH-15-SEAMS.

import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';

import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { MESH_CREASE, meshCreasedNormals } from '../meshutil';

type Point = number[];

// The generators of ui-tests/tests/media_mesh.spec.ts, so the pass is proved on
// the same cube, globe and column the Galata tests measure.
const quad = (a: Point, b: Point, c: Point, d: Point): number[][] => [
  [...a, ...b, ...c],
  [...a, ...c, ...d]
];

const box = (x: number, y: number, z: number): number[][] => {
  const p = (i: number, j: number, k: number): Point => [
    (i * x) / 2,
    (j * y) / 2,
    (k * z) / 2
  ];
  return [
    ...quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)),
    ...quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)),
    ...quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)),
    ...quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)),
    ...quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)),
    ...quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1))
  ];
};

const globe = (rows: number, columns: number): number[][] => {
  const at = (row: number, column: number): Point => {
    const down = (Math.PI * row) / rows;
    const around = (2 * Math.PI * column) / columns;
    return [
      Math.sin(down) * Math.cos(around),
      Math.sin(down) * Math.sin(around),
      Math.cos(down)
    ];
  };
  const triangles: number[][] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      triangles.push(
        ...quad(
          at(row, column),
          at(row + 1, column),
          at(row + 1, column + 1),
          at(row, column + 1)
        )
      );
    }
  }
  return triangles;
};

const prism = (n: number): number[][] => {
  const ring = (i: number, z: number): Point => [
    Math.cos((2 * Math.PI * i) / n),
    Math.sin((2 * Math.PI * i) / n),
    z
  ];
  const triangles: number[][] = [];
  for (let i = 0; i < n; i++) {
    triangles.push(
      ...quad(ring(i, -1), ring(i + 1, -1), ring(i + 1, 1), ring(i, 1))
    );
  }
  return triangles;
};

// The largest difference of one normal component from three's own result. The
// pass runs on the float32 positions a file gives it, as the viewer does.
const difference = (triangles: number[][]): number => {
  const positions = new Float32Array(([] as number[]).concat(...triangles));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const reference = toCreasedNormals(geometry, MESH_CREASE).getAttribute(
    'normal'
  ) as BufferAttribute;
  const expected = reference.array;
  const actual = meshCreasedNormals(positions);
  expect(actual.length).toBe(expected.length);
  let largest = 0;
  for (let i = 0; i < actual.length; i++) {
    largest = Math.max(largest, Math.abs(actual[i] - expected[i]));
  }
  return largest;
};

describe('meshCreasedNormals', () => {
  test('matches toCreasedNormals on a cube, whose edges stay sharp', () => {
    expect(difference(box(1, 1, 1))).toBeLessThanOrEqual(1e-5);
  });

  test('matches toCreasedNormals on the 8x16 globe, whose facets round', () => {
    expect(difference(globe(8, 16))).toBeLessThanOrEqual(1e-5);
  });

  test('matches toCreasedNormals on an 8-sided column, whose edges stay sharp', () => {
    expect(difference(prism(8))).toBeLessThanOrEqual(1e-5);
  });
});
