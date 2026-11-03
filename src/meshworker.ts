// Reads STL, PLY, OBJ, GLB and STEP files in a Web Worker, so a large file does
// not freeze the lab. The worker fetches the body itself, so the page never
// holds the file, and it sends the geometry back transferred, not copied. The
// 3MF reader stays on the main thread, because ThreeMFLoader needs DOMParser.

import type {
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture
} from 'three';

import { Color, SRGBColorSpace } from 'three';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

import {
  LADDER_DEPTH,
  LADDER_FLOOR,
  levelsOf,
  partTriangles,
  proxyOf
} from './meshproxy';

import { meshCreasedNormals } from './meshutil';

export type IMeshRequest =
  | {
      kind: 'read';
      format: string;
      url: string;
      glue?: string;
      wasm?: string;
    }
  | { kind: 'level'; level: number };

export interface IMeshPart {
  position: Float32Array;
  normal: Float32Array | null;
  color: Float32Array | null;
  uv: Float32Array | null;
  index: Uint32Array | null;
  // A points cloud has no triangles and no normals.
  points: boolean;
  // The part's material in IMeshModel.materials, or -1 for the default one.
  material: number;
  // One colour for the whole part, linear RGB; STEP carries one per mesh.
  tint: [number, number, number] | null;
  // The motion proxy of this part, null when it is small enough to draw whole;
  // absent when no proxy was built for the model. ACC-MESH-107.
  proxy?: IMeshPart | null;
}

export interface IMeshNode {
  part: number;
  // The part's transform, column-major.
  matrix: number[];
}

export interface IMeshTexture {
  id: string;
  bitmap: ImageBitmap;
  wrapS: number;
  wrapT: number;
  magFilter: number;
  minFilter: number;
  flipY: boolean;
  colorSpace: string;
}

export interface IMeshModel {
  kind: 'model';
  parts: IMeshPart[];
  nodes: IMeshNode[];
  materials: Record<string, unknown>[];
  textures: IMeshTexture[];
  // min x, min y, min z, max x, max y, max z.
  box: number[];
  // The worker's heap when the model is ready, which the memory test records.
  peak: number;
}

// One part's geometry at a ladder rung of a model that was read before, or
// null to keep the geometry this part already has at the rung above.
export interface IMeshLevelEntry {
  part: number;
  proxy: IMeshPart | null;
}

export type IMeshReply =
  | IMeshModel
  | { kind: 'level'; level: number; entries: IMeshLevelEntry[] }
  | { kind: 'compression'; name: string }
  | { kind: 'error'; stage: 'download' | 'parse' | 'empty' };

// The shape of occt-import-js 0.0.23's ReadStepFile result that this reader
// uses. The colour is linear RGB in 0..1.
interface IStepResult {
  success: boolean;
  meshes: {
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
    };
    index: { array: number[] };
    color?: [number, number, number];
  }[];
}

// The Emscripten glue, loaded with importScripts, defines this factory on the
// worker global scope.
declare const occtimportjs: (options?: {
  locateFile?: (path: string) => string;
}) => Promise<{
  ReadStepFile(content: Uint8Array, params: null): IStepResult;
}>;

declare function importScripts(...urls: string[]): void;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// The compressions a GLB can declare and this viewer cannot decode, by their
// plain names.
const COMPRESSIONS: { [extension: string]: string } = {
  KHR_draco_mesh_compression: 'Draco',
  EXT_meshopt_compression: 'meshopt',
  KHR_texture_basisu: 'KTX2'
};

// The material fields a GLB's material carries over, in the list the design
// fixes; every other field is a named gap.
const TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'normalMap',
  'aoMap',
  'metalnessMap',
  'roughnessMap'
] as const;

interface IReply {
  reply: IMeshReply;
  transfer: Transferable[];
}

