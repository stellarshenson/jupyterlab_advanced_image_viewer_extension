// All three.js code of the mesh viewer: the file readers, the renderer, the
// camera, the controls and the lights. src/mesh.ts imports this module when
// the first mesh file opens, so start-up cost stays the same.

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Frustum,
  Group,
  HalfFloatType,
  HemisphereLight,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Material,
  MaterialLoader,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Sphere,
  Texture,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';

import {
  MESH_LIGHTING,
  MeshLighting,
  meshCreasedNormals,
  meshViewDirection
} from './meshutil';

import { LADDER_DEPTH } from './meshproxy';

import type {
  IMeshLevelEntry,
  IMeshModel,
  IMeshNode,
  IMeshPart,
  IMeshReply,
  IMeshRequest
} from './meshworker';

// The perspective field of view. An orthographic camera made from it matches
// the perspective size at the orbit target.
const FOV = 35;

// The largest buffer bytes one GPU upload task takes, all attributes counted.
// At 24 bytes per vertex that is about 58,000 vertices, so a 1 GiB file
// arrives in 369 chunks, one per animation frame. Measured on the software
// renderer: 32 MiB took 600 to 840 ms per frame, 4 MiB takes under 100 ms.
const CHUNK_BYTES = 4 * 1024 * 1024;

// ACC-MESH-107: the proxy stays on show this long after the last camera change,
// so a paused drag does not flash the full mesh.
const MOTION_SETTLE = 300;

// The 25 fps frame the ladder measures against, and the half-budget interval
// that shows enough headroom to step back up.
const FRAME_BUDGET = 1000 / 25;
const FRAME_HEADROOM = FRAME_BUDGET / 2;

// The drawn intervals one rung is judged by; one 50 ms hitch does not force a
// step.
const LADDER_WINDOW = 3;

// A gap between sampled frames over this starts the measurement again.
const MOTION_GAP = 1000;

// ACC-MESH-102-GRID: the ground grid as one plane whose fragment shader draws
// the lines. A GridHelper draws GL lines, and the software renderer the tests
// run on drops a line whole when its far end crosses the camera plane, which
// loses the ground nearest the camera; triangles clip correctly.
const GRID_VERTEX = `
  varying vec2 vGrid;
  void main() {
    vGrid = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// fwidth gives the cell size in pixels, so a line stays one pixel wide at
// every zoom; the two centre lines take the axis colour.
const GRID_FRAGMENT = `
  uniform float uCell;
  uniform vec3 uAxis;
  uniform vec3 uLines;
  varying vec2 vGrid;
  void main() {
    vec2 coord = vGrid / uCell;
    vec2 width = fwidth(coord);
    float cell = min(
      abs(fract(coord.x - 0.5) - 0.5) / width.x,
      abs(fract(coord.y - 0.5) - 0.5) / width.y
    );
    float axis = min(abs(coord.x) / width.x, abs(coord.y) / width.y);
    if (min(cell, axis) > 0.5) {
      discard;
    }
    gl_FragColor = vec4(axis <= 0.5 ? uAxis : uLines, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface IMeshStats {
  triangles: number;
  points: number;
  size: number[];
}

function defaultMaterial(
  vertexColors: boolean,
  color?: Color
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: color ?? (vertexColors ? 0xffffff : 0x6f7480),
    metalness: 0.05,
    roughness: 0.6,
    side: DoubleSide,
    vertexColors
  });
}

// A file without normals gets the crease treatment, so its sharp edges stay
// sharp; a file with authored normals keeps them. The pass reads corners, so an
// indexed geometry is expanded first.
function withNormals(geometry: BufferGeometry): BufferGeometry {
  if (geometry.hasAttribute('normal')) {
    return geometry;
  }
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const attribute = source.getAttribute('position');
  const positions =
    'isBufferAttribute' in attribute &&
    attribute.array instanceof Float32Array &&
    attribute.itemSize === 3 &&
    !attribute.normalized
      ? attribute.array
      : float32Of(attribute);
  source.setAttribute(
    'normal',
    new BufferAttribute(meshCreasedNormals(positions), 3)
  );
  return source;
}

// ThreeMFLoader's positions are float32; the copy is the general case.
function float32Of(
  attribute: ReturnType<BufferGeometry['getAttribute']>
): Float32Array {
  const values = new Float32Array(attribute.count * 3);
  for (let index = 0; index < attribute.count; index++) {
    values[index * 3] = attribute.getX(index);
    values[index * 3 + 1] = attribute.getY(index);
    values[index * 3 + 2] = attribute.getZ(index);
  }
  return values;
}

// The STEP glue and WASM stay separate files, so a WASM build can replace the
// one the package ships. Nothing is downloaded until a STEP file opens.
const STEP_GLUE = new URL(
  'occt-import-js/dist/occt-import-js.js',
  import.meta.url
);
const STEP_WASM = new URL(
  'occt-import-js/dist/occt-import-js.wasm',
  import.meta.url
);
// The LGPL licence texts ship beside them as separate files in the wheel.
// Nothing fetches these URLs; the rules in rspack.config.js emit them.
new URL('occt-import-js/dist/license.occt-import-js.txt', import.meta.url);
new URL('occt-import-js/dist/license.occt.txt', import.meta.url);

// The Studio environment, baked offline by
// tmp/workflows/mesh-viewer/bake/run.cjs: the RoomEnvironment PMREM's six faces
// at its six mip levels, level-major. The browser uploads the levels instead of
// convolving them, which held the main thread for 678-718 ms (DEF-MESH-21-PMREM).
// The fetch starts with this module, before the file is read, so the bytes are
// in hand when the renderer attaches.
interface IStudioEnvironment {
  width: number;
  levels: number;
  data: Uint16Array;
}

// Null until the asset arrives, and if it never does.
let studioEnvironmentData: IStudioEnvironment | null = null;

const studioEnvironment: Promise<IStudioEnvironment | null> = fetch(
  new URL('../style/studio-env.bin', import.meta.url).href
)
  .then(async response => {
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    studioEnvironmentData = parseStudioEnvironment(
      await response.arrayBuffer()
    );
    return studioEnvironmentData;
  })
  .catch(reason => {
    console.error('Mesh viewer: the Studio environment did not load', reason);
    return null;
  });

