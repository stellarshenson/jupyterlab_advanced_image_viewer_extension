// The motion ladder of a mesh model: each rung is the part simplified to a
// triangle budget, copied back as non-indexed arrays whose corners are the
// source's own, so simplification moves no vertex. ACC-MESH-107 draws one while
// the camera moves; the controller in meshscene.ts measures the drawn interval
// and picks the rung.

import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

import type { IMeshPart } from './meshworker';

// The triangle counts of the rungs: level 1 targets a quarter of the model and
// each level after it a quarter of the one before, down to the floor. The
// floor draws at the 60 Hz vsync, and 5,000 draws no faster while losing
// silhouette detail.
export const LADDER_FLOOR = 10_000;
export const LADDER_STEP = 4;
export const LADDER_DEPTH = 4;

// A model under this size draws at or near the bar without a proxy, and one
// over the cap would cost the rung's transient arrays against the 1 GiB budget
// (ACC-MESH-110), so both keep the full mesh.
export const LADDER_SOURCE_MIN = 150_000;
export const LADDER_SOURCE_MAX = 4_000_000;

// A part this small is left whole: simplifying it costs more than it saves.
export const PROXY_MIN_PART = 2_000;

// The relative error the simplifier may spend; a ceiling, not a target.
const PROXY_ERROR = 0.01;

// The triangles each rung targets, level 1 first, or null when the model gets
// no ladder.
export function levelsOf(triangles: number): number[] | null {
  if (triangles < LADDER_SOURCE_MIN || triangles > LADDER_SOURCE_MAX) {
    return null;
  }
  const levels: number[] = [];
  for (let level = 1; level <= LADDER_DEPTH; level++) {
    levels.push(
      Math.max(LADDER_FLOOR, Math.round(triangles / LADDER_STEP ** level))
    );
  }
  return levels;
}

// The simplifier must be ready. Returns null for a part that keeps its full
// geometry: a points cloud, a part under the minimum, or a failed simplify.
export function proxyOf(part: IMeshPart, target: number): IMeshPart | null {
  if (part.points || partTriangles(part) < PROXY_MIN_PART) {
    return null;
  }
  // The stride is in floats, not bytes: 3 components per position.
  const welded = part.index ? null : weld(part.position);
  const index = welded ? welded.index : part.index!;
  const vertices = welded ? welded.position : part.position;
  const count = Math.min(index.length, Math.max(3, target) * 3);
  const [simplified] = MeshoptSimplifier.simplify(
    index,
    vertices,
    3,
    count - (count % 3),
    PROXY_ERROR,
    ['Prune']
  );
  const corners = simplified.length;
  const position = new Float32Array(corners * 3);
  const normal = part.normal ? new Float32Array(corners * 3) : null;
  const color = part.color ? new Float32Array(corners * 3) : null;
  for (let corner = 0; corner < corners; corner++) {
    // A non-indexed part's simplified vertex is a welded one; its source vertex
    // holds the position, normal and colour to copy.
    const source =
      (welded ? welded.source[simplified[corner]] : simplified[corner]) * 3;
    const at = corner * 3;
    position[at] = part.position[source];
    position[at + 1] = part.position[source + 1];
    position[at + 2] = part.position[source + 2];
    if (normal && part.normal) {
      normal[at] = part.normal[source];
      normal[at + 1] = part.normal[source + 1];
      normal[at + 2] = part.normal[source + 2];
    }
    if (color && part.color) {
      color[at] = part.color[source];
      color[at + 1] = part.color[source + 1];
      color[at + 2] = part.color[source + 2];
    }
  }
  return {
    position,
    normal,
    color,
    uv: null,
    index: null,
    points: false,
    material: part.material,
    tint: part.tint
  };
}

// A non-indexed part carries a copy of a position at every corner that uses it.
// The simplifier reads those copies as seams and stops, so weld them into one
// vertex per position and an index buffer, keeping each welded vertex's source
// corner for the attribute copy.
function weld(position: Float32Array): {
  index: Uint32Array;
  position: Float32Array;
  source: Uint32Array;
} {
  const vertices = position.length / 3;
  const remap = MeshoptSimplifier.generatePositionRemap(position, 3);
  const slot = new Uint32Array(vertices).fill(0xffffffff);
  const index = new Uint32Array(vertices);
  const source: number[] = [];
  const unique = new Float32Array(vertices * 3);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const canonical = remap[vertex];
    let at = slot[canonical];
    if (at === 0xffffffff) {
      at = source.length;
      slot[canonical] = at;
      source.push(canonical);
      unique[at * 3] = position[canonical * 3];
      unique[at * 3 + 1] = position[canonical * 3 + 1];
      unique[at * 3 + 2] = position[canonical * 3 + 2];
    }
    index[vertex] = at;
  }
  return {
    index,
    position: unique.subarray(0, source.length * 3),
    source: Uint32Array.from(source)
  };
}

export function partTriangles(part: IMeshPart): number {
  if (part.points) {
    return 0;
  }
  const count = part.index ? part.index.length : part.position.length / 3;
  return Math.trunc(count / 3);
}