// Two parts can share one buffer (a GLB node reusing a mesh), and a transfer
// list may name a buffer once.
const send = (reply: IMeshReply, transfer: Transferable[] = []): void =>
  (self.postMessage as Worker['postMessage'])(reply, [...new Set(transfer)]);

self.onmessage = async (event: MessageEvent<IMeshRequest>) => {
  const request = event.data;
  try {
    if (request.kind === 'level') {
      const { reply, transfer } = levelOf(request.level);
      send(reply, transfer);
      return;
    }
    const { reply, transfer } = await addProxies(await read(request));
    send(reply, transfer);
  } catch (reason) {
    console.error('Mesh reader: the file was not read', reason);
    send({ kind: 'error', stage: 'parse' });
  }
};

const failure = (stage: 'download' | 'parse' | 'empty'): IReply => ({
  reply: { kind: 'error', stage },
  transfer: []
});

async function read(
  request: Extract<IMeshRequest, { kind: 'read' }>
): Promise<IReply> {
  switch (request.format) {
    case 'stl':
      return readStl(request.url);
    case 'ply':
    case 'obj':
    case 'glb':
    case 'step': {
      const body = await bodyOf(request.url);
      if (body === 'download' || body === 'empty') {
        return failure(body);
      }
      const reply =
        request.format === 'ply'
          ? readPly(body)
          : request.format === 'obj'
            ? readObj(body)
            : request.format === 'glb'
              ? await readGlb(body)
              : await readStep(body, request.glue ?? '', request.wasm ?? '');
      // The stock loaders read noise as an empty scene instead of throwing, so
      // a file of the wrong type has to be classified here. Only STL can tell
      // an empty file of its own type from noise.
      return reply.reply.kind === 'model' && reply.reply.parts.length === 0
        ? failure('parse')
        : reply;
    }
    default:
      return failure('parse');
  }
}

// The whole body for the formats whose stock loader takes one, or the reason
// the body is not there.
async function bodyOf(
  url: string
): Promise<ArrayBuffer | 'download' | 'empty'> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (reason) {
    return 'download';
  }
  if (!response.ok) {
    return 'download';
  }
  let body: ArrayBuffer;
  try {
    body = await response.arrayBuffer();
  } catch (reason) {
    return 'download';
  }
  return body.byteLength ? body : 'empty';
}

// The worker's own heap when the model is ready. The CDP sampler cannot always
// reach the worker inside its blocking pass, so this is the number that holds.
function heapNow(): number {
  const memory = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return memory?.usedJSHeapSize ?? 0;
}

function modelOf(
  parts: IMeshPart[],
  nodes: IMeshNode[],
  materials: Record<string, unknown>[] = [],
  textures: IMeshTexture[] = []
): IMeshModel {
  return {
    kind: 'model',
    parts,
    nodes,
    materials,
    textures,
    box: boundsOf(parts, nodes),
    peak: heapNow()
  };
}

function modelReply(model: IMeshModel): IReply {
  const transfer: Transferable[] = [];
  for (const part of model.parts) {
    transfer.push(part.position.buffer);
    if (part.normal) {
      transfer.push(part.normal.buffer);
    }
    if (part.color) {
      transfer.push(part.color.buffer);
    }
    if (part.uv) {
      transfer.push(part.uv.buffer);
    }
    if (part.index) {
      transfer.push(part.index.buffer);
    }
  }
  for (const texture of model.textures) {
    transfer.push(texture.bitmap);
  }
  return { reply: model, transfer };
}

// A rung must save at least 40 percent of the triangles, or it buys nothing.
const PROXY_KEEP = 0.6;

// The rung the worker has built deepest, and what it needs to build the next
// one from: a lazy rung is simplified from the rung above it, because the full
// arrays were transferred to the page.
interface IRung {
  level: number;
  // The model's drawn triangle count at level 0, the ladder's basis.
  full: number;
  // The rung's drawn triangle count, every node counted.
  total: number;
  // The rung's unique triangle count, for distributing the next target.
  unique: number;
  // The rung's part per model part index; null leaves the part whole.
  parts: (IMeshPart | null)[];
  // The full triangle count of a part this rung leaves whole.
  whole: number[];
  // How many nodes draw each part.
  refs: number[];
}