function parseStudioEnvironment(bytes: ArrayBuffer): IStudioEnvironment {
  const magic = new TextDecoder().decode(new Uint8Array(bytes, 0, 8));
  if (magic !== 'MESHENV1') {
    throw new Error('unexpected header');
  }
  const view = new DataView(bytes);
  const width = view.getUint32(8, true);
  const levels = view.getUint32(12, true);
  let length = 16;
  for (let level = 0; level < levels; level++) {
    length += 6 * (width >> level) ** 2 * 4 * 2;
  }
  if (bytes.byteLength !== length) {
    throw new Error(`expected ${length} bytes, got ${bytes.byteLength}`);
  }
  return { width, levels, data: new Uint16Array(bytes, 16) };
}

// The scene pieces one read produced, the compression a GLB declares and the
// viewer cannot decode, the stage that failed, or null for a format with no
// reader.
export type MeshReadResult =
  | { read: IReadMesh }
  | { compression: string }
  | { error: 'download' | 'parse' | 'empty' | 'asset' }
  | null;

// One node of a read model as the scene draws it, kept so a lazy rung can make
// its own meshes with the same transform, material and, for a part left whole,
// the same geometry. ACC-MESH-107.
export interface IMeshNodeRender {
  node: IMeshNode;
  part: IMeshPart;
  material: Material;
  cloud: PointsMaterial;
  chunks: BufferGeometry[];
}

export interface IReadMesh {
  // One object per chunk, so one GPU upload task stays small.
  parts: Object3D[];
  // The level-1 rung as a group whose single child is the rung; null when the
  // model has no ladder. ACC-MESH-107.
  proxy: Group | null;
  // The actual triangle counts of the rungs built, level 1 first.
  levels: number[];
  // The geometry chunks of each rung, per node, so a lazy rung shares a part
  // the worker left whole.
  rungs: BufferGeometry[][][];
  // The live worker that builds lazy rungs, or null when the model has none.
  ladder: Worker | null;
  nodes: IMeshNodeRender[];
  box: Box3;
  triangles: number;
  points: number;
}

// Every format but 3MF reads in the worker. A model with a ladder keeps its
// worker, which builds the lazy rungs while the camera moves; every other read
// terminates it.
export async function readModel(
  format: string,
  url: string,
  signal?: AbortSignal
): Promise<MeshReadResult> {
  const worker = new Worker(new URL('./meshworker.js', import.meta.url));
  let reply: IMeshReply;
  try {
    reply = await workerRead(worker, format, url, signal);
  } catch (reason) {
    worker.terminate();
    throw reason;
  }
  if (reply.kind !== 'model') {
    worker.terminate();
    if (reply.kind === 'error') {
      return { error: reply.stage };
    }
    if (reply.kind === 'compression') {
      return { compression: reply.name };
    }
    return null;
  }
  const read = assemble(reply);
  if (signal?.aborted) {
    worker.terminate();
    throw new DOMException('The read was superseded', 'AbortError');
  }
  if (read.proxy) {
    read.ladder = worker;
  } else {
    worker.terminate();
  }
  return { read };
}

