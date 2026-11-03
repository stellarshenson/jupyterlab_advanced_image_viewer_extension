// Pure helpers of the mesh viewer. This module imports nothing, so the unit
// tests load it without three.js or the JupyterLab packages.

// ACC-MESH-101-LIGHTS: the three styles as data. Only the active style's
// lights are parented, so ACC-MESH-81 finds one directional light in the
// camera in Studio. Intensities are set against the measured 3:1 floor.
export type MeshLighting = 'studio' | 'neutral' | 'three-point';

export interface IMeshLight {
  // The name of the light object in the scene.
  name: string;
  intensity: number;
  // A camera light moves with the view; the scene's hemisphere stays put.
  parent: 'camera' | 'scene';
}

export interface IMeshLightingStyle {
  name: MeshLighting;
  // The menu label, in English.
  label: string;
  // The RoomEnvironment texture lights the model.
  environment: boolean;
  lights: IMeshLight[];
}

export const MESH_LIGHTING: IMeshLightingStyle[] = [
  {
    name: 'studio',
    label: 'Studio',
    environment: true,
    lights: [{ name: 'cameraLight', intensity: 2.9, parent: 'camera' }]
  },
  {
    name: 'neutral',
    label: 'Neutral',
    environment: false,
    lights: [
      { name: 'cameraLight', intensity: 1.5, parent: 'camera' },
      { name: 'hemisphere', intensity: 4.0, parent: 'scene' }
    ]
  },
  {
    name: 'three-point',
    label: 'Three-point',
    environment: false,
    // Tuned on the grey cube: every face median holds 3:1 in both themes (the
    // lowest is 3.27:1, on the white panel), and the torus's top band measures
    // 0.258 against Studio's 0.246 in the light theme and 0.242 in the dark
    // one, so the rim is brighter in both.
    lights: [
      { name: 'key', intensity: 6.0, parent: 'camera' },
      { name: 'fill', intensity: 3.0, parent: 'camera' },
      { name: 'rim', intensity: 0.6, parent: 'camera' }
    ]
  }
];

// ACC-MESH-104-VIEWS: the ten standard views, as the camera's direction from
// the model, before normalisation. Front is -Y for a Z-up file and +Z for a
// Y-up one, so each file's own front faces the camera.
export interface IMeshView {
  name: string;
  z: [number, number, number];
  y: [number, number, number];
}

export const MESH_VIEWS: IMeshView[] = [
  { name: 'Front', z: [0, -1, 0], y: [0, 0, 1] },
  { name: 'Back', z: [0, 1, 0], y: [0, 0, -1] },
  { name: 'Right', z: [1, 0, 0], y: [1, 0, 0] },
  { name: 'Left', z: [-1, 0, 0], y: [-1, 0, 0] },
  { name: 'Top', z: [0, 0, 1], y: [0, 1, 0] },
  { name: 'Bottom', z: [0, 0, -1], y: [0, -1, 0] },
  { name: 'Front-Left', z: [-1, -1, 1], y: [-1, 1, 1] },
  { name: 'Front-Right', z: [1, -1, 1], y: [1, 1, 1] },
  { name: 'Back-Left', z: [-1, 1, 1], y: [1, 1, -1] },
  { name: 'Back-Right', z: [1, 1, 1], y: [1, 1, -1] }
];