let rung: IRung | null = null;

const emptyLevel = (level: number): IReply => ({
  reply: { kind: 'level', level, entries: [] },
  transfer: []
});

// The drawn triangles of a rung: every node counts.
function drawnTotal(
  parts: (IMeshPart | null)[],
  whole: number[],
  refs: number[]
): number {
  let total = 0;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    total += (part ? partTriangles(part) : whole[index]) * refs[index];
  }
  return total;
}

// The rung's arrays outlive the transfer, so the worker keeps the built part
// and sends a copy of it.
function copyPart(part: IMeshPart): IMeshPart {
  return {
    ...part,
    position: part.position.slice(),
    normal: part.normal ? part.normal.slice() : null,
    color: part.color ? part.color.slice() : null
  };
}

// Builds level 1 of the ladder in the read pass, in the worker where the
// geometry already is, and transfers its arrays with the model's. A model that
// fails any check keeps its full mesh: the reply's proxy fields stay absent or
// null, which the scene draws whole.
async function addProxies(result: IReply): Promise<IReply> {
  const model = result.reply;
  rung = null;
  if (model.kind !== 'model' || !MeshoptSimplifier.supported) {
    return result;
  }
  const refs = new Array<number>(model.parts.length).fill(0);
  let full = 0;
  for (const node of model.nodes) {
    full += partTriangles(model.parts[node.part]);
    refs[node.part]++;
  }
  const targets = levelsOf(full);
  if (!targets) {
    return result;
  }
  const whole = model.parts.map(part => partTriangles(part));
  let unique = 0;
  for (let index = 0; index < model.parts.length; index++) {
    if (refs[index]) {
      unique += whole[index];
    }
  }
  let proxies: (IMeshPart | null)[];
  try {
    await MeshoptSimplifier.ready;
    proxies = model.parts.map((part, index) => {
      if (!refs[index]) {
        return null;
      }
      const target = Math.max(
        1,
        Math.round((targets[0] * partTriangles(part)) / unique)
      );
      return proxyOf(part, target);
    });
  } catch (reason) {
    return result;
  }
  const total = drawnTotal(proxies, whole, refs);
  if (total > PROXY_KEEP * full) {
    return result;
  }
  // The next rung's target is distributed over this rung's own triangle
  // counts, not the full mesh's: using the full count built level 2 a quarter
  // of its target and the ladder ended above the floor.
  let rungUnique = 0;
  for (let index = 0; index < proxies.length; index++) {
    if (refs[index]) {
      rungUnique += partTriangles(proxies[index] ?? model.parts[index]);
    }
  }
  for (let index = 0; index < proxies.length; index++) {
    const proxy = proxies[index];
    if (!proxy) {
      model.parts[index].proxy = null;
      continue;
    }
    // The rung's arrays outlive the transfer, so the worker keeps the built
    // part and sends a copy of it, as levelOf() does; a transferred buffer is
    // detached here and level 2 could not be built from it.
    const sent = copyPart(proxy);
    model.parts[index].proxy = sent;
    result.transfer.push(sent.position.buffer);
    if (sent.normal) {
      result.transfer.push(sent.normal.buffer);
    }
    if (sent.color) {
      result.transfer.push(sent.color.buffer);
    }
  }
  rung = {
    level: 1,
    full,
    total,
    unique: rungUnique,
    parts: proxies,
    whole,
    refs
  };
  return result;
}