async function workerRead(
  worker: Worker,
  format: string,
  url: string,
  signal?: AbortSignal
): Promise<IMeshReply> {
  return await new Promise<IMeshReply>((resolve, reject) => {
    const abort = () =>
      reject(new DOMException('The read was superseded', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<IMeshReply>) => {
      signal?.removeEventListener('abort', abort);
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      signal?.removeEventListener('abort', abort);
      // The worker's own parse failures arrive as postMessage replies, so an
      // onerror is the script or one of its chunks failing to load.
      const error = new Error(event.message);
      error.name = 'WorkerLoadError';
      reject(error);
    };
    const request: IMeshRequest = {
      kind: 'read',
      format,
      url,
      glue: STEP_GLUE.href,
      wasm: STEP_WASM.href
    };
    worker.postMessage(request);
  });
}

// Wraps the worker's arrays in attributes and splits a part into chunks. No
// vertex work happens here: the bounds come from the worker, so neither the
// renderer nor the fit walks the positions.
function assemble(model: IMeshModel): IReadMesh {
  const textures: { [id: string]: Texture } = {};
  for (const wire of model.textures) {
    const texture = new Texture(wire.bitmap);
    texture.uuid = wire.id;
    texture.wrapS = wire.wrapS as Texture['wrapS'];
    texture.wrapT = wire.wrapT as Texture['wrapT'];
    texture.magFilter = wire.magFilter as Texture['magFilter'];
    texture.minFilter = wire.minFilter as Texture['minFilter'];
    texture.flipY = wire.flipY;
    texture.colorSpace = wire.colorSpace as Texture['colorSpace'];
    texture.needsUpdate = true;
    textures[wire.id] = texture;
  }
  const loader = new MaterialLoader().setTextures(textures);
  const materials = model.materials.map(json => loader.parse(json));
  const parts: Object3D[] = [];
  const nodes: IMeshNodeRender[] = [];
  let triangles = 0;
  let points = 0;
  for (const node of model.nodes) {
    const part = model.parts[node.part];
    const count = part.index ? part.index.length : part.position.length / 3;
    if (part.points) {
      points += count;
    } else {
      triangles += count / 3;
    }
    const tint = part.tint
      ? new Color(part.tint[0], part.tint[1], part.tint[2])
      : undefined;
    const material =
      part.material >= 0
        ? materials[part.material]
        : defaultMaterial(part.color !== null, tint);
    const cloud = pointsMaterial(part.color !== null);
    // DEF-MESH-72-POINTS-COLOUR: a GLB points part keeps its authored colour,
    // except the glTF default white, and its opacity only when the material is
    // transparent; no map, because points carry no uv. The point size stays.
    if (part.points && part.material >= 0) {
      const authored = material as PointsMaterial;
      if (authored.color.getHex() !== 0xffffff) {
        cloud.color.copy(authored.color);
      }
      if (authored.transparent) {
        cloud.opacity = authored.opacity;
        cloud.transparent = true;
      }
    }
    const chunks = chunkGeometries(part);
    for (const geometry of chunks) {
      parts.push(objectOf(part, material, cloud, node, geometry));
    }
    nodes.push({ node, part, material, cloud, chunks });
  }
  let proxy: Group | null = null;
  const rungs: BufferGeometry[][][] = [];
  const levels: number[] = [];
  // A model with any proxy gets one rung group, sharing each part's material
  // instance so the rung and the full mesh draw alike.
  if (model.nodes.some(node => !!model.parts[node.part].proxy)) {
    proxy = new Group();
    const rung = new Group();
    const chunks: BufferGeometry[][] = [];
    for (const entry of nodes) {
      // A part the worker left whole shares the full mesh's chunks.
      const own = entry.part.proxy
        ? chunkGeometries(entry.part.proxy)
        : entry.chunks;
      for (const geometry of own) {
        rung.add(
          objectOf(
            entry.part.proxy ?? entry.part,
            entry.material,
            entry.cloud,
            entry.node,
            geometry
          )
        );
      }
      chunks.push(own);
    }
    proxy.add(rung);
    proxy.visible = false;
    rungs.push(chunks);
    levels.push(trianglesOf(nodes, chunks));
  }
  const box = new Box3(
    new Vector3(model.box[0], model.box[1], model.box[2]),
    new Vector3(model.box[3], model.box[4], model.box[5])
  );
  return {
    parts,
    proxy,
    levels,
    rungs,
    ladder: null,
    nodes,
    box,
    triangles,
    points
  };
}

function objectOf(
  part: IMeshPart,
  material: Material,
  cloud: PointsMaterial,
  node: IMeshNode,
  geometry: BufferGeometry
): Object3D {
  const object = part.points
    ? new Points(geometry, cloud)
    : new Mesh(geometry, material);
  // The worker measured the bounds, so the renderer must not walk the
  // vertices again to cull them.
  object.frustumCulled = false;
  object.matrix.fromArray(node.matrix);
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  return object;
}

// The triangles a rung's chunks draw, every node counted; a points part draws
// no triangles.
function trianglesOf(
  nodes: IMeshNodeRender[],
  chunks: BufferGeometry[][]
): number {
  let triangles = 0;
  for (let index = 0; index < chunks.length; index++) {
    if (nodes[index].part.points) {
      continue;
    }
    for (const geometry of chunks[index]) {
      triangles +=
        (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    }
  }
  return triangles;
}

function pointsMaterial(vertexColors: boolean): PointsMaterial {
  return new PointsMaterial({
    color: vertexColors ? 0xffffff : 0x6f7480,
    size: 2 * window.devicePixelRatio,
    sizeAttenuation: false,
    vertexColors
  });
}

// The geometry chunks of one part. An indexed part keeps its index in one
// geometry, because splitting it would mean filtering the index; an unindexed
// one is split by bytes.
function chunkGeometries(part: IMeshPart): BufferGeometry[] {
  const vertices = part.position.length / 3;
  if (part.points || part.index) {
    const geometry = geometryOf(part, 0, vertices);
    if (part.index) {
      geometry.setIndex(new BufferAttribute(part.index, 1));
    }
    return [geometry];
  }
  const bytes =
    12 + (part.normal ? 12 : 0) + (part.uv ? 8 : 0) + (part.color ? 12 : 0);
  const perChunk = Math.floor(Math.floor(CHUNK_BYTES / bytes) / 3) * 3;
  const chunks: BufferGeometry[] = [];
  for (let start = 0; start < vertices; start += perChunk) {
    chunks.push(geometryOf(part, start, Math.min(start + perChunk, vertices)));
  }
  return chunks;
}

function geometryOf(
  part: IMeshPart,
  start: number,
  end: number
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(part.position.subarray(start * 3, end * 3), 3)
  );
  if (part.normal) {
    geometry.setAttribute(
      'normal',
      new BufferAttribute(part.normal.subarray(start * 3, end * 3), 3)
    );
  }
  if (part.uv) {
    geometry.setAttribute(
      'uv',
      new BufferAttribute(part.uv.subarray(start * 2, end * 2), 2)
    );
  }
  if (part.color) {
    geometry.setAttribute(
      'color',
      new BufferAttribute(part.color.subarray(start * 3, end * 3), 3)
    );
  }
  return geometry;
}

// 3MF stays on the main thread: ThreeMFLoader needs DOMParser and
// TextureLoader, which a worker does not have.
export function read3mf(data: ArrayBuffer): MeshReadResult {
  // ThreeMFLoader applies the file's own transforms only, so the Z-up camera
  // reads the file as it is.
  const group = new ThreeMFLoader().parse(data);
  let meshes = 0;
  group.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const source = mesh.material as MeshStandardMaterial;
    mesh.geometry = withNormals(mesh.geometry);
    const material = defaultMaterial(
      mesh.geometry.hasAttribute('color'),
      source.color
    );
    material.map = source.map;
    mesh.material = material;
    meshes++;
  });
  if (!meshes) {
    return null;
  }
  return {
    read: {
      parts: [group],
      proxy: null,
      levels: [],
      rungs: [],
      ladder: null,
      nodes: [],
      box: new Box3().setFromObject(group),
      ...countOf(group)
    }
  };
}

function materialsOf(object: Object3D): MeshStandardMaterial[] {
  const material = (object as Mesh).material ?? [];
  return (
    Array.isArray(material) ? material : [material]
  ) as MeshStandardMaterial[];
}

// Frees what the GPU holds of the model. The arrays stay, so a new renderer
// can upload them again.
function releaseGpu(model: Object3D): void {
  model.traverse(object => {
    (object as Mesh).geometry?.dispose();
    for (const material of materialsOf(object)) {
      for (const value of Object.values(material)) {
        if ((value as Texture | null)?.isTexture) {
          (value as Texture).dispose();
        }
      }
      material.dispose();
    }
  });
}

function countOf(model: Object3D): { triangles: number; points: number } {
  let triangles = 0;
  let points = 0;
  model.traverse(object => {
    const { geometry } = object as Mesh;
    const count = geometry?.index?.count ?? geometry?.attributes.position.count;
    if ((object as Points).isPoints) {
      points += count;
    } else if ((object as Mesh).isMesh) {
      triangles += count / 3;
    }
  });
  return { triangles, points };
}