// The unit direction of a view for an up axis, or undefined for a name the
// table does not hold.
export function meshViewDirection(
  name: string,
  up: 'y' | 'z'
): [number, number, number] | undefined {
  const view = MESH_VIEWS.find(item => item.name === name);
  if (!view) {
    return undefined;
  }
  const [x, y, z] = view[up];
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

// Edges sharper than this stay sharp in Smooth shading. A globe with facets 22.5
// degrees apart has diagonal neighbours 31.8 degrees apart, which must round, and
// an 8-sided column has edges of 45 degrees, which must stay sharp.
export const MESH_CREASE = (40 * Math.PI) / 180;

// What three's toCreasedNormals does, at a fraction of the memory: a corner's
// normal is the normalized sum of the face normals within the crease angle of
// its own face normal, among the faces at that corner's position. The face
// normals are float32, and a hash slot holds the first corner of a position
// instead of a copy of its quantized key, so the pass never holds three float64
// keys per corner. positions holds three corners per triangle, non-indexed.
export function meshCreasedNormals(
  positions: Float32Array,
  creaseAngle = MESH_CREASE
): Float32Array {
  const faceCount = Math.trunc(positions.length / 9);
  const cornerCount = faceCount * 3;
  const creaseDot = Math.cos(creaseAngle);
  // Corners within a hundredth of a unit share a vertex, as in three.
  const hashMultiplier = (1 + 1e-10) * 1e2;

  const faceNormals = new Float32Array(faceCount * 3);
  for (let face = 0; face < faceCount; face++) {
    const normal = face * 3;
    const at = face * 9;
    const bx = positions[at + 3];
    const by = positions[at + 4];
    const bz = positions[at + 5];
    // v1 = c - b and v2 = a - b, then v1 x v2, in three's operation order.
    const v1x = positions[at + 6] - bx;
    const v1y = positions[at + 7] - by;
    const v1z = positions[at + 8] - bz;
    const v2x = positions[at] - bx;
    const v2y = positions[at + 1] - by;
    const v2z = positions[at + 2] - bz;
    const nx = v1y * v2z - v1z * v2y;
    const ny = v1z * v2x - v1x * v2z;
    const nz = v1x * v2y - v1y * v2x;
    const invLength = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    faceNormals[normal] = nx * invLength;
    faceNormals[normal + 1] = ny * invLength;
    faceNormals[normal + 2] = nz * invLength;
  }

  // Each corner takes the id of the first corner at its quantized position. A
  // table slot holds that corner plus one; zero marks an empty slot.
  let tableSize = 1;
  while (tableSize < cornerCount * 2) {
    tableSize <<= 1;
  }
  const tableMask = tableSize - 1;
  const table = new Int32Array(tableSize);
  const vertexIds = new Int32Array(cornerCount);
  let uniqueCount = 0;
  for (let corner = 0; corner < cornerCount; corner++) {
    const at = corner * 3;
    const qx = Math.trunc(positions[at] * hashMultiplier);
    const qy = Math.trunc(positions[at + 1] * hashMultiplier);
    const qz = Math.trunc(positions[at + 2] * hashMultiplier);
    let slot =
      (Math.imul(qx, 73856093) ^
        Math.imul(qy, 19349663) ^
        Math.imul(qz, 83492791)) &
      tableMask;
    for (;;) {
      const entry = table[slot];
      if (!entry) {
        table[slot] = corner + 1;
        vertexIds[corner] = uniqueCount++;
        break;
      }
      const other = (entry - 1) * 3;
      if (
        Math.trunc(positions[other] * hashMultiplier) === qx &&
        Math.trunc(positions[other + 1] * hashMultiplier) === qy &&
        Math.trunc(positions[other + 2] * hashMultiplier) === qz
      ) {
        vertexIds[corner] = vertexIds[entry - 1];
        break;
      }
      slot = (slot + 1) & tableMask;
    }
  }

  // The faces at each unique position, in one bucket each.
  const bucketOffsets = new Int32Array(uniqueCount + 1);
  for (let corner = 0; corner < cornerCount; corner++) {
    bucketOffsets[vertexIds[corner] + 1]++;
  }
  for (let id = 0; id < uniqueCount; id++) {
    bucketOffsets[id + 1] += bucketOffsets[id];
  }
  const bucketFaces = new Int32Array(cornerCount);
  const bucketCursors = bucketOffsets.slice(0, uniqueCount);
  for (let face = 0; face < faceCount; face++) {
    const at = face * 3;
    bucketFaces[bucketCursors[vertexIds[at]]++] = face;
    bucketFaces[bucketCursors[vertexIds[at + 1]]++] = face;
    bucketFaces[bucketCursors[vertexIds[at + 2]]++] = face;
  }

  const normals = new Float32Array(positions.length);
  for (let face = 0; face < faceCount; face++) {
    const at = face * 3;
    const nx = faceNormals[at];
    const ny = faceNormals[at + 1];
    const nz = faceNormals[at + 2];
    for (let corner = 0; corner < 3; corner++) {
      const index = at + corner;
      const id = vertexIds[index];
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (let k = bucketOffsets[id]; k < bucketOffsets[id + 1]; k++) {
        const other = bucketFaces[k] * 3;
        const ox = faceNormals[other];
        const oy = faceNormals[other + 1];
        const oz = faceNormals[other + 2];
        if (nx * ox + ny * oy + nz * oz > creaseDot) {
          sumX += ox;
          sumY += oy;
          sumZ += oz;
        }
      }
      const invLength =
        1 / (Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ) || 1);
      const output = index * 3;
      normals[output] = sumX * invLength;
      normals[output + 1] = sumY * invLength;
      normals[output + 2] = sumZ * invLength;
    }
  }
  return normals;
}

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

// The extents with no unit, because STL has none. At least one decimal, and
// three significant digits of the largest extent, so a model a fraction of a
// unit wide does not read 0.0 × 0.0 × 0.0.
export function formatDimensions(size: number[]): string {
  const largest = Math.max(...size);
  const digits = largest > 0 ? 2 - Math.floor(Math.log10(largest)) : 1;
  const decimals = Math.min(Math.max(digits, 1), 20);
  return size.map(extent => extent.toFixed(decimals)).join(' × ');
}