// Builds the rung one below the one the worker holds, simplified from the held
// rung, and sends a copy of the parts that changed. A rung that sheds under 40
// percent ends the ladder, except when it reaches the floor: the 1M chain
// reaches 15,624 and the floor's 10,000 is only a 36 percent cut.
function levelOf(level: number): IReply {
  const state = rung;
  if (!state || level !== state.level + 1 || level > LADDER_DEPTH) {
    return emptyLevel(level);
  }
  const targets = levelsOf(state.full);
  if (!targets) {
    return emptyLevel(level);
  }
  const target = targets[level - 1];
  const next: (IMeshPart | null)[] = [];
  let unique = 0;
  try {
    for (let index = 0; index < state.parts.length; index++) {
      const source = state.parts[index];
      if (!source) {
        // The part is whole at every rung and shares the full geometry.
        next[index] = null;
        unique += state.whole[index];
        continue;
      }
      const partTarget = Math.max(
        1,
        Math.round((target * partTriangles(source)) / state.unique)
      );
      // A part already at the floor keeps the geometry it has.
      next[index] = proxyOf(source, partTarget) ?? source;
      unique += partTriangles(next[index]!);
    }
  } catch (reason) {
    return emptyLevel(level);
  }
  const total = drawnTotal(next, state.whole, state.refs);
  const reachesFloor = state.total > LADDER_FLOOR && total <= LADDER_FLOOR;
  if (total > PROXY_KEEP * state.total && !reachesFloor) {
    return emptyLevel(level);
  }
  const entries: IMeshLevelEntry[] = [];
  const transfer: Transferable[] = [];
  for (let index = 0; index < next.length; index++) {
    const part = next[index];
    if (part && part !== state.parts[index]) {
      const sent = copyPart(part);
      entries.push({ part: index, proxy: sent });
      transfer.push(sent.position.buffer);
      if (sent.normal) {
        transfer.push(sent.normal.buffer);
      }
      if (sent.color) {
        transfer.push(sent.color.buffer);
      }
    } else {
      entries.push({ part: index, proxy: null });
    }
  }
  rung = {
    level,
    full: state.full,
    total,
    unique,
    parts: next,
    whole: state.whole,
    refs: state.refs
  };
  return { reply: { kind: 'level', level, entries }, transfer };
}

// The bounds of every node's part after its transform, so the main thread
// never walks the positions.
function boundsOf(parts: IMeshPart[], nodes: IMeshNode[]): number[] {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const node of nodes) {
    const { position } = parts[node.part];
    let localMinX = Infinity;
    let localMinY = Infinity;
    let localMinZ = Infinity;
    let localMaxX = -Infinity;
    let localMaxY = -Infinity;
    let localMaxZ = -Infinity;
    for (let at = 0; at < position.length; at += 3) {
      const x = position[at];
      const y = position[at + 1];
      const z = position[at + 2];
      if (x < localMinX) {
        localMinX = x;
      }
      if (x > localMaxX) {
        localMaxX = x;
      }
      if (y < localMinY) {
        localMinY = y;
      }
      if (y > localMaxY) {
        localMaxY = y;
      }
      if (z < localMinZ) {
        localMinZ = z;
      }
      if (z > localMaxZ) {
        localMaxZ = z;
      }
    }
    const m = node.matrix;
    for (let corner = 0; corner < 8; corner++) {
      const x = corner & 1 ? localMaxX : localMinX;
      const y = corner & 2 ? localMaxY : localMinY;
      const z = corner & 4 ? localMaxZ : localMinZ;
      const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
      const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (tx < minX) {
        minX = tx;
      }
      if (tx > maxX) {
        maxX = tx;
      }
      if (ty < minY) {
        minY = ty;
      }
      if (ty > maxY) {
        maxY = ty;
      }
      if (tz < minZ) {
        minZ = tz;
      }
      if (tz > maxZ) {
        maxZ = tz;
      }
    }
  }
  return Number.isFinite(minX)
    ? [minX, minY, minZ, maxX, maxY, maxZ]
    : [0, 0, 0, 0, 0, 0];
}