export class MeshScene {
  constructor(host: HTMLElement, up: 'y' | 'z', onContextLost: () => void) {
    this.host = host;
    this.onContextLost = onContextLost;
    this.up = up;
    this.camera = new PerspectiveCamera(FOV);
    // The view of a Y-up file, a quarter turn about X for a Z-up one. The
    // controls read the up vector once, when they are made.
    if (up === 'z') {
      this.camera.up.set(0, 0, 1);
      this.view = new Vector3(0.9, -1.4, 0.7).normalize();
    } else {
      this.view = new Vector3(0.9, 0.7, 1.4).normalize();
    }
    // Parented to the camera, so surfaces keep their shape from every angle.
    // The environment lights a box from above on one axis, which leaves its
    // top face too near the white panel; this light fills the side faces from
    // below the view, where the environment gives them least. A box's three
    // faces measure 3.50, 3.74 and 5.66 to 1 against the white panel and 3.34,
    // 5.05 and 5.40 against the dark one.
    this.rig.set(
      'cameraLight',
      this.directional('mesh-light-camera', 0.3, -0.4, 1)
    );
    const hemisphere = new HemisphereLight(0xffffff, 0xbbbbbb, 4.0);
    hemisphere.name = 'mesh-light-hemisphere';
    this.rig.set('hemisphere', hemisphere);
    this.rig.set('key', this.directional('mesh-light-key', 0.6, 0.8, 1));
    this.rig.set('fill', this.directional('mesh-light-fill', -0.7, -0.9, 0.8));
    this.rig.set('rim', this.directional('mesh-light-rim', 0.3, 0.7, -1));
    this.scene.add(this.camera);
    // On the host, because the canvas is replaced each time the tab is shown.
    this.controls = this.newControls();
    this.applyLighting();
    // A theme change recolours the grid.
    this.themeObserver = new MutationObserver(() => this.buildGrid());
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jp-theme-name']
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  camera: PerspectiveCamera | OrthographicCamera;
  controls: OrbitControls;
  readonly up: 'y' | 'z';
  // The model on show; null before the first one and after a failed read.
  model: Object3D | null = null;
  // The decimated siblings shown while the camera moves; null when the model
  // has none. ACC-MESH-107.
  proxy: Group | null = null;
  // The rung on show: 0 is the full mesh, 1 to LADDER_DEPTH a rung.
  level = 0;
  // The actual triangle counts of the rungs built, level 1 first.
  levels: number[] = [];
  // Whether the last window at the chosen rung met the 25 fps budget.
  levelFits = false;
  // The deepest rung still missed the budget, so the controller stopped there.
  floorMiss = false;
  // True once the drawn intervals measured this renderer too slow to draw the
  // full mesh at the criterion's rate. Cleared by a new model or context.
  slow = false;

  // Show the model and return what it measures, or null, with the model
  // dropped, when it holds nothing to show. The camera stays, so a reload
  // keeps the view, while the new model can be seen from it; near and far
  // follow the new size.
  setModel(read: IReadMesh): IMeshStats | null {
    this.clearModel();
    // The ladder worker is the scene's until the model is dropped, even when
    // the model below turns out to hold nothing to show.
    this.ladder = read.ladder;
    if (this.ladder) {
      this.ladder.onmessage = (event: MessageEvent<IMeshReply>) =>
        this.onLevel(event.data);
    }
    const wasInside = this.sphere.containsPoint(this.camera.position);
    const box = read.box;
    box.getBoundingSphere(this.sphere);
    const radius = this.sphere.radius;
    if (!(radius > 0 && Number.isFinite(radius))) {
      return null;
    }
    this.box = box;
    this.model = new Group();
    // Every chunk joins the model at once and stays hidden until the frame
    // that draws it, so drawing can start again from any chunk.
    for (const part of read.parts) {
      part.visible = false;
      this.model.add(part);
    }
    this.scene.add(this.model);
    this.proxy = read.proxy;
    if (this.proxy) {
      this.scene.add(this.proxy);
    }
    this.levels = read.levels;
    this.rungs = read.rungs;
    this.nodes = read.nodes;
    this.near = radius / 100;
    this.far = radius * 100;
    this.camera.near = this.near;
    this.camera.far = this.far;
    this.camera.updateProjectionMatrix();
    this.applyLimits();
    this.buildGrid();
    this.needsFit ||= !this.showsModel(wasInside);
    if (this.needsFit && this.renderer) {
      this.fit();
    }
    this.restart();
    this.requestRender();
    return {
      triangles: read.triangles,
      points: read.points,
      size: box.getSize(new Vector3()).toArray()
    };
  }

  clearModel(): void {
    if (this.pumpFrame) {
      cancelAnimationFrame(this.pumpFrame);
      this.pumpFrame = 0;
    }
    this.accumulate = false;
    this.next = 0;
    this.box = null;
    // The lazy rungs die with the model: the worker holds the only copy of the
    // rung the next one would be built from.
    this.ladder?.terminate();
    this.ladder = null;
    this.resetMotion();
    this.levels = [];
    this.rungs = [];
    this.nodes = [];
    this.restLevel = 0;
    this.endLevel = LADDER_DEPTH;
    this.pendingLevel = 0;
    this.wantedLevel = 0;
    this.levelFits = false;
    this.floorMiss = false;
    if (this.proxy) {
      releaseGpu(this.proxy);
      this.scene.remove(this.proxy);
      this.proxy = null;
    }
    if (this.model) {
      releaseGpu(this.model);
      this.scene.remove(this.model);
      this.model = null;
    }
    this.buildGrid();
    this.requestRender();
  }

  // Make the canvas and the renderer and re-apply the lighting style, which
  // rebuilds the Studio environment detach() disposed; throws when WebGL is
  // not available. Three uploads the geometry again on first render. The
  // renderer, the environment and the first chunk each take their own
  // animation frame: on a software renderer creating a WebGL context alone
  // blocks the main thread longer than the task budget.
  attach(): void {
    if (this.renderer) {
      return;
    }
    this.resetMotion();
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      // The chunks of a large model are drawn one per frame over the frame
      // before, so the drawing buffer must survive compositing.
      preserveDrawingBuffer: true
    });
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.host.prepend(renderer.domElement);
    this.renderer = renderer;
    requestAnimationFrame(() => this.light());
  }

  // Build the environment the lighting style needs, on the frame after the
  // renderer exists, once the baked levels are in hand.
  private light(): void {
    if (!this.renderer) {
      return;
    }
    void studioEnvironment.then(() => {
      if (!this.renderer) {
        return;
      }
      this.applyLighting();
      requestAnimationFrame(() => this.begin());
    });
  }

  // Start drawing once the environment is in place: a draw before it compiles
  // a program without the environment, which the environment then replaces.
  private begin(): void {
    if (!this.renderer) {
      return;
    }
    this.lit = true;
    // setModel may have staged the model before a renderer existed; the pump
    // can only draw now.
    this.restart();
    this.resize();
  }

  // Give up the WebGL context: browsers cap live contexts and force-lose the
  // oldest, so a hidden tab holds none. The scene, camera and controls stay.
  detach(): void {
    const renderer = this.renderer;
    if (!renderer) {
      return;
    }
    this.settle();
    this.resetMotion();
    this.renderer = null;
    this.lit = false;
    // The next canvas starts at the default 300x150, so the size recorded for
    // this one must not stop resize() from sizing it.
    this.width = 0;
    this.height = 0;
    renderer.domElement.removeEventListener('webglcontextlost', this.onLost);
    if (this.model) {
      releaseGpu(this.model);
    }
    if (this.proxy) {
      releaseGpu(this.proxy);
    }
    this.environment?.dispose();
    this.environment = null;
    this.scene.environment = null;
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  // Frame the bounding sphere for the current aspect. The orthographic view
  // covers the sphere with its fixed top and bottom; the perspective one
  // moves back by the sphere radius over the sine of its narrow half angle.
  fit(): void {
    if (!this.model) {
      return;
    }
    const aspect = this.aspect();
    const half = MathUtils.degToRad(FOV) / 2;
    const narrow = Math.min(half, Math.atan(Math.tan(half) * aspect));
    if (this.camera instanceof OrthographicCamera) {
      const top = this.sphere.radius / Math.min(1, aspect);
      this.camera.top = top;
      this.camera.bottom = -top;
      this.camera.left = -top * aspect;
      this.camera.right = top * aspect;
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position
      .copy(this.sphere.center)
      .addScaledVector(this.view, this.sphere.radius / Math.sin(narrow));
    this.controls.target.copy(this.sphere.center);
    this.controls.update();
    this.stillFull();
    this.needsFit = false;
    this.requestRender();
  }

  // Move the camera along its line to the target: a scale above 1 moves it
  // closer, as the image viewer's zoom enlarges by that scale. An
  // orthographic camera has no distance, so its zoom holds the scale.
  zoom(scale: number): void {
    if (this.camera instanceof OrthographicCamera) {
      this.camera.zoom = MathUtils.clamp(
        this.camera.zoom * scale,
        this.controls.minZoom,
        this.controls.maxZoom
      );
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.position
        .sub(this.controls.target)
        .divideScalar(scale)
        .add(this.controls.target);
    }
    this.controls.update();
    this.stillFull();
    this.requestRender();
  }

  // A shader switch on every material, with no copy of the geometry, and the
  // model drawn again one chunk at a time.
  setShading(flat: boolean, wireframe: boolean): void {
    this.restart();
    this.flat = flat;
    this.wireframe = wireframe;
    this.model?.traverse(object => this.shadePart(object));
    this.requestRender();
  }

  // ACC-MESH-101-LIGHTS: swap the rig. Only the active style's lights stay
  // parented, and no material changes, so flat, wireframe and vertex colours
  // persist.
  setLighting(style: MeshLighting): void {
    if (style === this.lighting) {
      return;
    }
    this.restart();
    this.lighting = style;
    this.applyLighting();
  }

  // ACC-MESH-102-GRID: show or hide the ground grid built with the model.
  setGrid(on: boolean): void {
    this.restart();
    this.gridOn = on;
    if (this.grid) {
      this.grid.visible = on;
    }
    this.requestRender();
  }

  // ACC-MESH-103-PROJ: swap the projection at the same position and target.
  // OrbitControls caches the camera, so it is made again for the new one.
  setProjection(ortho: boolean): void {
    if (ortho === this.ortho) {
      return;
    }
    this.restart();
    this.ortho = ortho;
    const old = this.camera;
    const position = old.position.clone();
    const up = old.up.clone();
    const target = this.controls.target.clone();
    const aspect = this.aspect();
    if (ortho) {
      // The frustum matches the perspective size at the target plane.
      const top =
        position.distanceTo(target) * Math.tan(MathUtils.degToRad(FOV) / 2);
      this.camera = new OrthographicCamera(
        -top * aspect,
        top * aspect,
        top,
        -top,
        this.near,
        this.far
      );
      this.camera.zoom = 1;
    } else {
      this.camera = new PerspectiveCamera(FOV, aspect, this.near, this.far);
    }
    this.camera.position.copy(position);
    this.camera.up.copy(up);
    this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);
    this.scene.remove(old);
    this.controls.dispose();
    this.controls = this.newControls();
    this.controls.target.copy(target);
    this.applyLimits();
    this.controls.update();
    this.stillFull();
    // Move the rig to the new camera.
    this.applyLighting();
    this.requestRender();
  }

  // ACC-MESH-104-VIEWS: the camera looks from a named direction and frames
  // the model. camera.up never changes, so the model is never rolled.
  setView(name: string): void {
    const direction = meshViewDirection(name, this.up);
    if (!direction) {
      return;
    }
    this.view.set(...direction);
    this.fit();
  }

  dispose(): void {
    this.themeObserver.disconnect();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.detach();
  }

  private directional(
    name: string,
    x: number,
    y: number,
    z: number
  ): DirectionalLight {
    const light = new DirectionalLight(0xffffff, 1);
    light.name = name;
    light.position.set(x, y, z);
    return light;
  }

  private newControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.host);
    controls.zoomToCursor = true;
    controls.addEventListener('change', this.motion);
    controls.addEventListener('start', this.grab);
    controls.addEventListener('end', this.release);
    // The previous controls were disposed without an end event, so a camera
    // swap during a drag must not leave the window open.
    this.grabbed = false;
    return controls;
  }

  // Parent the active style's lights and no others, and build the environment
  // the first time Studio needs it, which includes the attach after detach().
  private applyLighting(): void {
    const style =
      MESH_LIGHTING.find(item => item.name === this.lighting) ??
      MESH_LIGHTING[0];
    for (const light of this.rig.values()) {
      light.removeFromParent();
      (light as DirectionalLight).target?.removeFromParent();
    }
    this.scene.environment = style.environment
      ? (this.environmentFor()?.texture ?? null)
      : null;
    for (const entry of style.lights) {
      const light = this.rig.get(entry.name);
      if (!light) {
        continue;
      }
      light.intensity = entry.intensity;
      if (entry.parent === 'camera') {
        const directional = light as DirectionalLight;
        this.camera.add(directional, directional.target);
      } else {
        light.position.copy(this.upVector);
        this.scene.add(light);
      }
    }
    this.requestRender();
  }

  // The direction of the file's up axis, where the hemisphere light sits: its
  // direction is its world position.
  private get upVector(): Vector3 {
    return this.up === 'z' ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  }

  // The Studio environment: the baked levels uploaded into the same kind of
  // render-target texture PMREMGenerator returns, so the shader samples it with
  // the same maximum level and size. The bake dims the room at its source, so
  // the scene keeps environmentIntensity at its default of 1, which the lights
  // test sets back, and the camera light is set against that dimming.
  private environmentFor(): WebGLRenderTarget | null {
    if (this.environment) {
      return this.environment;
    }
    const renderer = this.renderer;
    const baked = studioEnvironmentData;
    if (!renderer || !baked) {
      return null;
    }
    const target = new WebGLCubeRenderTarget(baked.width, {
      minFilter: LinearMipmapLinearFilter,
      generateMipmaps: false,
      type: HalfFloatType,
      colorSpace: LinearSRGBColorSpace,
      depthBuffer: false
    });
    for (let level = 0; level < baked.levels; level++) {
      (target.texture.mipmaps as { width: number; height: number }[]).push({
        width: baked.width >> level,
        height: baked.width >> level
      });
    }
    target.texture.name = 'PMREM';
    target.texture.isPMREMTexture = true;
    // Allocate the six faces of every level without drawing into them, then
    // upload the baked levels. A render-target texture keeps version 0, so the
    // renderer never uploads over them.
    renderer.setRenderTarget(target);
    renderer.setRenderTarget(null);
    // three r187 needs WebGL 2, where half-float levels can be uploaded.
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const texture = (
      renderer.properties.get(target.texture) as {
        __webglTexture: WebGLTexture;
      }
    ).__webglTexture;
    renderer.state.bindTexture(gl.TEXTURE_CUBE_MAP, texture, gl.TEXTURE0);
    let offset = 0;
    for (let level = 0; level < baked.levels; level++) {
      const size = baked.width >> level;
      for (let face = 0; face < 6; face++) {
        gl.texSubImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          level,
          0,
          0,
          size,
          size,
          gl.RGBA,
          gl.HALF_FLOAT,
          baked.data.subarray(offset, offset + size * size * 4)
        );
        offset += size * size * 4;
      }
    }
    renderer.state.unbindTexture();
    this.environment = target;
    return target;
  }

  // The zoom limits of an orthographic camera and the distance limits of a
  // perspective one; only the active controls hold the pair that applies.
  private applyLimits(): void {
    if (this.ortho) {
      this.controls.minZoom = 0.02;
      this.controls.maxZoom = 50;
    } else if (this.sphere.radius > 0) {
      this.controls.minDistance = this.sphere.radius / 50;
      this.controls.maxDistance = this.sphere.radius * 50;
    }
  }

  // The ground grid, rebuilt for the model radius and the theme. It sits in
  // the scene, never under the model, so the fit's box never holds it.
  private buildGrid(): void {
    if (this.grid) {
      this.grid.removeFromParent();
      this.grid.geometry.dispose();
      (this.grid.material as ShaderMaterial).dispose();
      this.grid = null;
    }
    if (!this.model || !this.box) {
      return;
    }
    const box = this.box;
    const centre = box.getCenter(new Vector3());
    const size = 40 * this.sphere.radius;
    const light = document.body.dataset.jpThemeLight !== 'false';
    const grid = new Mesh(
      new PlaneGeometry(size, size),
      new ShaderMaterial({
        uniforms: {
          uCell: { value: this.sphere.radius / 2 },
          uAxis: { value: new Color(light ? 0x333333 : 0xdddddd) },
          uLines: { value: new Color(light ? 0x555555 : 0xaaaaaa) }
        },
        vertexShader: GRID_VERTEX,
        fragmentShader: GRID_FRAGMENT,
        side: DoubleSide,
        depthWrite: false
      })
    );
    if (this.up === 'z') {
      grid.position.set(centre.x, centre.y, box.min.z);
    } else {
      grid.rotation.x = -Math.PI / 2;
      grid.position.set(centre.x, box.min.y, centre.z);
    }
    // First in the scene, so the model paints over it and its own pixels do
    // not change.
    grid.renderOrder = -1;
    grid.visible = this.gridOn;
    this.grid = grid;
    this.scene.add(grid);
  }

  private aspect(): number {
    const { clientWidth, clientHeight } = this.host;
    return clientHeight ? clientWidth / clientHeight : 1;
  }

  // Whether the camera shows the model it did not frame. The controls measure
  // their limit from the target and move a camera past it on their next update,
  // so such a camera does not stay; the margin keeps one at the limit, whose
  // distance differs from it by rounding. The frustum covers a model past the
  // far plane. A camera that only this model encloses looks at its inside, or at
  // nothing.
  // shortcut: a camera already inside the old model stays, also inside a far
  // larger new one, where near may hide what it faces; Fit brings the model back.
  private showsModel(wasInside: boolean): boolean {
    const { camera, controls, sphere } = this;
    camera.updateMatrixWorld();
    const view = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    return (
      (wasInside || !sphere.containsPoint(camera.position)) &&
      camera.position.distanceTo(controls.target) <=
        controls.maxDistance * 1.001 &&
      new Frustum().setFromProjectionMatrix(view).intersectsSphere(sphere)
    );
  }

  // Draw the model from its first chunk, one chunk per animation frame, so no
  // single task draws a model larger than its chunk. The chunks already on the
  // drawing buffer are hidden rather than drawn again, and a camera, size or
  // shading change starts the whole sequence again for the same reason.
  private restart(): void {
    // A pump frame must never run with the proxy on show.
    this.stillFull();
    if (this.pumpFrame) {
      cancelAnimationFrame(this.pumpFrame);
      this.pumpFrame = 0;
    }
    const parts = this.model?.children ?? [];
    this.accumulate = parts.length > 1;
    this.next = 0;
    for (const part of parts) {
      part.visible = false;
    }
    this.pump();
  }

  // Show the next chunk on top of the chunks already drawn. The draw that
  // follows uploads that chunk and nothing else.
  private pump(): void {
    const parts = this.model?.children ?? [];
    const part = parts[this.next];
    if (!this.renderer || !this.accumulate || !part) {
      this.pumpFrame = 0;
      if (!this.accumulate) {
        for (const other of parts) {
          other.visible = true;
        }
      }
      return;
    }
    this.next++;
    this.shadePart(part);
    for (const other of parts) {
      other.visible = other === part;
    }
    this.requestRender();
    this.pumpFrame =
      this.next < parts.length ? requestAnimationFrame(() => this.pump()) : 0;
  }

  private shadePart(object: Object3D): void {
    for (const material of materialsOf(object)) {
      material.flatShading = this.flat;
      material.wireframe = this.wireframe;
      material.needsUpdate = true;
    }
  }

  private readonly requestRender = (): void => {
    if (this.renderer && this.lit && !this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
    }
  };

  // A camera change: if no motion window is open, start one at the rung that
  // fitted last, and ask for the settle frame that brings the full mesh back.
  private readonly motion = (): void => {
    if (!this.grabbed) {
      const now = performance.now();
      if (now >= this.motionUntil && !this.accumulate) {
        this.beginMotion();
      }
    }
    this.armSettle();
  };

  // Keep the motion window open and restart the settle countdown. A frame
  // slower than MOTION_SETTLE delays the timer as well, so the countdown only
  // ends the window when the input really stopped.
  private armSettle(): void {
    this.motionUntil = performance.now() + MOTION_SETTLE;
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = 0;
      if (this.grabbed) {
        // A held pointer is motion whatever the drawn interval was; release()
        // starts the countdown again.
        return;
      }
      // The settle frame draws the full mesh: closing the window first makes
      // the draw take the resting path.
      this.motionUntil = 0;
      this.requestRender();
    }, MOTION_SETTLE);
    this.requestRender();
  }

  // A held drag keeps the window open: a drawn interval over MOTION_SETTLE is
  // a slow renderer, not the end of the motion. The start of the drag is the
  // first change of the motion, so it chooses the rung.
  private readonly grab = (): void => {
    const now = performance.now();
    if (!this.accumulate && now >= this.motionUntil) {
      this.beginMotion();
    }
    this.grabbed = true;
  };

  private readonly release = (): void => {
    this.grabbed = false;
    if (this.motionUntil) {
      this.armSettle();
    }
  };

  // The first change of a motion window: start at the rung that fitted last, so
  // a second drag does not pay a full-mesh frame, and measure again.
  private beginMotion(): void {
    this.floorMiss = false;
    this.ceiling = 0;
    this.upFrom = 0;
    this.setLevel(Math.min(this.restLevel, this.levels.length));
  }

  // Show the full mesh (index 0) or one rung, as the only model drawn.
  private showLevel(index: number): void {
    if (this.model) {
      this.model.visible = index === 0;
    }
    if (!this.proxy) {
      return;
    }
    this.proxy.visible = index > 0;
    for (let at = 0; at < this.proxy.children.length; at++) {
      this.proxy.children[at].visible = at === index - 1;
    }
  }

  // A command draws the full mesh at once and is not camera motion: end the
  // motion window, drop the ladder's measurement and cancel its settle frame.
  private stillFull(): void {
    this.motionUntil = 0;
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = 0;
    }
    this.slow = false;
    this.ceiling = 0;
    this.upFrom = 0;
    this.setLevel(0);
    this.showLevel(0);
  }

  private resetMotion(): void {
    this.slow = false;
    this.stillFull();
  }

  // The settle frame: the full mesh is back and the next motion starts from
  // the rung that fitted last.
  private rest(): void {
    this.setLevel(0);
    this.ceiling = 0;
    this.upFrom = 0;
  }

  // Measure the drawn interval at the current rung and judge it once the
  // window is full.
  private control(now: number): void {
    const previous = this.lastLevelDraw;
    this.lastLevelDraw = now;
    // The next rung down is what a step needs; build it while this one is
    // still drawn.
    this.requestLevel(this.level + 1);
    if (!previous || now - previous > MOTION_GAP) {
      this.window = [];
      return;
    }
    this.window.push(now - previous);
    if (this.window.length < LADDER_WINDOW) {
      return;
    }
    const sorted = [...this.window].sort((a, b) => a - b);
    this.window = [];
    this.judge(sorted[Math.floor(sorted.length / 2)]);
  }

  private judge(median: number): void {
    if (median <= FRAME_BUDGET) {
      this.levelFits = true;
      if (this.level > 0) {
        this.restLevel = this.level;
      }
      this.upFrom = 0;
      this.upHold = median < FRAME_HEADROOM ? this.upHold + 1 : 0;
      // Two windows of headroom raise the rung, unless this motion already
      // showed a higher rung that missed.
      if (this.upHold >= 2 && this.level > 0) {
        const target = this.level - 1;
        if (target >= this.ceiling) {
          this.upFrom = this.level;
          this.setLevel(target);
        }
      }
      return;
    }
    this.levelFits = false;
    this.upHold = 0;
    if (this.level === 0) {
      // The latch the existing tests read: this renderer cannot draw the full
      // mesh at the criterion's rate.
      this.slow = true;
    }
    if (this.upFrom) {
      // The step up missed, level 0 included: return to the rung that fitted
      // and keep the ceiling there for the rest of this motion.
      this.ceiling = this.upFrom;
      const from = this.upFrom;
      this.upFrom = 0;
      this.setLevel(from);
      return;
    }
    this.stepDown();
  }

  // One rung lower, or the floor when the ladder has none left.
  private stepDown(): void {
    const next = this.level + 1;
    if (next > this.endLevel || next > LADDER_DEPTH) {
      // The deepest rung the model has stays on show, at whatever rate.
      this.floorMiss = true;
      return;
    }
    if (next <= this.levels.length) {
      this.setLevel(next);
      return;
    }
    // The next rung is still building: keep drawing this one and measure
    // again, and switch as soon as it arrives.
    this.wantedLevel = next;
    this.requestLevel(next);
  }

  private setLevel(level: number): void {
    this.level = level;
    this.wantedLevel = level;
    // A level change's first frame uploads the rung, so it is not sampled.
    this.window = [];
    this.lastLevelDraw = 0;
    this.upHold = 0;
  }

  // Ask the worker for one rung, once; the worker builds them in order.
  private requestLevel(level: number): void {
    if (
      !this.ladder ||
      level < 1 ||
      level > this.endLevel ||
      level > LADDER_DEPTH ||
      level <= this.levels.length ||
      level === this.pendingLevel
    ) {
      return;
    }
    this.pendingLevel = level;
    this.ladder.postMessage({ kind: 'level', level });
  }

  private onLevel(reply: IMeshReply): void {
    if (reply.kind !== 'level' || reply.level !== this.pendingLevel) {
      return;
    }
    this.applyLevel(reply.level, reply.entries);
  }

  // Join a lazy rung: a part the worker sent is rebuilt, a part it left alone
  // shares the geometry of the rung above. The reply draws nothing by itself.
  private applyLevel(level: number, entries: IMeshLevelEntry[]): void {
    this.pendingLevel = 0;
    if (!this.proxy || level !== this.levels.length + 1) {
      return;
    }
    if (!entries.length) {
      // The rung shed too little, so the ladder ends above the rung below it.
      this.endLevel = level - 1;
      if (this.wantedLevel > this.endLevel && this.level === this.endLevel) {
        this.floorMiss = true;
      }
      return;
    }
    // The worker lists parts; the scene draws one object per node, and several
    // nodes can draw one part.
    const proxies: (IMeshPart | null)[] = [];
    for (const entry of entries) {
      proxies[entry.part] = entry.proxy;
    }
    const previous = this.rungs[level - 2] ?? [];
    const rung = new Group();
    const chunks: BufferGeometry[][] = [];
    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];
      const proxy = proxies[node.node.part] ?? null;
      const own = proxy
        ? chunkGeometries(proxy)
        : (previous[index] ?? node.chunks);
      for (const geometry of own) {
        rung.add(
          objectOf(
            proxy ?? node.part,
            node.material,
            node.cloud,
            node.node,
            geometry
          )
        );
      }
      chunks[index] = own;
    }
    rung.visible = false;
    this.proxy.add(rung);
    this.rungs.push(chunks);
    this.levels.push(trianglesOf(this.nodes, chunks));
    if (
      this.wantedLevel === level &&
      (this.grabbed || this.motionUntil > performance.now())
    ) {
      // The arrival is applied, never drawn by itself: a lazy rung adds
      // geometry and the next camera-driven frame draws it, so an idle tab
      // stays idle.
      this.setLevel(level);
    }
  }

  private draw(): void {
    const renderer = this.renderer;
    if (!renderer) {
      return;
    }
    this.camera.updateMatrixWorld();
    if (this.accumulate && !this.cameraMatrix.equals(this.camera.matrixWorld)) {
      // The camera moved, so the drawing buffer no longer holds the model.
      this.restart();
    }
    const now = performance.now();
    const moving =
      !this.accumulate &&
      (this.grabbed || now < this.motionUntil) &&
      !!this.proxy;
    if (moving) {
      this.control(now);
    } else if (this.level !== 0 || this.wantedLevel !== 0) {
      this.rest();
    }
    this.showLevel(moving ? this.level : 0);
    renderer.autoClear = !this.accumulate || this.next <= 1;
    renderer.render(this.scene, this.camera);
    this.cameraMatrix.copy(this.camera.matrixWorld);
    if (moving) {
      // The motion window draws every frame, so the sampled interval is the
      // render cost: an input cadence of 25 wheel events a second must not
      // read as a 40 ms frame at a rung that renders in 17 ms.
      this.requestRender();
    }
    if (this.accumulate && this.next >= (this.model?.children.length ?? 0)) {
      this.settle();
    }
  }

  // End the chunked drawing: every chunk visible again, and the next draw
  // clears the drawing buffer. The canvas already holds what was drawn.
  private settle(): void {
    if (!this.accumulate) {
      return;
    }
    this.accumulate = false;
    this.next = 0;
    if (this.renderer) {
      this.renderer.autoClear = true;
    }
    for (const child of this.model?.children ?? []) {
      child.visible = true;
    }
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!this.renderer || !this.lit || !width || !height) {
      return;
    }
    if (width === this.width && height === this.height && !this.needsFit) {
      return;
    }
    // setSize clears the canvas, so the model is drawn again chunk by chunk.
    this.restart();
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    if (this.camera instanceof OrthographicCamera) {
      const half =
        ((this.camera.top - this.camera.bottom) / 2) * (width / height);
      this.camera.left = -half;
      this.camera.right = half;
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
    if (this.needsFit) {
      this.fit();
    }
    // At once: setSize clears the canvas, and the frame this observer runs in
    // is painted before a requested one.
    this.draw();
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.detach();
    this.onContextLost();
  };

  private readonly host: HTMLElement;
  private readonly onContextLost: () => void;
  private readonly scene = new Scene();
  // The direction the camera looks from, as seen from the model.
  private readonly view: Vector3;
  private readonly sphere = new Sphere();
  private readonly resizeObserver: ResizeObserver;
  private readonly themeObserver: MutationObserver;
  // The style data names the lights; these objects carry the mesh-light- names.
  private readonly rig = new Map<string, DirectionalLight | HemisphereLight>();
  private renderer: WebGLRenderer | null = null;
  // The environment is built and the model may be drawn.
  private lit = false;
  private environment: WebGLRenderTarget | null = null;
  private lighting: MeshLighting = 'studio';
  private ortho = false;
  private grid: Mesh | null = null;
  private gridOn = false;
  // The model's box, from the read, so the grid and the fit need no walk.
  private box: Box3 | null = null;
  // The chunks shown on the drawing buffer, one per animation frame; next
  // counts the chunks the pump has shown since the last restart.
  private pumpFrame = 0;
  private next = 0;
  // A model of several chunks is drawn one chunk per frame onto the drawing
  // buffer, so no frame draws more than one chunk.
  private accumulate = false;
  private readonly cameraMatrix = new Matrix4();
  private width = 0;
  private height = 0;
  // The shading state a chunk that arrives later takes.
  private flat = false;
  private wireframe = false;
  private near = 0.01;
  private far = 100;
  // First open frames the model, once the panel has a size.
  private needsFit = true;
  private frame = 0;
  // The motion window the rung shows in, the settle frame that brings the full
  // mesh back, and the ladder state the controller measures with. ACC-MESH-107.
  private motionUntil = 0;
  private grabbed = false;
  private settleTimer = 0;
  private window: number[] = [];
  private lastLevelDraw = 0;
  private restLevel = 0;
  private ceiling = 0;
  private upHold = 0;
  private upFrom = 0;
  private wantedLevel = 0;
  private pendingLevel = 0;
  private endLevel = LADDER_DEPTH;
  private ladder: Worker | null = null;
  private nodes: IMeshNodeRender[] = [];
  private rungs: BufferGeometry[][][] = [];
}