// Binary STL streams: the record count is known from the header, so the output
// is allocated once and each record's nine floats are copied into it. The
// facet normals are never stored, because the crease pass recomputes them.
async function readStl(url: string): Promise<IReply> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (reason) {
    return failure('download');
  }
  if (!response.ok) {
    return failure('download');
  }
  const stream = response.body;
  if (!stream) {
    return failure('parse');
  }
  const reader = stream.getReader();

  // The first 84 bytes decide the layout; a chunk can hold more than them.
  let head = new Uint8Array(0);
  let ended = false;
  const readChunk = async (): Promise<Uint8Array | null> => {
    const result = await reader.read();
    if (result.done) {
      ended = true;
      return null;
    }
    return result.value;
  };
  const append = (chunk: Uint8Array): void => {
    const grown = new Uint8Array(head.byteLength + chunk.byteLength);
    grown.set(head);
    grown.set(chunk, head.byteLength);
    head = grown;
  };
  try {
    while (head.byteLength < 84) {
      const chunk = await readChunk();
      if (!chunk) {
        break;
      }
      append(chunk);
    }
  } catch (reason) {
    return failure('download');
  }
  if (!head.byteLength && ended) {
    return failure('empty');
  }

  const lengthHeader = response.headers.get('content-length');
  const length = lengthHeader === null ? NaN : Number(lengthHeader);
  const declared =
    head.byteLength >= 84
      ? new DataView(head.buffer, head.byteOffset, 84).getUint32(80, true)
      : -1;
  let binary: boolean;
  if (
    head.byteLength >= 84 &&
    Number.isFinite(length) &&
    length === 84 + 50 * declared
  ) {
    binary = true;
  } else if (solidAt(head)) {
    binary = false;
  } else if (head.byteLength < 84) {
    return failure('parse');
  } else {
    binary = true;
  }

  if (!binary) {
    try {
      while (!ended) {
        const chunk = await readChunk();
        if (chunk) {
          append(chunk);
        }
      }
    } catch (reason) {
      return failure('download');
    }
    const geometry = new STLLoader().parse(new TextDecoder().decode(head));
    const part = stlPart(geometry);
    return modelReply(
      modelOf(part ? [part] : [], part ? [{ part: 0, matrix: IDENTITY }] : [])
    );
  }

  const count = declared;
  const positions = new Float32Array(count * 9);
  const defaultColor = stlColor(head);
  const colors = defaultColor ? new Float32Array(count * 9) : null;
  const color = new Color();
  let face = 0;
  const staging = new Uint8Array(50);
  let staged = 0;
  const record = (view: DataView, at: number): void => {
    if (face >= count) {
      return;
    }
    const out = face * 9;
    positions[out] = view.getFloat32(at + 12, true);
    positions[out + 1] = view.getFloat32(at + 16, true);
    positions[out + 2] = view.getFloat32(at + 20, true);
    positions[out + 3] = view.getFloat32(at + 24, true);
    positions[out + 4] = view.getFloat32(at + 28, true);
    positions[out + 5] = view.getFloat32(at + 32, true);
    positions[out + 6] = view.getFloat32(at + 36, true);
    positions[out + 7] = view.getFloat32(at + 40, true);
    positions[out + 8] = view.getFloat32(at + 44, true);
    if (colors && defaultColor) {
      const packed = view.getUint16(at + 48, true);
      if ((packed & 0x8000) === 0) {
        color.setRGB(
          (packed & 0x1f) / 31,
          ((packed >> 5) & 0x1f) / 31,
          ((packed >> 10) & 0x1f) / 31,
          SRGBColorSpace
        );
      } else {
        color.setRGB(
          defaultColor[0],
          defaultColor[1],
          defaultColor[2],
          SRGBColorSpace
        );
      }
      for (let corner = 0; corner < 3; corner++) {
        colors[out + corner * 3] = color.r;
        colors[out + corner * 3 + 1] = color.g;
        colors[out + corner * 3 + 2] = color.b;
      }
    }
    face++;
  };
  // A record can straddle two chunks; the remainder under 50 bytes is carried.
  const feed = (bytes: Uint8Array): void => {
    if (!bytes.byteLength) {
      return;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    if (staged) {
      const take = Math.min(50 - staged, bytes.byteLength);
      staging.set(bytes.subarray(0, take), staged);
      staged += take;
      at = take;
      if (staged === 50) {
        record(new DataView(staging.buffer), 0);
        staged = 0;
      }
    }
    while (at + 50 <= bytes.byteLength && face < count) {
      record(view, at);
      at += 50;
    }
    if (face < count && at < bytes.byteLength) {
      staging.set(bytes.subarray(at), 0);
      staged = bytes.byteLength - at;
    }
  };

  try {
    feed(head.subarray(84));
    while (!ended && face < count) {
      const chunk = await readChunk();
      if (chunk) {
        feed(chunk);
      }
    }
  } catch (reason) {
    return failure('download');
  }
  if (!ended) {
    // Every record is read; drop the rest of the stream.
    await reader.cancel().catch(() => undefined);
  }
  if (face < count) {
    // The body ended before the declared record count.
    return failure('parse');
  }
  const part: IMeshPart = {
    position: positions,
    normal: count ? meshCreasedNormals(positions) : null,
    color: colors,
    uv: null,
    index: null,
    points: false,
    material: -1,
    tint: null
  };
  return modelReply(
    count ? modelOf([part], [{ part: 0, matrix: IDENTITY }]) : modelOf([], [])
  );
}

// The five bytes 'solid' at one of the first five offsets, a text file whose
// encoding may precede it with a byte order mark.
function solidAt(head: Uint8Array): boolean {
  const solid = [0x73, 0x6f, 0x6c, 0x69, 0x64];
  for (let offset = 0; offset < 5; offset++) {
    if (
      offset + solid.length <= head.byteLength &&
      solid.every((byte, index) => head[offset + index] === byte)
    ) {
      return true;
    }
  }
  return false;
}

// The header's default colour, from a "COLOR=rgba" sequence, as three reads it.
function stlColor(head: Uint8Array): [number, number, number] | null {
  const view = new DataView(head.buffer, head.byteOffset, 84);
  for (let index = 0; index <= 70; index++) {
    if (
      view.getUint32(index, false) === 0x434f4c4f &&
      view.getUint8(index + 4) === 0x52 &&
      view.getUint8(index + 5) === 0x3d
    ) {
      return [
        view.getUint8(index + 6) / 255,
        view.getUint8(index + 7) / 255,
        view.getUint8(index + 8) / 255
      ];
    }
  }
  return null;
}

// An STL's facets are the file's normals, which the crease pass replaces.
function stlPart(geometry: BufferGeometry): IMeshPart | null {
  const position = toFloats(geometry.getAttribute('position'), 3);
  if (!position) {
    return null;
  }
  return {
    position,
    normal: meshCreasedNormals(position),
    color: toFloats(geometry.getAttribute('color'), 3),
    uv: null,
    index: null,
    points: false,
    material: -1,
    tint: null
  };
}

// One geometry as a part: a non-indexed geometry without normals gets the
// crease pass, an indexed one is expanded first.
function partOf(
  geometry: BufferGeometry,
  material: number,
  points: boolean
): IMeshPart | null {
  let source = geometry;
  const authored = geometry.hasAttribute('normal');
  if (!points && !authored && geometry.index) {
    source = geometry.toNonIndexed();
  }
  const position = toFloats(source.getAttribute('position'), 3);
  if (!position) {
    return null;
  }
  return {
    position,
    normal: points
      ? null
      : authored
        ? toFloats(source.getAttribute('normal'), 3)
        : meshCreasedNormals(position),
    color: toFloats(source.getAttribute('color'), 3),
    uv: toFloats(source.getAttribute('uv'), 2),
    index:
      source.index && source.index.count
        ? new Uint32Array(source.index.array)
        : null,
    points,
    material,
    tint: null
  };
}

function toFloats(
  attribute: BufferAttribute | InterleavedBufferAttribute | undefined,
  size: number
): Float32Array | null {
  if (!attribute || !attribute.count) {
    return null;
  }
  if (
    'isBufferAttribute' in attribute &&
    attribute.array instanceof Float32Array &&
    attribute.itemSize === size &&
    !attribute.normalized
  ) {
    return attribute.array;
  }
  const values = new Float32Array(attribute.count * size);
  for (let index = 0; index < attribute.count; index++) {
    const at = index * size;
    values[at] = attribute.getX(index);
    if (size > 1) {
      values[at + 1] = attribute.getY(index);
    }
    if (size > 2) {
      values[at + 2] = attribute.getZ(index);
    }
  }
  return values;
}

function readPly(body: ArrayBuffer): IReply {
  const geometry = new PLYLoader().parse(body);
  // Vertices only: points, at one screen size whatever the zoom.
  const points = !geometry.index;
  const part = partOf(geometry, -1, points);
  return modelReply(
    part ? modelOf([part], [{ part: 0, matrix: IDENTITY }]) : modelOf([], [])
  );
}

function readObj(body: ArrayBuffer): IReply {
  // A mtllib line names materials this reader does not fetch; the default
  // material shows the shape.
  const group = new OBJLoader().parse(new TextDecoder().decode(body));
  group.updateMatrixWorld(true);
  const parts: IMeshPart[] = [];
  const nodes: IMeshNode[] = [];
  group.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const part = partOf(mesh.geometry, -1, false);
    if (!part) {
      return;
    }
    parts.push(part);
    nodes.push({ part: parts.length - 1, matrix: mesh.matrixWorld.toArray() });
  });
  return modelReply(modelOf(parts, nodes));
}

async function readGlb(body: ArrayBuffer): Promise<IReply> {
  const compression = compressionOf(body);
  if (compression) {
    return { reply: { kind: 'compression', name: compression }, transfer: [] };
  }
  const gltf = await new GLTFLoader().parseAsync(body, '');
  gltf.scene.updateMatrixWorld(true);
  const parts: IMeshPart[] = [];
  const nodes: IMeshNode[] = [];
  const materials: Record<string, unknown>[] = [];
  const textures = new Map<string, IMeshTexture>();
  const bitmaps = new Map<ImageBitmap, string>();
  const materialIds = new Map<Material, number>();
  const materialIndex = (material: Material | Material[]): number => {
    const single = Array.isArray(material) ? material[0] : material;
    if (!single) {
      return -1;
    }
    const known = materialIds.get(single);
    if (known !== undefined) {
      return known;
    }
    const index = materials.length;
    materialIds.set(single, index);
    materials.push(materialJson(single, textures, bitmaps));
    return index;
  };
  gltf.scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const part = partOf(mesh.geometry, materialIndex(mesh.material), false);
    if (!part) {
      return;
    }
    parts.push(part);
    nodes.push({ part: parts.length - 1, matrix: mesh.matrixWorld.toArray() });
  });
  return modelReply(modelOf(parts, nodes, materials, [...textures.values()]));
}

// The material fields a Texture cannot serialize in a worker, listed by the
// design; the main thread rebuilds them with MaterialLoader.
function materialJson(
  material: Material,
  textures: Map<string, IMeshTexture>,
  bitmaps: Map<ImageBitmap, string>
): Record<string, unknown> {
  const standard = material as MeshStandardMaterial;
  const json: Record<string, unknown> = {
    type: material.type,
    uuid: material.uuid,
    name: material.name,
    color: standard.color.getHex(),
    opacity: material.opacity,
    transparent: material.transparent,
    side: material.side,
    vertexColors: material.vertexColors
  };
  // A MeshBasicMaterial from KHR_materials_unlit carries none of the standard
  // fields, and Material.fromJSON ignores the ones left out.
  if (standard.emissive) {
    json.emissive = standard.emissive.getHex();
    json.emissiveIntensity = standard.emissiveIntensity;
  }
  if (standard.metalness !== undefined) {
    json.metalness = standard.metalness;
  }
  if (standard.roughness !== undefined) {
    json.roughness = standard.roughness;
  }
  if (standard.normalScale) {
    json.normalScale = [standard.normalScale.x, standard.normalScale.y];
  }
  for (const key of TEXTURE_KEYS) {
    const texture = standard[key];
    if (!texture?.isTexture) {
      continue;
    }
    const id = textureId(texture, textures, bitmaps);
    if (id) {
      json[key] = id;
    }
  }
  return json;
}

function textureId(
  texture: Texture,
  textures: Map<string, IMeshTexture>,
  bitmaps: Map<ImageBitmap, string>
): string | null {
  const image = texture.image;
  if (typeof ImageBitmap === 'undefined' || !(image instanceof ImageBitmap)) {
    // shortcut: an image that is not an ImageBitmap is not transferred;
    // upgrade when a GLB texture arrives in another form
    return null;
  }
  const known = bitmaps.get(image);
  if (known) {
    // Two textures on one bitmap share the first one's sampler.
    return known;
  }
  const wire: IMeshTexture = {
    id: texture.uuid,
    bitmap: image,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    magFilter: texture.magFilter,
    minFilter: texture.minFilter,
    flipY: texture.flipY,
    colorSpace: texture.colorSpace
  };
  textures.set(wire.id, wire);
  bitmaps.set(image, wire.id);
  return wire.id;
}

// The unsupported compression a GLB declares, or null for none and for a file
// that is not a GLB, which the loader reports as unreadable.
function compressionOf(data: ArrayBuffer): string | null {
  if (data.byteLength < 12) {
    return null;
  }
  const view = new DataView(data);
  if (view.getUint32(0, true) !== 0x46546c67) {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= data.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      const json = JSON.parse(
        new TextDecoder().decode(new Uint8Array(data, offset + 8, length))
      );
      const used: string[] = [
        ...(json.extensionsUsed ?? []),
        ...(json.extensionsRequired ?? [])
      ];
      for (const extension of Object.keys(COMPRESSIONS)) {
        if (used.includes(extension)) {
          return COMPRESSIONS[extension];
        }
      }
      return null;
    }
    offset += 8 + length;
  }
  return null;
}

// occt-import-js reads STEP exactly as it did on the main thread, but now in
// this worker, which fetches the file itself.
async function readStep(
  body: ArrayBuffer,
  glue: string,
  wasm: string
): Promise<IReply> {
  importScripts(glue);
  const occt = await occtimportjs({ locateFile: () => wasm });
  const result = occt.ReadStepFile(new Uint8Array(body), null);
  if (!result.success) {
    throw new Error('The STEP reader did not read the file.');
  }
  const parts: IMeshPart[] = [];
  const nodes: IMeshNode[] = [];
  for (const mesh of result.meshes) {
    const position = new Float32Array(mesh.attributes.position.array);
    const index = new Uint32Array(mesh.index.array);
    if (!position.length || !index.length) {
      continue;
    }
    parts.push({
      position,
      normal: mesh.attributes.normal
        ? new Float32Array(mesh.attributes.normal.array)
        : null,
      color: null,
      uv: null,
      index,
      points: false,
      material: -1,
      // shortcut: per-face STEP colours (brep_faces) are dropped, one colour per
      // mesh; upgrade when a STEP file needs its face colours
      tint: mesh.color ?? null
    });
    nodes.push({ part: parts.length - 1, matrix: IDENTITY });
  }
  return modelReply(modelOf(parts, nodes));
}
