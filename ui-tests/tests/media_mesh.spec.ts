import { expect, test } from '@jupyterlab/galata';

import { copyFileSync, existsSync, readFileSync, statSync } from 'fs';

import * as path from 'path';

import { deflateRawSync, deflateSync } from 'zlib';

const SHOWN = '.jp-MainAreaWidget:not(.lm-mod-hidden)';
const FACTORY = 'AdvancedMeshViewer';
const PLUGIN =
  '@stellarshenson/jupyterlab-advanced-image-viewer-extension:plugin';
const RELOAD = 'Reload mesh from disk';

// The STEP cube of tmp/workflows/mesh-viewer/spike/cube.stp: its part is Orange
// (1, 0.6, 0).
const CUBE = readFileSync(path.join(__dirname, 'fixtures', 'cube.stp'));

// ACC-MESH-105-REALFILE: the binary STL the Star Colonel supplied, 630884
// bytes and 12616 triangles.
const REAL = readFileSync(
  path.join(__dirname, 'fixtures', 'all-clamp-and-toes.stl')
);

// Models are made here, as the audio spec makes its WAV files. A triangle is
// nine numbers, its three corners in order.
type Point = number[];

const stl = (triangles: number[][]): Buffer => {
  const out = Buffer.alloc(84 + 50 * triangles.length);
  out.writeUInt32LE(triangles.length, 80);
  triangles.forEach((triangle, i) =>
    triangle.forEach((value, j) =>
      out.writeFloatLE(value, 84 + 50 * i + 12 + 4 * j)
    )
  );
  return out;
};

const quad = (a: Point, b: Point, c: Point, d: Point): number[][] => [
  [...a, ...b, ...c],
  [...a, ...c, ...d]
];

// A box of the given extents with outward normals, 12 triangles.
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

// The same triangles moved by the offset. FAR puts a model far from the origin,
// so a view that does not follow the model's centre shows nothing.
const FAR: Point = [1000, 2000, -500];
const moved = (triangles: number[][], offset: Point): number[][] =>
  triangles.map(t => t.map((value, i) => value + offset[i % 3]));

// A coarse globe of rows x columns x 2 triangles.
const globe = (rows = 8, columns = 16): number[][] => {
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

// A torus of rows x columns x 2 triangles: a curved surface to show a rim.
const torus = (big = 2, small = 0.7, rows = 24, columns = 12): number[][] => {
  const at = (i: number, j: number): Point => {
    const u = (2 * Math.PI * i) / rows;
    const v = (2 * Math.PI * j) / columns;
    return [
      (big + small * Math.cos(v)) * Math.cos(u),
      (big + small * Math.cos(v)) * Math.sin(u),
      small * Math.sin(v)
    ];
  };
  const triangles: number[][] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      triangles.push(
        ...quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1))
      );
    }
  }
  return triangles;
};

// A column of n flat sides, with neighbouring sides meeting at 360/n degrees.
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

// A closed UV sphere of 2 * rows * columns triangles, as
// tmp/workflows/mesh-viewer/fixtures/gen-stl.py generates it: the rings sit at
// half-step latitudes, so every triangle has three distinct corners. The
// per-facet normals stay zero, because the viewer recomputes them and only the
// record size matters. 998 x 998 is 1,992,008 triangles, 99,600,484 bytes.
const sphere = (rows: number, columns: number): Buffer => {
  const count = 2 * rows * columns;
  const out = Buffer.alloc(84 + 50 * count);
  out.writeUInt32LE(count, 80);
  const ring = (row: number): Float32Array => {
    const down = (Math.PI * (row + 0.5)) / rows;
    const sin = Math.sin(down);
    const z = Math.cos(down);
    const points = new Float32Array(columns * 3);
    for (let column = 0; column < columns; column++) {
      const around = (2 * Math.PI * column) / columns;
      points[column * 3] = sin * Math.cos(around);
      points[column * 3 + 1] = sin * Math.sin(around);
      points[column * 3 + 2] = z;
    }
    return points;
  };
  let record = 84;
  const corner = (points: Float32Array, column: number): void => {
    out.writeFloatLE(points[column * 3], record);
    out.writeFloatLE(points[column * 3 + 1], record + 4);
    out.writeFloatLE(points[column * 3 + 2], record + 8);
    record += 12;
  };
  const triangle = (
    a: Float32Array,
    ai: number,
    b: Float32Array,
    bi: number,
    c: Float32Array,
    ci: number
  ): void => {
    record += 12;
    corner(a, ai);
    corner(b, bi);
    corner(c, ci);
    record += 2;
  };
  for (let row = 0; row < rows - 1; row++) {
    const a = ring(row);
    const b = ring(row + 1);
    for (let column = 0; column < columns; column++) {
      const next = (column + 1) % columns;
      triangle(a, column, b, column, b, next);
      triangle(a, column, b, next, a, next);
    }
  }
  const pole = new Float32Array([0, 0, 1]);
  const south = new Float32Array([0, 0, -1]);
  const top = ring(0);
  const bottom = ring(rows - 1);
  for (let column = 0; column < columns; column++) {
    const next = (column + 1) % columns;
    triangle(pole, 0, top, column, top, next);
    triangle(bottom, column, south, 0, bottom, next);
  }
  return out;
};

const ascii = (triangles: number[][]): string =>
  [
    'solid generated',
    ...triangles.map(t =>
      [
        'facet normal 0 0 0',
        'outer loop',
        `vertex ${t[0]} ${t[1]} ${t[2]}`,
        `vertex ${t[3]} ${t[4]} ${t[5]}`,
        `vertex ${t[6]} ${t[7]} ${t[8]}`,
        'endloop',
        'endfacet'
      ].join('\n')
    ),
    'endsolid generated'
  ].join('\n');

// The numbers of the triangles, in order.
const corners = (triangles: number[][]): number[] =>
  ([] as number[]).concat(...triangles);

// A PLY surface: every triangle gets its own three vertices, all of them in the
// one colour, as uchar red, green and blue.
const plySurface = (
  triangles: number[][],
  colour: [number, number, number] = [255, 128, 0]
): string => {
  const vertices: number[][] = [];
  for (const triangle of triangles) {
    for (const start of [0, 3, 6]) {
      vertices.push([
        triangle[start],
        triangle[start + 1],
        triangle[start + 2],
        ...colour
      ]);
    }
  }
  return [
    'ply',
    'format ascii 1.0',
    'comment generated',
    `element vertex ${vertices.length}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${triangles.length}`,
    'property list uchar int vertex_indices',
    'end_header',
    ...vertices.map(vertex => vertex.join(' ')),
    ...triangles.map((_, i) => `3 ${3 * i} ${3 * i + 1} ${3 * i + 2}`),
    ''
  ].join('\n');
};

// A PLY surface with one colour for each group of triangles, so every side of
// a cube is told apart by colour.
const plyColoured = (
  groups: [number[][], [number, number, number]][]
): string => {
  const triangles: number[][] = [];
  const colours: [number, number, number][] = [];
  for (const [group, colour] of groups) {
    for (const triangle of group) {
      triangles.push(triangle);
      colours.push(colour);
    }
  }
  const vertices: number[][] = [];
  for (const [index, triangle] of triangles.entries()) {
    for (const start of [0, 3, 6]) {
      vertices.push([
        triangle[start],
        triangle[start + 1],
        triangle[start + 2],
        ...colours[index]
      ]);
    }
  }
  return [
    'ply',
    'format ascii 1.0',
    'comment generated',
    `element vertex ${vertices.length}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${triangles.length}`,
    'property list uchar int vertex_indices',
    'end_header',
    ...vertices.map(vertex => vertex.join(' ')),
    ...triangles.map((_, i) => `3 ${3 * i} ${3 * i + 1} ${3 * i + 2}`),
    ''
  ].join('\n');
};

// The six sides of box(2, 2, 2) in its own order: +Z, -Z, +X, -X, +Y, -Y.
const CUBE_COLOURS: [number, number, number][] = [
  [255, 0, 255],
  [0, 255, 255],
  [0, 0, 255],
  [255, 255, 0],
  [0, 255, 0],
  [255, 0, 0]
];

// ACC-MESH-104-VIEWS: a cube with a colour on every side, so a screenshot
// says which sides face the camera and how the model is rolled.
const colourCube = (): string => {
  const faces = box(2, 2, 2);
  return plyColoured(
    CUBE_COLOURS.map(
      (colour, i) =>
        [faces.slice(2 * i, 2 * i + 2), colour] as [
          number[][],
          [number, number, number]
        ]
    )
  );
};

// A PLY point cloud: a square grid of vertices and no faces.
const plyPoints = (side: number): string => {
  const vertices: string[] = [];
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      vertices.push(
        `${(2 * i) / (side - 1) - 1} ${(2 * j) / (side - 1) - 1} 0`
      );
    }
  }
  return [
    'ply',
    'format ascii 1.0',
    `element vertex ${vertices.length}`,
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    ...vertices,
    ''
  ].join('\n');
};

// An OBJ naming a material file that is not there.
const obj = (triangles: number[][]): string => {
  const values = corners(triangles);
  const vertices: string[] = [];
  for (let i = 0; i < values.length; i += 3) {
    vertices.push(`v ${values[i]} ${values[i + 1]} ${values[i + 2]}`);
  }
  return [
    'mtllib missing.mtl',
    'o generated',
    ...vertices,
    ...triangles.map((_, i) => `f ${3 * i + 1} ${3 * i + 2} ${3 * i + 3}`),
    ''
  ].join('\n');
};

// An OBJ point cloud: vertices and no faces.
const objPoints = (side: number): string => {
  const vertices: string[] = [];
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      vertices.push(
        `v ${(2 * i) / (side - 1) - 1} ${(2 * j) / (side - 1) - 1} 0`
      );
    }
  }
  return [...vertices, ''].join('\n');
};

const CRC_TABLE = Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

// The 3MF fixtures are tens of megabytes before compression, so the checksum
// is table-driven.
const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// A ZIP of entries, stored unless deflate is set, which is what a 3MF package
// is.
const zip = (files: [string, string][], deflate = false): Buffer => {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8');
    const payload = deflate ? deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    const entry = Buffer.alloc(46 + nameBytes.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(payload.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    nameBytes.copy(entry, 46);
    parts.push(local, payload);
    central.push(entry);
    offset += local.length + payload.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
};

// A 3MF with one object in one Orange base material.
const threemf = (triangles: number[][]): Buffer => {
  const vertices: number[][] = [];
  const faces: string[] = [];
  for (const triangle of triangles) {
    const index = vertices.length;
    for (const start of [0, 3, 6]) {
      vertices.push([
        triangle[start],
        triangle[start + 1],
        triangle[start + 2]
      ]);
    }
    faces.push(
      `<triangle v1="${index}" v2="${index + 1}" v3="${
        index + 2
      }" pid="1" p1="0"/>`
    );
  }
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '<resources>',
    '<basematerials id="1"><base name="Orange" displaycolor="#FF8000"/></basematerials>',
    '<object id="2" type="model"><mesh><vertices>',
    ...vertices.map(v => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`),
    '</vertices><triangles>',
    ...faces,
    '</triangles></mesh></object>',
    '</resources>',
    '<build><item objectid="2"/></build>',
    '</model>',
    ''
  ].join('\n');
  const rels = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
    '</Relationships>',
    ''
  ].join('\n');
  return zip([
    ['_rels/.rels', rels],
    ['3D/3dmodel.model', model]
  ]);
};

// A 3MF of an indexed grid of about the given triangle count. The coordinates
// repeat along each row and column, so the XML shrinks far below its expanded
// size, and the file is deflated as a real exporter would write it.
const threemfGrid = (triangles: number): Buffer => {
  const side = Math.ceil(Math.sqrt(triangles / 2));
  const coordinate = (index: number): string =>
    ((2 * index) / (side - 1) - 1).toFixed(3);
  const vertices: string[] = [];
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      vertices.push(
        `<vertex x="${coordinate(column)}" y="${coordinate(row)}" z="0"/>`
      );
    }
  }
  const faces: string[] = [];
  const at = (row: number, column: number): number => row * side + column;
  for (let row = 0; row < side - 1; row++) {
    for (let column = 0; column < side - 1; column++) {
      const a = at(row, column);
      const b = at(row + 1, column);
      const c = at(row + 1, column + 1);
      const d = at(row, column + 1);
      faces.push(
        `<triangle v1="${a}" v2="${b}" v3="${c}" pid="1" p1="0"/>`,
        `<triangle v1="${a}" v2="${c}" v3="${d}" pid="1" p1="0"/>`
      );
    }
  }
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '<resources>',
    '<basematerials id="1"><base name="Orange" displaycolor="#FF8000"/></basematerials>',
    '<object id="2" type="model"><mesh><vertices>',
    ...vertices,
    '</vertices><triangles>',
    ...faces,
    '</triangles></mesh></object>',
    '</resources>',
    '<build><item objectid="2"/></build>',
    '</model>',
    ''
  ].join('\n');
  const rels = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
    '</Relationships>',
    ''
  ].join('\n');
  return zip(
    [
      ['_rels/.rels', rels],
      ['3D/3dmodel.model', model]
    ],
    true
  );
};

// A PNG chunk: its length, type, data and CRC.
const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

// A 2x2 PNG of one colour.
const png = (colour: [number, number, number]): Buffer => {
  const row = Buffer.from([0, ...colour, 255, ...colour, 255]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat([row, row]))),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

interface IGlb {
  // Use a 2x2 Orange PNG as the base colour of the one material.
  texture?: boolean;
  // Declare this extension as used and required.
  compression?: string;
  // A second node that references the same mesh.
  instance?: boolean;
  // Declare KHR_materials_unlit on the material.
  unlit?: boolean;
  // A POINTS primitive: every three numbers are one vertex, not a triangle.
  points?: boolean;
}

// A binary glTF with one mesh in one material.
const glb = (triangles: number[][], options: IGlb = {}): Buffer => {
  const values = corners(triangles);
  const count = values.length / 3;
  const positions = Buffer.alloc(4 * values.length);
  values.forEach((value, i) => positions.writeFloatLE(value, 4 * i));
  const axis = (which: number, least: boolean) =>
    Math[least ? 'min' : 'max'](...values.filter((_, i) => i % 3 === which));
  const views: object[] = [
    { buffer: 0, byteOffset: 0, byteLength: positions.length }
  ];
  const accessors: object[] = [
    {
      bufferView: 0,
      componentType: 5126,
      count,
      type: 'VEC3',
      min: [0, 1, 2].map(which => axis(which, true)),
      max: [0, 1, 2].map(which => axis(which, false))
    }
  ];
  const attributes: { [name: string]: number } = { POSITION: 0 };
  const parts: Buffer[] = [positions];
  let offset = positions.length;
  const add = (data: Buffer): number => {
    const view =
      views.push({ buffer: 0, byteOffset: offset, byteLength: data.length }) -
      1;
    parts.push(data);
    offset += data.length;
    return view;
  };
  if (options.texture) {
    const uvs = Buffer.alloc(8 * count);
    for (let i = 0; i < count; i++) {
      uvs.writeFloatLE(0.5, 8 * i);
      uvs.writeFloatLE(0.5, 8 * i + 4);
    }
    accessors.push({
      bufferView: add(uvs),
      componentType: 5126,
      count,
      type: 'VEC2'
    });
    attributes.TEXCOORD_0 = 1;
  }
  const json: any = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: options.instance ? [0, 1] : [0] }],
    nodes: options.instance
      ? [{ mesh: 0 }, { mesh: 0, translation: [2, 0, 0] }]
      : [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          { attributes, material: 0, ...(options.points ? { mode: 0 } : {}) }
        ]
      }
    ],
    materials: [
      {
        pbrMetallicRoughness: options.texture
          ? {
              baseColorTexture: { index: 0 },
              metallicFactor: 0,
              roughnessFactor: 0.6
            }
          : {
              baseColorFactor: [1, 0.25, 0, 1],
              metallicFactor: 0,
              roughnessFactor: 0.6
            }
      }
    ],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }]
  };
  if (options.unlit) {
    json.materials[0].extensions = { KHR_materials_unlit: {} };
  }
  if (options.texture) {
    json.textures = [{ source: 0 }];
    json.images = [
      { bufferView: add(png([255, 128, 0])), mimeType: 'image/png' }
    ];
    json.samplers = [
      { magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }
    ];
  }
  const used = [
    ...(options.unlit ? ['KHR_materials_unlit'] : []),
    ...(options.compression ? [options.compression] : [])
  ];
  if (used.length) {
    json.extensionsUsed = used;
  }
  if (options.compression) {
    json.extensionsRequired = [options.compression];
  }
  const body = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([
    body,
    Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)
  ]);
  const bin = Buffer.concat(parts);
  const binChunk = Buffer.concat([
    bin,
    Buffer.alloc((4 - (bin.length % 4)) % 4)
  ]);
  const chunkHeader = (length: number, type: number): Buffer => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(length, 0);
    header.writeUInt32LE(type, 4);
    return header;
  };
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  return Buffer.concat([
    header,
    chunkHeader(jsonChunk.length, 0x4e4f534a),
    jsonChunk,
    chunkHeader(binChunk.length, 0x004e4942),
    binChunk
  ]);
};

// A GLB point cloud: a grid of vertices in one POINTS primitive.
const glbPoints = (side: number): Buffer => {
  const points: number[][] = [];
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      points.push([(2 * i) / (side - 1) - 1, (2 * j) / (side - 1) - 1, 0]);
    }
  }
  return glb(points, { points: true });
};

interface IShot {
  width: number;
  height: number;
  background: number[];
  // Pixels that differ from the corner background.
  covered: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  // Distinct colours among the covered pixels.
  colours: number;
  // Covered pixels that are orange: the red channel well above the other two.
  warm: number;
  // Rows whose first covered pixel lies between the background and the model.
  rows: number;
  mixedRows: number;
  // The largest colour change over two pixels along the middle row, inside the
  // model: a large one is a sharp edge.
  largestStep: number;
  // Covered pixels in each row of the shot.
  perRow: number[];
  // Mean level of a coarse grid, to tell two views apart.
  grid: number[];
}

// Decodes a screenshot of the viewer in the page and counts its pixels. No
// golden image: renderers differ, so only measured properties are compared.
const measure = async (page: any): Promise<IShot> => {
  await settled(page);
  // Another extension's notification floats over the page. It is not part of
  // the viewer, so it is kept out of every screenshot this measurement reads.
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll<HTMLElement>(
      '.Toastify__toast-container, .jp-toastContainer'
    )) {
      toast.style.display = 'none';
    }
  });
  const shot: Buffer = await viewer(page).screenshot();
  return page.evaluate(async (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' })
    );
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const index = (x: number, y: number) => 4 * (y * width + x);
    // The toolbar's shadow falls on the first rows, which are left out.
    const firstRow = 8;
    const background = [
      data[index(0, firstRow)],
      data[index(0, firstRow) + 1],
      data[index(0, firstRow) + 2]
    ];
    const distance = (i: number) =>
      Math.max(
        Math.abs(data[i] - background[0]),
        Math.abs(data[i + 1] - background[1]),
        Math.abs(data[i + 2] - background[2])
      );
    const isModel = (x: number, y: number) => distance(index(x, y)) > 4;
    let covered = 0;
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    const colours = new Set<number>();
    const perRow = new Array(height).fill(0);
    const grid = new Array(32 * 20).fill(0);
    let warm = 0;
    for (let y = firstRow; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = index(x, y);
        const cell =
          Math.floor((y * 20) / height) * 32 + Math.floor((x * 32) / width);
        grid[cell] += data[i] + data[i + 1] + data[i + 2];
        if (isModel(x, y)) {
          covered++;
          perRow[y]++;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
          if (
            data[i] > 1.15 * data[i + 1] &&
            data[i] > 1.5 * data[i + 2] &&
            data[i] > 24
          ) {
            warm++;
          }
        }
      }
    }
    const perCell = (3 * width * height) / (32 * 20);
    let rows = 0;
    let mixedRows = 0;
    for (let y = top; y <= bottom; y++) {
      let x = 0;
      while (x < width - 3 && !isModel(x, y)) {
        x++;
      }
      if (x < width - 3) {
        rows++;
        const inner = distance(index(x + 3, y));
        if (distance(index(x, y)) < 0.85 * inner) {
          mixedRows++;
        }
      }
    }
    let largestStep = 0;
    const middle = Math.floor((top + bottom) / 2);
    let first = 0;
    while (first < width && !isModel(first, middle)) {
      first++;
    }
    let last = width - 1;
    while (last > 0 && !isModel(last, middle)) {
      last--;
    }
    for (let x = first + 4; x + 6 < last; x++) {
      const a = index(x, middle);
      const b = index(x + 2, middle);
      largestStep = Math.max(
        largestStep,
        Math.abs(data[a] - data[b]),
        Math.abs(data[a + 1] - data[b + 1]),
        Math.abs(data[a + 2] - data[b + 2])
      );
    }
    return {
      width,
      height,
      background,
      covered,
      left,
      right,
      top,
      bottom,
      colours: colours.size,
      warm,
      rows,
      mixedRows,
      largestStep,
      perRow,
      grid: grid.map(value => value / perCell)
    };
  }, shot.toString('base64'));
};

const centreX = (shot: IShot) => (shot.left + shot.right) / 2;
const centreY = (shot: IShot) => (shot.top + shot.bottom) / 2;
const boxWidth = (shot: IShot) => shot.right - shot.left + 1;
const boxHeight = (shot: IShot) => shot.bottom - shot.top + 1;
const change = (a: IShot, b: IShot) =>
  a.grid.reduce((sum, value, i) => sum + Math.abs(value - b.grid[i]), 0) /
  a.grid.length;
// The same change over the model's own pixels: the background does not change,
// so the whole-viewer mean falls as the viewer widens while the model's mean
// level stays the same.
const modelChange = (a: IShot, b: IShot) =>
  (change(a, b) * a.width * a.height) / a.covered;

// Fit centres the bounding sphere. In perspective the near corner of a cube
// draws larger, which moves its outline 6.3% of the height from the centre: at
// this view, the top reaches 0.22 and the bottom 0.30 of the half height
// tan(17.5 degrees) = 0.315 per unit of depth.
const expectFramed = (
  shot: Pick<IShot, 'width' | 'height' | 'left' | 'right' | 'top' | 'bottom'>
) => {
  expect(Math.abs(centreX(shot) - shot.width / 2)).toBeLessThan(
    shot.width * 0.08
  );
  expect(Math.abs(centreY(shot) - shot.height / 2)).toBeLessThan(
    shot.height * 0.08
  );
  const shorter = Math.min(shot.width, shot.height);
  expect(Math.min(boxWidth(shot), boxHeight(shot))).toBeGreaterThan(
    shorter * 0.5
  );
  // The whole model is on show: no panel edge cuts it. The first rows are left
  // out of the measure, so a model cut at the top starts at row 8.
  expect(shot.left).toBeGreaterThan(0);
  expect(shot.right).toBeLessThan(shot.width - 1);
  expect(shot.top).toBeGreaterThan(8);
  expect(shot.bottom).toBeLessThan(shot.height - 1);
};

// The model is on show: no sentence, and more pixels than a sentence covers
// (1310 to 2780 at the panel size of these tests; a cube covers over 100000).
const modelOnShow = async (page: any): Promise<IShot> => {
  await expect(message(page)).toHaveText('');
  const shot = await measure(page);
  expect(shot.covered).toBeGreaterThan(5000);
  return shot;
};

const viewer = (page: any) => page.locator(`${SHOWN} .jp-AdvancedMeshViewer`);
const toolbar = (page: any) => page.locator(`${SHOWN} .jp-Toolbar`);
const details = (page: any) =>
  toolbar(page).locator('.jp-AdvancedMediaViewer-details');
const message = (page: any) => viewer(page).locator('[role="status"]');
const button = (page: any, title: string) =>
  toolbar(page).locator(`[title="${title}"]`).first();
const labelled = (page: any, label: string) =>
  toolbar(page).locator(`button[aria-label="${label}"]`);
// An icon button takes its aria-label from the tooltip, and a toggle's
// tooltip follows its pressed state, so a toggle is located by item name.
const item = (page: any, name: string) =>
  toolbar(page).locator(`[data-jp-item-name="${name}"] button`);
const toggle = (page: any, name: string) => item(page, `advanced-${name}`);
const tabs = (page: any) =>
  page.locator('#jp-main-dock-panel .lm-TabBar-tabLabel');
const currentTab = (page: any) =>
  page.locator(
    '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current .lm-TabBar-tabLabel'
  );

// Rendering is coalesced through requestAnimationFrame, so two frames later
// whatever was requested has been drawn.
const settled = (page: any): Promise<void> =>
  page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );

// A screenshot of the viewer alone, with another extension's floating
// notification kept out of it as measure() does.
const shotOf = async (page: any): Promise<Buffer> => {
  await settled(page);
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll<HTMLElement>(
      '.Toastify__toast-container, .jp-toastContainer'
    )) {
      toast.style.display = 'none';
    }
  });
  return viewer(page).screenshot();
};

// Open with a double click, the default viewer, and wait for the read-out.
const open = async (page: any, file: string) => {
  await page.filebrowser.open(file);
  await viewer(page).waitFor();
  await expect(details(page)).toHaveText(/./, { timeout: 30000 });
  await expect(message(page)).toHaveText('');
};

const upload = (page: any, file: string, content: Buffer) =>
  page.contents.uploadContent(content.toString('base64'), 'base64', file);

// The 1 GiB fixture of ACC-MESH-110 and DEF-MESH-19, and the 1M fixture of
// ACC-MESH-107, generated once under tmp/workflows/mesh-viewer/fixtures/. The
// contents API refuses a body over the server's 512 MiB request limit, so the
// file is copied into the server root, which the /files/ handler serves;
// without that root in the environment the test skips.
const LARGE = 'stl-1gib.stl';
const LARGE_BYTES = 1_073_217_684;
const MILLION = 'stl-1m.stl';
const MILLION_BYTES = 50_000_084;

const rootFile = (name: string, bytes: number): string | null => {
  const root = process.env.JUPYTERLAB_GALATA_ROOT_DIR;
  if (!root) {
    return null;
  }
  const target = path.join(root, name);
  if (!existsSync(target) || statSync(target).size !== bytes) {
    const source = path.join(
      __dirname,
      '..',
      '..',
      'tmp',
      'workflows',
      'mesh-viewer',
      'fixtures',
      name
    );
    if (!existsSync(source) || statSync(source).size !== bytes) {
      return null;
    }
    copyFileSync(source, target);
  }
  // The file browser starts in the test directory, so the root path is named.
  return `/${name}`;
};

const largeFile = (): string | null => rootFile(LARGE, LARGE_BYTES);

// The main thread is one thread of one frame: a requestAnimationFrame callback
// that comes late is a task that held the thread. The probe records every gap
// and the gaps over 200 ms with their time since the start.
interface IGapProbe {
  frames: number;
  max: number;
  over: number[][];
  tasks: number[][];
}

const watchFrames = (page: any): Promise<void> =>
  page.evaluate(() => {
    const probe: IGapProbe = { frames: 0, max: 0, over: [], tasks: [] };
    (window as any).gapProbe = probe;
    (window as any).gapStart = performance.now();
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        probe.tasks.push([
          Math.round(entry.startTime - (window as any).gapStart),
          Math.round(entry.duration)
        ]);
      }
    }).observe({ entryTypes: ['longtask'] });
    let last = performance.now();
    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      probe.frames++;
      probe.max = Math.max(probe.max, gap);
      if (gap > 200) {
        probe.over.push([
          Math.round(now - (window as any).gapStart),
          Math.round(gap)
        ]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const frameGaps = (page: any): Promise<IGapProbe> =>
  page.evaluate(() => (window as any).gapProbe);

// ACC-MESH-107-PERF-FPS: a drawn frame is one requestAnimationFrame turn with
// at least one WebGL draw on a canvas inside the viewer. Counting rAF
// callbacks would count the display refreshing while nothing redraws.
interface IDrawProbe {
  ticks: number;
  frames: number;
  draws: number;
  elapsed: number;
  renderer: string;
  tickMedian: number;
  tickMax: number;
  drawnMedian: number;
  drawnMax: number;
}

const watchDraws = (page: any): Promise<void> =>
  page.evaluate(() => {
    const state = {
      ticks: 0,
      frames: 0,
      draws: 0,
      drawSinceTick: 0,
      started: 0,
      lastTick: 0,
      lastDrawn: 0,
      intervals: [] as number[],
      drawnIntervals: [] as number[],
      renderer: ''
    };
    (window as any).drawProbe = state;
    state.lastTick = performance.now();
    const wrap = (proto: any, name: string): void => {
      if (!proto || typeof proto[name] !== 'function') {
        return;
      }
      const original = proto[name];
      proto[name] = function (this: any, ...args: any[]) {
        const canvas = this.canvas;
        if (
          canvas &&
          canvas.closest &&
          canvas.closest('.jp-AdvancedMeshViewer')
        ) {
          if (!state.renderer) {
            const debug = this.getExtension('WEBGL_debug_renderer_info');
            state.renderer = debug
              ? this.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : this.getParameter(this.RENDERER);
          }
          state.draws++;
          state.drawSinceTick++;
        }
        return original.apply(this, args);
      };
    };
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = (window as any)[name]?.prototype;
      wrap(proto, 'drawElements');
      wrap(proto, 'drawArrays');
    }
    const tick = (now: number): void => {
      state.ticks++;
      const interval = now - state.lastTick;
      state.lastTick = now;
      state.intervals.push(interval);
      if (state.drawSinceTick > 0) {
        state.frames++;
        state.drawnIntervals.push(interval);
        state.lastDrawn = now;
      }
      state.drawSinceTick = 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const resetDraws = (page: any): Promise<void> =>
  page.evaluate(() => {
    const state = (window as any).drawProbe;
    state.ticks = 0;
    state.frames = 0;
    state.draws = 0;
    state.drawSinceTick = 0;
    state.intervals = [];
    state.drawnIntervals = [];
    state.lastTick = performance.now();
    state.started = performance.now();
  });

const drawReport = (page: any): Promise<IDrawProbe> =>
  page.evaluate(() => {
    const state = (window as any).drawProbe;
    const median = (values: number[]): number => {
      if (!values.length) {
        return 0;
      }
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    return {
      ticks: state.ticks,
      frames: state.frames,
      draws: state.draws,
      elapsed: performance.now() - state.started,
      renderer: state.renderer,
      tickMedian: median(state.intervals),
      tickMax: Math.max(0, ...state.intervals),
      drawnMedian: median(state.drawnIntervals),
      drawnMax: Math.max(0, ...state.drawnIntervals)
    };
  });

// The used and backing-store bytes of the page and of every worker it starts,
// summed, sampled from this process over CDP. performance.memory reports the
// page's isolate only, so it cannot see the worker that reads the file, and the
// page's own timer cannot run while its main thread is blocked.
interface IHeapWatch {
  peak: () => number;
  pagePeak: () => number;
  workerPeak: () => number;
  measure: () => Promise<number>;
  stop: () => Promise<void>;
}

const watchHeap = async (page: any): Promise<IHeapWatch> => {
  const raw = (page as any).page ?? page;
  const cdp = await raw.context().newCDPSession(raw);
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: false
  });
  const workers = new Map<string, number>();
  const waiting = new Map<
    number,
    { sessionId: string; resolve: (value: any) => void }
  >();
  let nextId = 0;
  cdp.on('Target.attachedToTarget', (event: any) => {
    if (event.targetInfo.type === 'worker') {
      workers.set(event.sessionId, 0);
    }
  });
  cdp.on('Target.detachedFromTarget', (event: any) => {
    workers.delete(event.sessionId);
    // A message in flight to a worker that is gone is never answered, and the
    // sampling loop must not wait for it.
    for (const [id, entry] of [...waiting]) {
      if (entry.sessionId === event.sessionId) {
        waiting.delete(id);
        entry.resolve(null);
      }
    }
  });
  cdp.on('Target.receivedMessageFromTarget', (event: any) => {
    let message: any;
    try {
      message = JSON.parse(event.message);
    } catch {
      return;
    }
    const entry = waiting.get(message.id);
    if (entry) {
      waiting.delete(message.id);
      entry.resolve(message.result);
    }
  });
  const tell = (sessionId: string, method: string): Promise<any> =>
    new Promise(resolve => {
      const id = ++nextId;
      const entry = { sessionId, resolve };
      waiting.set(id, entry);
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params: {} })
        })
        .catch(() => {
          if (waiting.get(id) === entry) {
            waiting.delete(id);
          }
          resolve(null);
        });
    });
  const bytes = (usage: any): number =>
    usage ? usage.usedSize + (usage.backingStorageSize ?? 0) : 0;
  const sample = async (): Promise<number> => {
    let total = bytes(await cdp.send('Runtime.getHeapUsage').catch(() => null));
    for (const sessionId of [...workers.keys()]) {
      const usage = await tell(sessionId, 'Runtime.getHeapUsage');
      if (usage) {
        workers.set(sessionId, bytes(usage));
      } else {
        workers.delete(sessionId);
      }
    }
    for (const usage of workers.values()) {
      total += usage;
    }
    return total;
  };
  const collect = async (): Promise<void> => {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
    for (const sessionId of [...workers.keys()]) {
      await tell(sessionId, 'HeapProfiler.collectGarbage');
    }
  };
  let peak = 0;
  let pagePeak = 0;
  let workerPeak = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      const total = await sample().catch(() => 0);
      peak = Math.max(peak, total);
      let pageOnly = total;
      for (const usage of workers.values()) {
        workerPeak = Math.max(workerPeak, usage);
        pageOnly -= usage;
      }
      pagePeak = Math.max(pagePeak, pageOnly);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  })();
  return {
    peak: () => peak,
    pagePeak: () => pagePeak,
    workerPeak: () => workerPeak,
    measure: async () => {
      await collect();
      return sample();
    },
    stop: async () => {
      running = false;
      await loop;
    }
  };
};

// The chunks are all in the model from the start and drawn one per animation
// frame, so the model is complete when a part is up and the chunked drawing
// has ended.
const modelBuilt = (page: any): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>(resolve => {
        const check = (): void => {
          const scene = (window as any).jupyterapp.shell.currentWidget?.content
            ?.scene;
          const count = scene?.model?.children?.length ?? 0;
          if (count > 0 && scene.accumulate === false) {
            resolve();
            return;
          }
          setTimeout(check, 50);
        };
        check();
      })
  );

const camera = (page: any): Promise<number[]> =>
  page.evaluate(() =>
    (
      window as any
    ).jupyterapp.shell.currentWidget.content.scene.camera.position.toArray()
  );

// The camera's position and its distance from the orbit target, so an orbit
// and a zoom are each shown to have moved the view.
const cameraView = (
  page: any
): Promise<{
  position: number[];
  distance: number;
}> =>
  page.evaluate(() => {
    const scene = (window as any).jupyterapp.shell.currentWidget.content.scene;
    const position = scene.camera.position.toArray() as number[];
    const target = scene.controls.target.toArray() as number[];
    return {
      position,
      distance: Math.hypot(
        position[0] - target[0],
        position[1] - target[1],
        position[2] - target[2]
      )
    };
  });

// The ladder's state and what is on show, plus its own verdict, all read from
// the live scene. ACC-MESH-107.
const proxyState = (
  page: any
): Promise<{
  slow: boolean;
  proxy: boolean;
  levels: number[];
  level: number;
  levelTriangles: number;
  levelFits: boolean;
  floorMiss: boolean;
  restLevel: number;
  modelVisible: boolean;
  proxyVisible: boolean;
}> =>
  page.evaluate(() => {
    const scene = (window as any).jupyterapp.shell.currentWidget?.content
      ?.scene;
    const levels: number[] = scene?.levels ?? [];
    const level: number = scene?.level ?? 0;
    return {
      slow: scene?.slow === true,
      proxy: !!scene?.proxy,
      levels,
      level,
      levelTriangles: level > 0 ? (levels[level - 1] ?? 0) : 0,
      levelFits: scene?.levelFits === true,
      floorMiss: scene?.floorMiss === true,
      restLevel: scene?.restLevel ?? 0,
      modelVisible: scene?.model?.visible === true,
      proxyVisible: scene?.proxy?.visible === true
    };
  });

// Five seconds of orbit and zoom with trusted mouse input sent over CDP
// without awaiting each event, so the input rate is not what the assertion
// measures: at most four events in flight, one move every 16 ms, and one
// wheel event every 16 ms in the zoom phase. The wheel steps are equal in and
// out so the zoom oscillates at the fitted framing, and a final inward notch
// leaves the position closer; a drifting zoom would fill the viewport, where
// the software rasterizer's shaded-pixel cost, not the triangle level, sets
// the frame time. The first four seconds hold a drag; the last second releases
// and sends the wheel zooms, which OrbitControls applies because no button is
// down. A warm-up call with `wheel` false drags for the whole window and never
// zooms, so the measured window that follows starts at the fitted framing.
// Returns after the chunk pump has settled and the last drawn frame is at
// least a second old, because a pipelined input queue can outlast the input
// window.
const orbitPipelined = async (page: any, windowMs: number, wheel = true) => {
  const panel = (await viewer(page).boundingBox())!;
  const cx = panel.x + panel.width / 2;
  const cy = panel.y + panel.height / 2;
  const raw = (page as any).page ?? page;
  const cdp = await raw.context().newCDPSession(raw);
  const send = (params: any): Promise<any> =>
    cdp.send('Input.dispatchMouseEvent', params);
  const pending: Promise<any>[] = [];
  const flush = async (): Promise<void> => {
    if (pending.length) {
      await Promise.all(pending.splice(0));
    }
  };
  await page.mouse.move(cx, cy);
  const before = await cameraView(page);
  pending.push(
    send({
      type: 'mousePressed',
      x: cx,
      y: cy,
      button: 'left',
      buttons: 1,
      clickCount: 1
    })
  );
  await resetDraws(page);
  const started = Date.now();
  let sent = 0;
  let angle = 0;
  // Sampled while the input is still moving, so the rung on show is read
  // before the settle frame brings the full mesh back.
  let during: any = null;
  while (Date.now() - started < windowMs * (wheel ? 0.8 : 1)) {
    if (during === null && Date.now() - started >= windowMs * 0.6) {
      await flush();
      during = await proxyState(page);
    }
    angle += 0.07;
    pending.push(
      send({
        type: 'mouseMoved',
        x: cx + 130 * Math.cos(angle),
        y: cy + 65 * Math.sin(angle),
        button: 'left',
        buttons: 1
      })
    );
    sent++;
    if (pending.length >= 4) {
      await flush();
    }
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  pending.push(
    send({
      type: 'mouseReleased',
      x: cx,
      y: cy,
      button: 'left',
      buttons: 0,
      clickCount: 1
    })
  );
  if (wheel) {
    while (Date.now() - started < windowMs) {
      pending.push(
        send({
          type: 'mouseWheel',
          x: cx,
          y: cy,
          deltaX: 0,
          deltaY: sent % 2 ? -60 : 60,
          buttons: 0
        })
      );
      sent++;
      if (pending.length >= 4) {
        await flush();
      }
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    // Equal steps return the camera to the fitted radius, so the zoom
    // oscillates around the framing the floor was measured at instead of
    // drifting into a full-screen fill where the frame time is set by shaded
    // pixels, not by the triangle level. The number of steps sent depends on
    // the drag's timing, so the last alternating step can leave the camera on
    // either side; a final inward notch of 120 is a 6 percent step from both
    // states and always leaves the final framing closer than the start.
    pending.push(
      send({
        type: 'mouseWheel',
        x: cx,
        y: cy,
        deltaX: 0,
        deltaY: -120,
        buttons: 0
      })
    );
    sent++;
  }
  const report = await drawReport(page);
  await flush();
  // Nothing may draw between the last input and the idle window: the pump
  // after the last restart has to finish, and the queue has to empty.
  await page.waitForFunction(
    () => {
      const state = (window as any).drawProbe;
      const scene = (window as any).jupyterapp.shell.currentWidget?.content
        ?.scene;
      const sorted = [...state.drawnIntervals].sort(
        (a: number, b: number) => a - b
      );
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      return (
        (scene?.model?.children?.length ?? 0) > 0 &&
        scene.accumulate === false &&
        state.lastDrawn > 0 &&
        performance.now() - state.lastDrawn > Math.max(1000, 2 * median)
      );
    },
    undefined,
    { timeout: 60000, polling: 100 }
  );
  const after = await cameraView(page);
  return { sent, report, before, after, during };
};

const drag = async (
  page: any,
  button: 'left' | 'right',
  dx: number,
  dy: number
) => {
  const panel = (await viewer(page).boundingBox())!;
  const x = panel.x + panel.width / 2;
  const y = panel.y + panel.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up({ button });
};

const setSetting = (page: any, key: string, value: unknown) =>
  page.evaluate(
    async ([plugin, k, v]: [string, string, unknown]) => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      await registry.set(plugin, k, v);
    },
    [PLUGIN, key, value]
  );

// A colour as the browser resolves it, as three numbers.
const resolved = (page: any, colour: string): Promise<number[]> =>
  page.evaluate((c: string) => {
    const probe = document.createElement('span');
    probe.style.color = c;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return (value.match(/[\d.]+/g) as string[]).slice(0, 3).map(Number);
  }, colour);

// A toolbar menu: its button, then the item whose label is exact.
const choose = async (page: any, menu: string, label: string) => {
  await item(page, menu).click();
  await page
    .locator('.lm-Menu-itemLabel')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
  await settled(page);
};

// The camera's kind, its up axis and the orbit target.
const cameraState = (page: any) =>
  page.evaluate(() => {
    const { scene } = (window as any).jupyterapp.shell.currentWidget.content;
    return {
      // three.js leaves the opposite-kind flag undefined, not false.
      orthographic: scene.camera.isOrthographicCamera === true,
      up: scene.camera.up.toArray() as number[],
      target: scene.controls.target.toArray() as number[]
    };
  });

// The measure-contrast.py and measure-faces.py method: the panel colour at
// (2,10), the covered mask, an erosion of 6 px, every second interior pixel,
// and three luminance clusters. Returns contrast ratios against the panel.
const contrastReport = async (page: any, shot: Buffer) =>
  page.evaluate(async (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' })
    );
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const linear = (c: number) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (i: number) =>
      0.2126 * linear(data[i]) +
      0.7152 * linear(data[i + 1]) +
      0.0722 * linear(data[i + 2]);
    const panelIndex = 4 * (10 * width + 2);
    const panel = [
      data[panelIndex],
      data[panelIndex + 1],
      data[panelIndex + 2]
    ];
    const panelL = lum(panelIndex);
    const contrast = (value: number) => {
      const hi = Math.max(value, panelL);
      const lo = Math.min(value, panelL);
      return (hi + 0.05) / (lo + 0.05);
    };
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 4 * (y * width + x);
        if (
          Math.max(
            Math.abs(data[i] - panel[0]),
            Math.abs(data[i + 1] - panel[1]),
            Math.abs(data[i + 2] - panel[2])
          ) > 4
        ) {
          mask[y * width + x] = 1;
        }
      }
    }
    // A 13x13 erosion in two passes: it drops the antialiased silhouette.
    const erode = (source: Uint8Array): Uint8Array => {
      const rows = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        const base = y * width;
        let count = 0;
        for (let x = 0; x < Math.min(7, width); x++) {
          count += source[base + x];
        }
        for (let x = 0; x < width; x++) {
          if (x > 0) {
            count +=
              (x + 6 < width ? source[base + x + 6] : 0) -
              (x - 7 >= 0 ? source[base + x - 7] : 0);
          }
          rows[base + x] = x >= 6 && x + 6 < width && count === 13 ? 1 : 0;
        }
      }
      const out = new Uint8Array(width * height);
      for (let x = 0; x < width; x++) {
        let count = 0;
        for (let y = 0; y < Math.min(7, height); y++) {
          count += rows[y * width + x];
        }
        for (let y = 0; y < height; y++) {
          if (y > 0) {
            count +=
              (y + 6 < height ? rows[(y + 6) * width + x] : 0) -
              (y - 7 >= 0 ? rows[(y - 7) * width + x] : 0);
          }
          out[y * width + x] = y >= 6 && y + 6 < height && count === 13 ? 1 : 0;
        }
      }
      return out;
    };
    const inner = erode(mask);
    const stats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const n = sorted.length;
      return { n, median: n ? sorted[Math.floor(n / 2)] : 0 };
    };
    const interior: number[] = [];
    const values: number[] = [];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (inner[y * width + x]) {
          const value = lum(4 * (y * width + x));
          interior.push(contrast(value));
          values.push(value);
        }
      }
    }
    const sorted = [...values].sort((a, b) => a - b);
    let centres = [0.1, 0.5, 0.9].map(
      q => sorted[Math.floor(sorted.length * q)] ?? 0
    );
    let groups: number[][] = [];
    for (let iteration = 0; iteration < 25; iteration++) {
      groups = [[], [], []];
      for (const value of values) {
        let best = 0;
        for (let k = 1; k < 3; k++) {
          if (Math.abs(value - centres[k]) < Math.abs(value - centres[best])) {
            best = k;
          }
        }
        groups[best].push(value);
      }
      let moved = 0;
      centres = groups.map((group, k) => {
        if (!group.length) {
          return centres[k];
        }
        const mean =
          group.reduce((sum, value) => sum + value, 0) / group.length;
        moved = Math.max(moved, Math.abs(mean - centres[k]));
        return mean;
      });
      if (moved < 1e-6) {
        break;
      }
    }
    const faces = groups
      .filter(group => group.length)
      .map(group => ({
        mean: group.reduce((sum, value) => sum + value, 0) / group.length,
        group
      }))
      .sort((a, b) => a.mean - b.mean)
      .map(item => stats(item.group.map(value => contrast(value))));
    return { panel, interior: stats(interior), faces };
  }, shot.toString('base64'));

// ACC-MESH-101-LIGHTS: the rim band is the top 12 rows of the model. Its
// median linear luminance tells Three-point's rim from Studio's.
const rimReport = async (page: any, shot: Buffer) =>
  page.evaluate(async (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' })
    );
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const background = [
      data[4 * (8 * width + 0)],
      data[4 * (8 * width + 0) + 1],
      data[4 * (8 * width + 0) + 2]
    ];
    const linear = (c: number) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const model = (x: number, y: number) => {
      const i = 4 * (y * width + x);
      return (
        Math.max(
          Math.abs(data[i] - background[0]),
          Math.abs(data[i + 1] - background[1]),
          Math.abs(data[i + 2] - background[2])
        ) > 4
      );
    };
    const values: number[] = [];
    let firstRow = -1;
    for (let y = 8; y < height && (firstRow < 0 || y < firstRow + 12); y++) {
      for (let x = 0; x < width; x++) {
        if (!model(x, y)) {
          continue;
        }
        if (firstRow < 0) {
          firstRow = y;
        }
        const i = 4 * (y * width + x);
        values.push(
          0.2126 * linear(data[i]) +
            0.7152 * linear(data[i + 1]) +
            0.0722 * linear(data[i + 2])
        );
      }
    }
    values.sort((a, b) => a - b);
    return {
      n: values.length,
      top: values[Math.floor(values.length / 2)]
    };
  }, shot.toString('base64'));

// ACC-MESH-102-GRID: grid pixels of the on shot outside the off shot's model
// mask (dilated 2 px, rows from 8), their contrast against the panel, and the
// model interior, eroded 2 px, byte for byte.
const gridReport = async (page: any, off: Buffer, on: Buffer) =>
  page.evaluate(
    async ([offBase64, onBase64]: [string, string]) => {
      const decode = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: 'image/png' })
        );
        const context = new OffscreenCanvas(
          bitmap.width,
          bitmap.height
        ).getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return {
          width: bitmap.width,
          height: bitmap.height,
          data: context.getImageData(0, 0, bitmap.width, bitmap.height).data
        };
      };
      const a = await decode(offBase64);
      const b = await decode(onBase64);
      const width = a.width;
      const height = a.height;
      const linear = (c: number) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const lum = (data: Uint8ClampedArray, i: number) =>
        0.2126 * linear(data[i]) +
        0.7152 * linear(data[i + 1]) +
        0.0722 * linear(data[i + 2]);
      // The panel comes from the off shot: in the on shot a line may cross it.
      const panelIndex = 4 * (10 * width + 2);
      const panel = [
        a.data[panelIndex],
        a.data[panelIndex + 1],
        a.data[panelIndex + 2]
      ];
      const panelL = lum(a.data, panelIndex);
      const contrast = (value: number) => {
        const hi = Math.max(value, panelL);
        const lo = Math.min(value, panelL);
        return (hi + 0.05) / (lo + 0.05);
      };
      const differs = (data: Uint8ClampedArray, i: number, colour: number[]) =>
        Math.max(
          Math.abs(data[i] - colour[0]),
          Math.abs(data[i + 1] - colour[1]),
          Math.abs(data[i + 2] - colour[2])
        ) > 4;
      const mask = new Uint8Array(width * height);
      let left = width;
      let right = -1;
      let top = height;
      let bottom = -1;
      for (let y = 8; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (differs(a.data, 4 * (y * width + x), panel)) {
            mask[y * width + x] = 1;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      const wide = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!mask[y * width + x]) {
            continue;
          }
          for (
            let v = Math.max(0, y - 2);
            v <= Math.min(height - 1, y + 2);
            v++
          ) {
            for (
              let u = Math.max(0, x - 2);
              u <= Math.min(width - 1, x + 2);
              u++
            ) {
              wide[v * width + u] = 1;
            }
          }
        }
      }
      const lines: number[] = [];
      for (let y = 8; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (wide[y * width + x]) {
            continue;
          }
          const i = 4 * (y * width + x);
          if (differs(b.data, i, panel)) {
            lines.push(contrast(lum(b.data, i)));
          }
        }
      }
      lines.sort((p, q) => p - q);
      // The model interior, eroded 2 px.
      const rows = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        const base = y * width;
        let count = 0;
        for (let x = 0; x < Math.min(3, width); x++) {
          count += mask[base + x];
        }
        for (let x = 0; x < width; x++) {
          if (x > 0) {
            count +=
              (x + 2 < width ? mask[base + x + 2] : 0) -
              (x - 3 >= 0 ? mask[base + x - 3] : 0);
          }
          rows[base + x] = x >= 2 && x + 2 < width && count === 5 ? 1 : 0;
        }
      }
      let sampled = 0;
      let changed = 0;
      for (let x = 0; x < width; x++) {
        let count = 0;
        for (let y = 0; y < Math.min(3, height); y++) {
          count += rows[y * width + x];
        }
        for (let y = 0; y < height; y++) {
          if (y > 0) {
            count +=
              (y + 2 < height ? rows[(y + 2) * width + x] : 0) -
              (y - 3 >= 0 ? rows[(y - 3) * width + x] : 0);
          }
          if (y >= 2 && y + 2 < height && count === 5) {
            sampled++;
            const i = 4 * (y * width + x);
            if (
              a.data[i] !== b.data[i] ||
              a.data[i + 1] !== b.data[i + 1] ||
              a.data[i + 2] !== b.data[i + 2]
            ) {
              changed++;
            }
          }
        }
      }
      return {
        offBox: { left, right, top, bottom },
        gridPixels: lines.length,
        gridMedian: lines.length ? lines[Math.floor(lines.length / 2)] : 0,
        interiorSampled: sampled,
        interiorChanged: changed
      };
    },
    [off.toString('base64'), on.toString('base64')]
  );

// ACC-MESH-104-VIEWS: the model's box and the count and centroid of each
// named colour in a shot.
const viewReport = async (page: any, shot: Buffer) =>
  page.evaluate(async (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' })
    );
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const background = [
      data[4 * (8 * width + 0)],
      data[4 * (8 * width + 0) + 1],
      data[4 * (8 * width + 0) + 2]
    ];
    const counts: { [name: string]: number } = {};
    const centroids: { [name: string]: number[] } = {};
    let covered = 0;
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 8; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 4 * (y * width + x);
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (
          Math.max(
            Math.abs(r - background[0]),
            Math.abs(g - background[1]),
            Math.abs(b - background[2])
          ) <= 4
        ) {
          continue;
        }
        covered++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        let name: string | null = null;
        if (r > 1.4 * g && r > 1.4 * b) {
          name = 'red';
        } else if (g > 1.4 * r && g > 1.4 * b) {
          name = 'green';
        } else if (b > 1.4 * r && b > 1.4 * g) {
          name = 'blue';
        } else if (r > 1.4 * b && g > 1.4 * b) {
          name = 'yellow';
        } else if (r > 1.4 * g && b > 1.4 * g) {
          name = 'magenta';
        } else if (g > 1.4 * r && b > 1.4 * r) {
          name = 'cyan';
        }
        if (name) {
          counts[name] = (counts[name] ?? 0) + 1;
          const value = centroids[name] ?? [0, 0];
          centroids[name] = [value[0] + x, value[1] + y];
        }
      }
    }
    for (const name of Object.keys(counts)) {
      centroids[name] = [
        centroids[name][0] / counts[name],
        centroids[name][1] / counts[name]
      ];
    }
    return {
      width,
      height,
      covered,
      left,
      right,
      top,
      bottom,
      counts,
      centroids
    };
  }, shot.toString('base64'));

// Counts the WebGL contexts the page has made; lost ones do not count as live.
const countContexts = () => {
  const contexts: WebGLRenderingContext[] = [];
  (window as any).liveContexts = () =>
    contexts.filter(context => !context.isContextLost()).length;
  (window as any).madeContexts = () => contexts.length;
  const getContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function (
    this: HTMLCanvasElement,
    kind: string,
    ...rest: unknown[]
  ) {
    const context = (getContext as any).call(this, kind, ...rest);
    if (kind.startsWith('webgl') && context && !contexts.includes(context)) {
      contexts.push(context);
    }
    return context;
  };
};

test.describe('Mesh viewer', () => {
  // A desktop window: at Galata's 1024 px the ten toolbar buttons and the
  // read-out exceed the panel, so the responsive toolbar moves them into its
  // popup and the read-out and the help link leave the toolbar that
  // ACC-MESH-87 and ACC-MESH-89 measure. The popup still covers narrow panels.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // ACC-MESH-75-OPEN
  test('ACC-MESH-75-OPEN a double click opens one tab in the mesh viewer with a mesh icon', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    const file = `${tmpPath}/part.stl`;
    await upload(page, file, stl(box(1, 1, 1)));
    await open(page, file);
    await expect(tabs(page).filter({ hasText: 'part.stl' })).toHaveCount(1);
    await expect(viewer(page)).toHaveCount(1);
    expect((await measure(page)).covered).toBeGreaterThan(1000);
    const opened = await page.evaluate(() => {
      const widget = (window as any).jupyterapp.shell.currentWidget;
      return { path: widget.context.path, icon: widget.title.icon?.name };
    });
    expect(opened).toEqual({
      path: file,
      icon: 'advanced-image-viewer:mesh'
    });
    await expect(
      page.locator(
        '#jp-main-dock-panel .lm-TabBar-tab.lm-mod-current svg[data-icon="advanced-image-viewer:mesh"]'
      )
    ).toHaveCount(1);

    // Open With lists the viewer.
    await page
      .locator('.jp-DirListing-item', { hasText: 'part.stl' })
      .click({ button: 'right' });
    await page.locator('.lm-Menu-itemLabel', { hasText: 'Open With' }).click();
    await expect(
      page.locator('.lm-Menu-itemLabel', { hasText: 'Mesh Viewer' })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // The other extensions are bound to the same factory. Every format the
    // viewer registers opens with model pixels.
    const contents: [string, Buffer][] = [
      ['part.stl', stl(box(1, 1, 1))],
      ['part.ply', Buffer.from(plySurface(box(1, 1, 1)))],
      ['part.obj', Buffer.from(obj(box(1, 1, 1)))],
      ['part.3mf', threemf(box(1, 1, 1))],
      ['part.glb', glb(box(1, 1, 1))],
      ['part.step', CUBE],
      ['part.stp', CUBE]
    ];
    for (const [name, content] of contents) {
      const other = `${tmpPath}/${name}`;
      await upload(page, other, content);
      await open(page, other);
      await expect(tabs(page).filter({ hasText: name })).toHaveCount(1);
      const factory = await page.evaluate(
        (path: string) =>
          (window as any).jupyterapp.docRegistry.defaultWidgetFactory(path)
            .name,
        other
      );
      expect(factory).toBe(FACTORY);
      expect((await measure(page)).covered).toBeGreaterThan(5000);
    }
  });

  // ACC-MESH-76-STL
  test('ACC-MESH-76-STL binary and ASCII STL render and the read-out shows the triangle count', async ({
    page,
    tmpPath
  }) => {
    const triangles = globe();
    await upload(page, `${tmpPath}/binary.stl`, stl(triangles));
    await page.contents.uploadContent(
      ascii(triangles),
      'text',
      `${tmpPath}/ascii.stl`
    );
    for (const name of ['binary.stl', 'ascii.stl']) {
      await open(page, `${tmpPath}/${name}`);
      await expect(details(page)).toContainText(
        `${triangles.length} triangles`
      );
      expect((await measure(page)).covered).toBeGreaterThan(5000);
    }
  });

  // DEF-MESH-70-STL-COPY
  test('DEF-MESH-70-STL-COPY a multi-megabyte ASCII STL counts every triangle', async ({
    page,
    tmpPath
  }) => {
    const side = 160;
    const step = 2 / side;
    const height = (x: number, y: number) =>
      0.2 * Math.sin(3 * x) * Math.cos(3 * y);
    const triangles: number[][] = [];
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        const x = 2 * (i / side) - 1;
        const y = 2 * (j / side) - 1;
        const a = [x, y, height(x, y)];
        const b = [x + step, y, height(x + step, y)];
        const c = [x + step, y + step, height(x + step, y + step)];
        const d = [x, y + step, height(x, y + step)];
        triangles.push([...a, ...b, ...c], [...a, ...c, ...d]);
      }
    }
    const file = `${tmpPath}/large-ascii.stl`;
    await page.contents.uploadContent(ascii(triangles), 'text', file);
    await open(page, file);
    await expect(details(page)).toContainText('51,200 triangles');
  });

  // ACC-MESH-77-PLY
  test('ACC-MESH-77-PLY a PLY surface shows its vertex colours and a PLY point cloud shows points', async ({
    page,
    tmpPath
  }) => {
    await upload(
      page,
      `${tmpPath}/coloured.ply`,
      Buffer.from(plySurface(box(1, 1, 1)))
    );
    await open(page, `${tmpPath}/coloured.ply`);
    await expect(details(page)).toContainText('PLY · 12 triangles');
    expect((await modelOnShow(page)).warm).toBeGreaterThan(200);

    await upload(page, `${tmpPath}/cloud.ply`, Buffer.from(plyPoints(32)));
    await open(page, `${tmpPath}/cloud.ply`);
    await expect(details(page)).toContainText('PLY · 1,024 points');
    expect((await measure(page)).covered).toBeGreaterThan(500);
    const shown = await page.evaluate(() => {
      // The scene's model is a group of parts, one per upload chunk.
      const points = (window as any).jupyterapp.shell.currentWidget.content
        .scene.model.children[0];
      return {
        points: points.isPoints === true,
        size: points.material.size,
        sizeAttenuation: points.material.sizeAttenuation,
        ratio: window.devicePixelRatio
      };
    });
    expect(shown.points).toBe(true);
    expect(shown.size).toBeCloseTo(2 * shown.ratio);
    expect(shown.sizeAttenuation).toBe(false);
  });

  // ACC-MESH-78-OBJ
  test('ACC-MESH-78-OBJ an OBJ renders in the default material and ignores its mtllib line', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/part.obj`;
    await upload(page, file, Buffer.from(obj(box(1, 1, 1))));
    const requests: string[] = [];
    page.on('request', (request: any) => requests.push(request.url()));
    await open(page, file);
    await expect(details(page)).toContainText('OBJ · 12 triangles');
    const shot = await modelOnShow(page);
    // The default material is grey; no pixel carries an orange tint.
    expect(shot.warm).toBeLessThan(10);
    expect(
      requests.filter(url => new URL(url).pathname.endsWith('.mtl'))
    ).toEqual([]);
  });

  // DEF-MESH-71-POINTS
  test('DEF-MESH-71-POINTS an OBJ holding only vertices opens as a point cloud', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/cloud.obj`;
    await page.contents.uploadContent(objPoints(32), 'text', file);
    await page.filebrowser.open(file);
    await viewer(page).waitFor();
    await expect(message(page)).toHaveText('', { timeout: 30000 });
    await expect(details(page)).toContainText('OBJ · 1,024 points', {
      timeout: 30000
    });
    expect((await measure(page)).covered).toBeGreaterThan(500);
  });

  // DEF-MESH-71-POINTS
  test('DEF-MESH-71-POINTS a GLB POINTS primitive opens as a point cloud', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/cloud.glb`;
    await upload(page, file, glbPoints(32));
    await page.filebrowser.open(file);
    await viewer(page).waitFor();
    await expect(message(page)).toHaveText('', { timeout: 30000 });
    await expect(details(page)).toContainText('GLB · 1,024 points', {
      timeout: 30000
    });
    expect((await measure(page)).covered).toBeGreaterThan(500);
    // DEF-MESH-72-POINTS-COLOUR: the cloud keeps the file's authored colour.
    // A glTF baseColorFactor is linear and so is three's working space, so
    // the linear hex reads the authored [1, 0.25, 0, 1] as 0xff4000.
    const colour = await page.evaluate(() => {
      const scene = (window as any).jupyterapp.shell.currentWidget?.content
        ?.scene;
      let hex = -1;
      scene?.model?.traverse((object: any) => {
        if (object.isPoints) {
          hex = object.material.color.getHex('srgb-linear');
        }
      });
      return hex;
    });
    expect(colour).toBe(0xff4000);
  });

  // ACC-MESH-100-THREEMF
  test('ACC-MESH-100-THREEMF a 3MF renders with the colour the file sets', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/orange.3mf`, threemf(box(1, 1, 1)));
    await open(page, `${tmpPath}/orange.3mf`);
    await expect(details(page)).toContainText('3MF · 12 triangles');
    expect((await modelOnShow(page)).warm).toBeGreaterThan(200);
  });

  // ACC-MESH-79-GLB
  test('ACC-MESH-79-GLB a GLB keeps its authored colour and embedded texture and names an unsupported compression', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/colour.glb`, glb(box(1, 1, 1)));
    await open(page, `${tmpPath}/colour.glb`);
    expect((await modelOnShow(page)).warm).toBeGreaterThan(200);

    await upload(
      page,
      `${tmpPath}/texture.glb`,
      glb(box(1, 1, 1), { texture: true })
    );
    await open(page, `${tmpPath}/texture.glb`);
    expect((await modelOnShow(page)).warm).toBeGreaterThan(200);

    const compressions: { [name: string]: string } = {
      KHR_draco_mesh_compression: 'Draco',
      EXT_meshopt_compression: 'meshopt',
      KHR_texture_basisu: 'KTX2'
    };
    for (const [extension, name] of Object.entries(compressions)) {
      const file = `${tmpPath}/compressed-${name}.glb`;
      await upload(page, file, glb(box(1, 1, 1), { compression: extension }));
      await page.filebrowser.open(file);
      await expect(message(page)).toHaveText(
        `This file uses ${name} compression, which the mesh viewer does not support.`
      );
      await expect(details(page)).toHaveText('');
    }
  });

  // ACC-MESH-79-GLB: a GLB whose two nodes reference one mesh.
  test('ACC-MESH-79-GLB-SHARED a GLB that reuses one mesh in two nodes opens and reads out both nodes', async ({
    page,
    tmpPath
  }) => {
    await upload(
      page,
      `${tmpPath}/shared.glb`,
      glb(box(1, 1, 1), { instance: true })
    );
    await open(page, `${tmpPath}/shared.glb`);
    await expect(details(page)).toContainText('GLB · 24 triangles');
  });

  // ACC-MESH-79-GLB: a GLB with KHR_materials_unlit.
  test('ACC-MESH-79-GLB-UNLIT a GLB with KHR_materials_unlit opens with the read-out and its colour', async ({
    page,
    tmpPath
  }) => {
    await upload(
      page,
      `${tmpPath}/unlit.glb`,
      glb(box(1, 1, 1), { unlit: true })
    );
    await open(page, `${tmpPath}/unlit.glb`);
    await expect(details(page)).toContainText('GLB · 12 triangles');
    expect((await modelOnShow(page)).warm).toBeGreaterThan(200);
  });

  // ACC-MESH-80-STEP
  test('ACC-MESH-80-STEP .step and .stp render in a worker with part colours and the lab serves the WASM', async ({
    page,
    tmpPath,
    baseURL
  }) => {
    test.setTimeout(180000);
    const workers: string[] = [];
    const wasm: string[] = [];
    page.on('worker', (worker: any) => workers.push(worker.url()));
    page.on('response', (response: any) => {
      if (new URL(response.url()).pathname.endsWith('.wasm')) {
        wasm.push(response.url());
      }
    });
    for (const extension of ['step', 'stp']) {
      const file = `${tmpPath}/cube.${extension}`;
      await upload(page, file, CUBE);
      workers.length = 0;
      wasm.length = 0;
      await open(page, file);
      await expect(details(page)).toContainText('STEP ·');
      expect((await modelOnShow(page)).warm).toBeGreaterThan(100);
      expect(workers.length).toBeGreaterThan(0);
      const origin = new URL(baseURL!).origin;
      expect(
        wasm.filter(
          url =>
            new URL(url).origin === origin &&
            url.endsWith('/occt-import-js.wasm')
        )
      ).not.toEqual([]);
    }
  });

  test.describe('at a device pixel ratio of 2', () => {
    test.use({ deviceScaleFactor: 2 });

    // ACC-MESH-81-QUALITY
    test('ACC-MESH-81-QUALITY shades, antialiased outline, device pixel ratio, both faces', async ({
      page,
      tmpPath
    }) => {
      await upload(page, `${tmpPath}/globe.stl`, stl(globe(32, 64)));
      await open(page, `${tmpPath}/globe.stl`);
      const shot = await measure(page);
      // Environment and camera light give a surface many shades.
      expect(shot.colours).toBeGreaterThan(500);
      // Antialiasing: most outline pixels lie between background and model. On
      // this globe the share is 0.93 with antialiasing and 0.61 without it.
      expect(shot.mixedRows / shot.rows).toBeGreaterThan(0.8);
      // The drawing buffer has the device resolution.
      const scene = await page.evaluate(() => {
        const content = (window as any).jupyterapp.shell.currentWidget.content;
        const canvas = content.node.querySelector('canvas');
        return {
          ratio: canvas.width / canvas.clientWidth,
          environment: !!content.scene.scene.environment,
          lights: content.scene.camera.children.filter(
            (child: any) => child.isDirectionalLight
          ).length
        };
      });
      expect(scene).toEqual({ ratio: 2, environment: true, lights: 1 });

      // Both lights reach the model: the picture changes when either is off and
      // returns when both are on. Over the model's own pixels the camera light
      // removed changes it by 43.3 levels and the environment by 51.5. The
      // limits are the whole-viewer ones of 1 and 10 at the 1024 px calibration
      // viewport, where the globe covered 0.229 of the viewer: 1 / 0.229 = 4.4
      // and 10 / 0.229 = 43.7. This describe runs at 1440 px for the toolbar.
      const lit = async (cameraLight: boolean, environment: boolean) => {
        await page.evaluate(
          ([light, room]: boolean[]) => {
            const { scene } = (window as any).jupyterapp.shell.currentWidget
              .content;
            scene.camera.children.find(
              (child: any) => child.isDirectionalLight
            ).visible = light;
            scene.scene.environmentIntensity = room ? 1 : 0;
            scene.setShading(false, false);
          },
          [cameraLight, environment]
        );
        return measure(page);
      };
      expect(modelChange(shot, await lit(false, true))).toBeGreaterThan(4.4);
      expect(modelChange(shot, await lit(true, false))).toBeGreaterThan(43.7);
      expect(change(shot, await lit(true, true))).toBeLessThan(0.01);

      // The first view looks from -Y. The first plate's front faces +Y, away from
      // that view, and the second plate's faces it: only both faces show both.
      const plate = quad([-1, 0, -1], [-1, 0, 1], [1, 0, 1], [1, 0, -1]);
      const flipped = plate.map(t => [
        ...t.slice(6),
        ...t.slice(3, 6),
        ...t.slice(0, 3)
      ]);
      for (const [name, triangles] of [
        ['front.stl', plate],
        ['back.stl', flipped]
      ] as [string, number[][]][]) {
        await upload(page, `${tmpPath}/${name}`, stl(triangles));
        await open(page, `${tmpPath}/${name}`);
        expect((await measure(page)).covered).toBeGreaterThan(50000);
      }
    });
  });

  // ACC-MESH-82-SMOOTH
  test('ACC-MESH-82-SMOOTH Shading is on at open, off shows the flat facets, and on again restores the smooth surface', async ({
    page,
    tmpPath
  }) => {
    // Facets meet at 15 degrees and diagonal ones at 21, both below the crease
    // angle, so Smooth rounds it and Shading off shows its facets.
    await upload(page, `${tmpPath}/globe.stl`, stl(globe(12, 24)));
    await open(page, `${tmpPath}/globe.stl`);
    const shading = toggle(page, 'shading');
    await expect(shading).toHaveAttribute('aria-pressed', 'true');
    const smooth = await measure(page);

    await shading.click();
    await expect(shading).toHaveAttribute('aria-pressed', 'false');
    const faceted = await measure(page);
    expect(faceted.colours).toBeLessThan(smooth.colours);
    // A facet boundary is a jump in shade; a smooth surface has none.
    expect(faceted.largestStep).toBeGreaterThan(smooth.largestStep * 2);

    await shading.click();
    await expect(shading).toHaveAttribute('aria-pressed', 'true');
    expect((await measure(page)).colours).toBe(smooth.colours);

    // A cube edge is sharper than the crease angle, so it stays sharp.
    await upload(page, `${tmpPath}/cube.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/cube.stl`);
    const cube = await measure(page);
    expect(cube.largestStep).toBeGreaterThan(smooth.largestStep * 2);

    // Either side of the crease angle of 40 degrees: a side that stays sharp is
    // drawn as Shading off draws it, and a side that rounds is not.
    const smoothAgainstFlat = async (sides: number) => {
      await upload(page, `${tmpPath}/prism${sides}.stl`, stl(prism(sides)));
      await open(page, `${tmpPath}/prism${sides}.stl`);
      const rounded = await measure(page);
      await toggle(page, 'shading').click();
      await expect(toggle(page, 'shading')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      return change(rounded, await measure(page));
    };
    expect(await smoothAgainstFlat(8)).toBeLessThan(0.01);
    expect(await smoothAgainstFlat(10)).toBeGreaterThan(0.5);
  });

  // DEF-MESH-15-SEAMS
  test('DEF-MESH-15-SEAMS a globe with facets 22.5 degrees apart shows no patch edges in Smooth', async ({
    page,
    tmpPath
  }) => {
    // Diagonal facets meet at 31.8 degrees. With a crease angle below that, faces
    // sharing a vertex get different normals, so every facet edge stays a jump in
    // shade. Largest step measured against the 70 with Shading off: 8 with a
    // crease of 40 degrees, 38 with one of 30.
    await upload(page, `${tmpPath}/globe.stl`, stl(globe(8, 16)));
    await open(page, `${tmpPath}/globe.stl`);
    const smooth = await measure(page);
    const shading = toggle(page, 'shading');
    await shading.click();
    await expect(shading).toHaveAttribute('aria-pressed', 'false');
    const faceted = await measure(page);
    expect(faceted.largestStep).toBeGreaterThan(smooth.largestStep * 4);
  });

  // ACC-MESH-82-SMOOTH, ACC-MESH-83-WIRE
  test('ACC-MESH-82-SMOOTH ACC-MESH-83-WIRE Shading and Wireframe keep their pressed state after Reload and Page Down', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/folder`;
    const triangles = globe(12, 24);
    await upload(page, `${dir}/a.stl`, stl(triangles));
    await upload(page, `${dir}/b.stl`, stl(triangles));
    await open(page, `${dir}/a.stl`);
    const smooth = await measure(page);
    const shading = toggle(page, 'shading');
    const wireframe = toggle(page, 'wireframe');

    const expectState = async (
      shadingPressed: boolean,
      wireframePressed: boolean,
      shot: IShot
    ) => {
      await expect(shading).toHaveAttribute(
        'aria-pressed',
        String(shadingPressed)
      );
      await expect(wireframe).toHaveAttribute(
        'aria-pressed',
        String(wireframePressed)
      );
      expect(change(shot, await measure(page))).toBeLessThan(0.01);
    };
    // One more triangle, of no area, changes the read-out and not the picture.
    let extra = 0;
    const reload = async (file: string) => {
      extra++;
      const zero = new Array(extra).fill(new Array(9).fill(0));
      await upload(page, file, stl([...triangles, ...zero]));
      await button(page, RELOAD).click();
      await expect(details(page)).toContainText(
        `${triangles.length + extra} triangles`
      );
      await expect(message(page)).toHaveText('');
    };
    const step = async (key: string, name: string) => {
      await viewer(page).focus();
      await page.keyboard.press(key);
      await expect(currentTab(page)).toHaveText(name);
      await expect(viewer(page)).toHaveCount(1);
      await expect(details(page)).toHaveText(/./, { timeout: 30000 });
      await expect(message(page)).toHaveText('');
    };

    // Shading is on at open: one click shows the facets and stays off.
    await expect(shading).toHaveAttribute('aria-pressed', 'true');
    await shading.click();
    await expect(shading).toHaveAttribute('aria-pressed', 'false');
    const flat = await measure(page);
    expect(change(smooth, flat)).toBeGreaterThan(0.1);
    await reload(`${dir}/a.stl`);
    await expectState(false, false, flat);
    await step('PageDown', 'b.stl');
    await expectState(false, false, flat);

    // On again, with Wireframe on: the edges on the smooth surface.
    await shading.click();
    await expect(shading).toHaveAttribute('aria-pressed', 'true');
    await wireframe.click();
    const edges = await measure(page);
    expect(change(smooth, edges)).toBeGreaterThan(0.1);
    await reload(`${dir}/b.stl`);
    await expectState(true, true, edges);
    await step('PageUp', 'a.stl');
    await expectState(true, true, edges);

    // Off stays off as well.
    await wireframe.click();
    await expect(wireframe).toHaveAttribute('aria-pressed', 'false');
    expect(change(smooth, await measure(page))).toBeLessThan(0.01);
    await step('PageDown', 'b.stl');
    await expect(wireframe).toHaveAttribute('aria-pressed', 'false');
    expect(change(smooth, await measure(page))).toBeLessThan(0.01);
    await expect(shading).toHaveAttribute('aria-pressed', 'true');
  });

  // ACC-MESH-83-WIRE
  test('ACC-MESH-83-WIRE a toolbar button shows triangle edges and restores the surface', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/globe.stl`, stl(globe()));
    await open(page, `${tmpPath}/globe.stl`);
    const wireframe = toggle(page, 'wireframe');
    await expect(wireframe).toHaveAttribute('aria-pressed', 'false');
    const surface = await measure(page);

    await wireframe.click();
    await expect(wireframe).toHaveAttribute('aria-pressed', 'true');
    const edges = await measure(page);
    expect(edges.covered).toBeLessThan(surface.covered * 0.6);
    expect(edges.covered).toBeGreaterThan(500);

    await wireframe.click();
    await expect(wireframe).toHaveAttribute('aria-pressed', 'false');
    expect((await measure(page)).covered).toBe(surface.covered);
  });

  // ACC-MESH-84-ORBIT
  test('ACC-MESH-84-ORBIT left drag orbits, right drag pans with no context menu, wheel zooms toward the pointer', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/block.stl`, stl(moved(box(1, 2, 3), FAR)));
    await open(page, `${tmpPath}/block.stl`);
    const first = await measure(page);

    // Orbit: another view of the model, which stays in the middle.
    await drag(page, 'left', 150, 40);
    const turned = await measure(page);
    expect(change(first, turned)).toBeGreaterThan(1);
    expect(Math.abs(centreX(turned) - first.width / 2)).toBeLessThan(
      first.width * 0.1
    );
    expect(Math.abs(centreY(turned) - first.height / 2)).toBeLessThan(
      first.height * 0.1
    );

    // It then moves back from the camera, to leave room for the pan.
    for (let i = 0; i < 4; i++) {
      await labelled(page, 'Zoom out').click();
    }
    const orbited = await measure(page);

    // Pan: the same view moved by the drag.
    await drag(page, 'right', 120, -70);
    await expect(page.locator('.lm-Menu')).toHaveCount(0);
    const panned = await measure(page);
    expect(centreX(panned) - centreX(orbited)).toBeGreaterThan(90);
    expect(centreX(panned) - centreX(orbited)).toBeLessThan(150);
    expect(centreY(orbited) - centreY(panned)).toBeGreaterThan(50);
    expect(centreY(orbited) - centreY(panned)).toBeLessThan(90);
    expect(Math.abs(boxWidth(panned) - boxWidth(orbited))).toBeLessThan(
      boxWidth(orbited) * 0.1
    );

    // Wheel: the model grows about the pointer. Back at a small centred view, a
    // pointer 150 px left of the model moves it right by (scale - 1) x 150 px;
    // growing about the panel centre would not move it.
    await labelled(page, 'Reset to fit').click();
    for (let i = 0; i < 6; i++) {
      await labelled(page, 'Zoom out').click();
    }
    const small = await measure(page);
    const panel = (await viewer(page).boundingBox())!;
    await page.mouse.move(
      panel.x + centreX(small) - 150,
      panel.y + centreY(small)
    );
    await page.mouse.wheel(0, -600);
    await expect
      .poll(async () => boxWidth(await measure(page)))
      .toBeGreaterThan(boxWidth(small) * 1.1);
    const zoomed = await measure(page);
    expect(boxHeight(zoomed)).toBeGreaterThan(boxHeight(small) * 1.1);
    const scale = boxWidth(zoomed) / boxWidth(small);
    expect(centreX(zoomed) - centreX(small)).toBeGreaterThan(
      (scale - 1) * 150 * 0.5
    );

    // Wheel down shrinks it again.
    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => boxWidth(await measure(page)))
      .toBeLessThan(boxWidth(zoomed) * 0.9);
  });

  // ACC-MESH-85-FIT
  test('ACC-MESH-85-FIT opens centred and filling the panel; Fit restores it; Reset to fit, Zoom out and Zoom in read as in the image viewer; a resize keeps the shape', async ({
    page,
    tmpPath
  }) => {
    // What the image viewer's zoom buttons read.
    const readButtons = () =>
      Promise.all(
        ['advanced-zoom-out', 'advanced-zoom-in', 'advanced-reset-fit'].map(
          async name => {
            // The jp-button host holds both attributes; the button in its
            // shadow root carries the aria-label but not the title.
            const button = toolbar(page).locator(
              `[data-jp-item-name="${name}"] jp-button`
            );
            return [
              await button.getAttribute('aria-label'),
              await button.getAttribute('title')
            ];
          }
        )
      );
    const svg = `${tmpPath}/image.svg`;
    await page.contents.uploadContent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
      'text',
      svg
    );
    await page.filebrowser.open(svg, 'Image');
    await page.locator(`${SHOWN} .jp-ImageViewer`).waitFor();
    const imageButtons = await readButtons();
    expect(imageButtons[2][1]).toBe('Reset to fit');

    await upload(page, `${tmpPath}/cube.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/cube.stl`);
    expect(await readButtons()).toEqual(imageButtons);

    const framed = await measure(page);
    expectFramed(framed);

    await labelled(page, 'Zoom in').click();
    const larger = await measure(page);
    expect(boxHeight(larger)).toBeGreaterThan(boxHeight(framed));
    await labelled(page, 'Zoom out').click();
    await labelled(page, 'Zoom out').click();
    const smaller = await measure(page);
    expect(boxHeight(smaller)).toBeLessThan(boxHeight(framed));

    // Any camera move, then Fit.
    await drag(page, 'left', 200, 90);
    await drag(page, 'right', 80, 60);
    await labelled(page, 'Reset to fit').click();
    const again = await measure(page);
    expectFramed(again);
    expect(again.covered).toBe(framed.covered);

    // The zoom buttons follow the zoom step setting.
    await setSetting(page, 'zoomStep', 0.5);
    await labelled(page, 'Zoom in').click();
    const stepped = await measure(page);
    expect(boxHeight(stepped)).toBeGreaterThan(boxHeight(larger));
    await labelled(page, 'Reset to fit').click();

    // A panel resize changes the panel, not the shape of the model. The model
    // first moves back from the camera, so the narrow panel does not clip it.
    for (let i = 0; i < 2; i++) {
      await labelled(page, 'Zoom out').click();
    }
    const before = await measure(page);
    await page.setViewportSize({ width: 800, height: 1000 });
    await expect
      .poll(async () => (await measure(page)).width)
      .toBeLessThan(before.width);
    const resized = await measure(page);
    const ratio = (shot: IShot) => boxWidth(shot) / boxHeight(shot);
    expect(Math.abs(ratio(resized) / ratio(before) - 1)).toBeLessThan(0.03);
    // The canvas follows the panel, so the model stays in the panel's middle.
    const canvas = await page.evaluate(() => {
      const { clientWidth, clientHeight } = (
        window as any
      ).jupyterapp.shell.currentWidget.content.node.querySelector('canvas');
      return [clientWidth, clientHeight];
    });
    expect(canvas).toEqual([resized.width, resized.height]);
    expect(Math.abs(centreX(resized) - resized.width / 2)).toBeLessThan(
      resized.width * 0.03
    );

    // In a panel taller than wide the width limits the view, so Fit and a first
    // open move back further and the whole model stays on show.
    expect(resized.height).toBeGreaterThan(resized.width);
    await labelled(page, 'Reset to fit').click();
    expectFramed(await measure(page));
    await upload(page, `${tmpPath}/tall.stl`, stl(box(1, 1, 1)));
    // The toolbar overflows at this width and the read-out moves into the
    // popup, so the tab title and the model on show are the load signal.
    await page.filebrowser.open(`${tmpPath}/tall.stl`);
    await expect(currentTab(page)).toHaveText('tall.stl');
    await viewer(page).waitFor();
    await expect
      .poll(async () => (await measure(page)).covered)
      .toBeGreaterThan(5000);
    expectFramed(await modelOnShow(page));
  });

  // DEF-MESH-73-FIT-TOGGLE
  test('DEF-MESH-73-FIT-TOGGLE Fit, - + and Reload stay unpressed after one click', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/cube.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/cube.stl`);
    for (const label of ['Reset to fit', 'Zoom out', 'Zoom in', RELOAD]) {
      const control = labelled(page, label);
      await expect(control).toHaveAttribute('aria-pressed', 'false');
      await control.click();
      // The widget re-renders on the next frame, so read the attribute after it.
      await settled(page);
      await expect(control).toHaveAttribute('aria-pressed', 'false');
    }
  });

  // ACC-MESH-85-FIT
  test('ACC-MESH-85-FIT a model far from the origin opens centred and Fit restores it', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/far.stl`, stl(moved(box(1, 1, 1), FAR)));
    await open(page, `${tmpPath}/far.stl`);
    const framed = await modelOnShow(page);
    expectFramed(framed);

    await drag(page, 'left', 200, 90);
    await drag(page, 'right', 80, 60);
    await labelled(page, 'Reset to fit').click();
    const again = await modelOnShow(page);
    expectFramed(again);
    expect(Math.abs(again.covered / framed.covered - 1)).toBeLessThan(0.01);
  });

  // ACC-MESH-85-FIT
  test('ACC-MESH-85-FIT a cube of 0.001 is framed like any other model', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/tiny.stl`, stl(box(0.001, 0.001, 0.001)));
    await open(page, `${tmpPath}/tiny.stl`);
    expectFramed(await modelOnShow(page));
  });

  // ACC-MESH-86-UP
  test('ACC-MESH-86-UP a Z-tall STL renders taller than wide and with +Z up', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/tower.stl`, stl(box(1, 1, 4)));
    await open(page, `${tmpPath}/tower.stl`);
    const shot = await measure(page);
    expect(boxHeight(shot)).toBeGreaterThan(boxWidth(shot) * 1.5);

    // A pyramid with its base at z = 0 and its apex at z = 4 is wider at the
    // bottom than at the top; upside down the two widths swap.
    const base: Point[] = [
      [-1, -1, 0],
      [1, -1, 0],
      [1, 1, 0],
      [-1, 1, 0]
    ];
    const pyramid = [
      ...quad(base[3], base[2], base[1], base[0]),
      ...base.map((p, i) => [...p, ...base[(i + 1) % 4], 0, 0, 4])
    ];
    await upload(page, `${tmpPath}/pyramid.stl`, stl(pyramid));
    await open(page, `${tmpPath}/pyramid.stl`);
    const standing = await measure(page);
    const widthAt = (share: number) =>
      standing.perRow[Math.round(standing.top + boxHeight(standing) * share)];
    expect(widthAt(0.85)).toBeGreaterThan(widthAt(0.15) * 2);

    // A Y-tall GLB stands at Y up; read as Z up it would lie down.
    await upload(page, `${tmpPath}/tower.glb`, glb(box(1, 4, 1)));
    await open(page, `${tmpPath}/tower.glb`);
    const glbShot = await measure(page);
    expect(boxHeight(glbShot)).toBeGreaterThan(boxWidth(glbShot) * 1.5);
  });

  // ACC-MESH-87-READOUT
  test('ACC-MESH-87-READOUT the toolbar shows format, triangle count, dimensions and file size', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/block.stl`, stl(box(12.4, 8, 3.1)));
    await open(page, `${tmpPath}/block.stl`);
    await expect(details(page)).toHaveText(
      'STL · 12 triangles · 12.4 × 8.0 × 3.1 · 684 B'
    );
  });

  // ACC-MESH-88-RELOAD
  test('ACC-MESH-88-RELOAD Reload shows the new content, keeps the camera, and a second reload replaces a running one', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/changing.stl`;
    const old = stl(box(1, 1, 1));
    await upload(page, file, old);
    await open(page, file);
    await drag(page, 'left', 120, 30);
    const view = await camera(page);

    await upload(page, file, stl(globe()));
    await button(page, RELOAD).click();
    await expect(details(page)).toContainText('256 triangles');
    expect(await camera(page)).toEqual(view);
    await expect(message(page)).toHaveText('');
    expect((await measure(page)).covered).toBeGreaterThan(1000);

    // The first reload's download is held back and answers with old bytes. The
    // second reload supersedes it, so those bytes never show.
    let held = false;
    await page.route(`**/files/**/changing.stl*`, async (route: any) => {
      if (!held) {
        held = true;
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          await route.fulfill({ body: old });
        } catch {
          // The second reload aborted this download, so Playwright reports the
          // request as cancelled instead of answering it with the old bytes.
        }
      } else {
        await route.continue();
      }
    });
    await button(page, RELOAD).click();
    await expect.poll(() => held).toBe(true);
    await upload(page, file, stl(globe(4, 8)));
    await button(page, RELOAD).click();
    await expect(details(page)).toContainText('64 triangles');
    await page.waitForTimeout(2000);
    await expect(details(page)).toContainText('64 triangles');
    await expect(message(page)).toHaveText('');
  });

  // ACC-MESH-88-RELOAD
  test('ACC-MESH-88-RELOAD a new model the kept camera cannot show is framed, so it stays on show', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/rescaled.stl`;
    const cube = (size: number) => box(size, size, size);
    const reload = async (triangles: number[][], size: string) => {
      await upload(page, file, stl(triangles));
      await button(page, RELOAD).click();
      await expect(details(page)).toContainText(size);
    };
    await upload(page, file, stl(cube(1000)));
    await open(page, file);
    const view = await camera(page);
    const old = await measure(page);

    // A tenth of the size can still be seen from here, so the camera stays. The
    // new model takes the place of the old one, so about 1 percent of the
    // pixels stay covered; with the old model kept, all of them stay.
    await reload(cube(100), '100.0 × 100.0 × 100.0');
    expect(await camera(page)).toEqual(view);
    await expect(message(page)).toHaveText('');
    const smaller = await measure(page);
    expect(smaller.covered).toBeGreaterThan(1000);
    expect(smaller.covered).toBeLessThan(old.covered * 0.05);

    // A file exported again in metres in place of millimetres would lie past
    // the far plane.
    await reload(cube(1), '1.00 × 1.00 × 1.00');
    await modelOnShow(page);

    // In the other direction the camera would be inside the model. A cube's
    // inside fills the panel, so no pixel differs from the corner.
    await reload(cube(1000), '1000.0 × 1000.0 × 1000.0');
    await modelOnShow(page);

    await reload(cube(10), '10.0 × 10.0 × 10.0');
    await modelOnShow(page);

    // The same size, moved out of the view.
    await reload(moved(box(10, 10, 20), [100, 0, 0]), '10.0 × 10.0 × 20.0');
    await modelOnShow(page);
  });

  // ACC-MESH-88-RELOAD
  test('ACC-MESH-88-RELOAD a camera panned and moved back to the limit of the controls stays', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/limit.stl`;
    await upload(page, file, stl(box(1, 1, 1)));
    await open(page, file);
    for (let i = 0; i < 30; i++) {
      await labelled(page, 'Zoom out').click();
    }
    await drag(page, 'right', 250, 0);
    const far = await measure(page);
    expect(far.covered).toBeGreaterThan(100);

    // The pan moved the target off the model: the camera is at the limit from
    // the target, and 2 percent past the limit from the model's centre, which
    // is the origin. Rounding leaves a camera a little past the limit in 19
    // percent of its positions, so the camera is put a little past it here.
    // 250 px is the drag the 779 px viewer needs for that distance at the
    // limit.
    const distances = await page.evaluate(() => {
      const { camera, controls } = (window as any).jupyterapp.shell
        .currentWidget.content.scene;
      camera.position
        .sub(controls.target)
        .multiplyScalar(1 + 1e-12)
        .add(controls.target);
      return {
        target: camera.position.distanceTo(controls.target),
        limit: controls.maxDistance
      };
    });
    expect(distances.target).toBeGreaterThan(distances.limit);
    expect(distances.target).toBeCloseTo(distances.limit, 6);
    const view = await camera(page);
    expect(Math.hypot(...view)).toBeGreaterThan(distances.limit * 1.01);

    // A second box inside the first changes the count and not the size.
    await upload(page, file, stl([...box(1, 1, 1), ...box(0.5, 0.5, 0.5)]));
    await button(page, RELOAD).click();
    await expect(details(page)).toContainText('24 triangles');
    expect(await camera(page)).toEqual(view);
    expect((await measure(page)).covered).toBe(far.covered);
  });

  // ACC-MESH-89-HELP
  test('ACC-MESH-89-HELP the help link opens a dialog listing the mouse controls and keys', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/cube.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/cube.stl`);
    const link = toolbar(page).locator('.jp-AdvancedImageViewer-help-link');
    await expect(link).toHaveAttribute('aria-label', 'Keybindings and help');
    await expect(link.locator('svg')).toHaveCount(1);
    const toolbarBox = (await toolbar(page).boundingBox())!;
    const linkBox = (await link.boundingBox())!;
    expect(linkBox.x + linkBox.width).toBeGreaterThan(
      toolbarBox.x + toolbarBox.width - 40
    );
    await link.click();
    const dialog = page.locator('.jp-Dialog .jp-AdvancedImageViewer-help');
    await expect(dialog).toBeVisible();
    for (const text of [
      'orbit',
      'pan',
      'zoom',
      'Page Up',
      'Page Down',
      'Shading',
      'Wireframe'
    ]) {
      await expect(dialog).toContainText(text);
    }
    await page.locator('.jp-Dialog .jp-mod-accept').click();
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
  });

  // ACC-MESH-90-NAV
  test('ACC-MESH-90-NAV Page Up and Page Down step through the mesh files in one tab, also after a drag; the setting turns them off', async ({
    page,
    tmpPath
  }) => {
    const dir = `${tmpPath}/folder`;
    for (const name of ['a.stl', 'c.stl', 'e.stl']) {
      await upload(page, `${dir}/${name}`, stl(box(1, 1, 1)));
    }
    // Files of other kinds between them are skipped.
    await page.contents.uploadContent('not a mesh', 'text', `${dir}/b.txt`);
    await page.contents.uploadContent('not a mesh', 'text', `${dir}/d.md`);
    await open(page, `${dir}/a.stl`);

    const meshTabs = tabs(page).filter({ hasText: /\.stl$/ });
    const press = async (key: string, expected: string) => {
      await page.keyboard.press(key);
      await expect(currentTab(page)).toHaveText(expected);
      await expect(meshTabs).toHaveCount(1);
      await expect(viewer(page)).toBeFocused();
    };
    await viewer(page).focus();
    await press('PageDown', 'c.stl');
    await press('PageDown', 'e.stl');
    await press('PageUp', 'c.stl');
    await press('PageUp', 'a.stl');

    // The first file stops Page Up.
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(1000);
    await expect(currentTab(page)).toHaveText('a.stl');

    // A drag on the model brings the focus back from the file browser.
    await page.locator('.jp-DirListing-item', { hasText: 'b.txt' }).click();
    await expect(viewer(page)).not.toBeFocused();
    await drag(page, 'left', 30, 0);
    await press('PageDown', 'c.stl');
    const shown = await page.evaluate(
      () => (window as any).jupyterapp.shell.currentWidget.context.path
    );
    expect(shown).toBe(`${dir}/c.stl`);

    // The folder navigation setting turns the keys off.
    await setSetting(page, 'navEnabled', false);
    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(1000);
    await expect(currentTab(page)).toHaveText('c.stl');
  });

  // ACC-MESH-90-NAV
  test('ACC-MESH-90-NAV Page Down follows the order the file browser shows', async ({
    page,
    tmpPath
  }) => {
    for (const name of ['a.stl', 'b.stl', 'c.stl']) {
      await upload(page, `${tmpPath}/${name}`, stl(box(1, 1, 1)));
    }
    await page.filebrowser.openDirectory(tmpPath);
    await page.locator('.jp-DirListing-headerItem.jp-id-name').click();
    await expect(
      page.locator('.jp-DirListing-header .jp-mod-descending')
    ).toHaveCount(1);

    await open(page, `${tmpPath}/b.stl`);
    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await expect(currentTab(page)).toHaveText('a.stl');
  });

  // ACC-MESH-91-ERROR
  test('ACC-MESH-91-ERROR a damaged file, an empty file, missing WebGL, a lost context and a file over the limit each show one sentence', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(120000);
    const expectSentence = async (expected: string) => {
      await expect(message(page)).toHaveText(expected, { timeout: 15000 });
      const text = (await message(page).textContent()) as string;
      expect(text).toMatch(/^[A-Z][^.]*\.$/);
      expect(text).not.toMatch(
        /error|exception|undefined|null|offset|bounds|\d{3} /i
      );
    };
    const damagedSentence =
      'This file cannot be read, because it is damaged or is not a mesh file of this type.';

    // A binary STL cut short after its header promised 100 triangles.
    const whole = stl(globe());
    const cut = whole.subarray(0, 84 + 50 * 40);
    await upload(page, `${tmpPath}/cut.stl`, cut);
    await page.filebrowser.open(`${tmpPath}/cut.stl`);
    await expectSentence(damagedSentence);
    await expect(details(page)).toHaveText('');

    // Bytes that are no STL at all.
    await upload(page, `${tmpPath}/noise.stl`, Buffer.from('not a mesh file'));
    await page.filebrowser.open(`${tmpPath}/noise.stl`);
    await expectSentence(damagedSentence);

    // A text STL with no facets, and a binary one of no triangles.
    await page.contents.uploadContent(
      `solid nothing\n${' '.repeat(100)}\nendsolid nothing\n`,
      'text',
      `${tmpPath}/nothing.stl`
    );
    await page.filebrowser.open(`${tmpPath}/nothing.stl`);
    await expectSentence('This file holds no geometry to show.');
    await upload(page, `${tmpPath}/none.stl`, stl([]));
    await page.filebrowser.open(`${tmpPath}/none.stl`);
    await expectSentence('This file holds no geometry to show.');

    // An empty file.
    await upload(page, `${tmpPath}/empty.stl`, Buffer.alloc(0));
    await page.filebrowser.open(`${tmpPath}/empty.stl`);
    await expectSentence('This file is empty.');

    // A file over the limit: the size is read first and nothing is downloaded.
    await upload(page, `${tmpPath}/big.stl`, stl(box(1, 1, 1)));
    await page.route(`**/api/contents/**/big.stl*`, async (route: any) => {
      const response = await route.fetch();
      const model = await response.json();
      await route.fulfill({
        response,
        json: { ...model, size: 1024 * 1024 * 1024 + 1 }
      });
    });
    const downloads: string[] = [];
    page.on('request', (request: any) => {
      if (request.url().includes('/files/')) {
        downloads.push(request.url());
      }
    });
    await page.filebrowser.open(`${tmpPath}/big.stl`);
    await expectSentence(
      'This file is over the 1 GiB limit of the mesh viewer, so it was not downloaded.'
    );
    expect(downloads).toEqual([]);

    // A download the server refuses is not reported as a damaged file.
    await upload(page, `${tmpPath}/refused.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/refused.stl`);
    await page.route(`**/files/**/refused.stl*`, (route: any) =>
      route.fulfill({ status: 403, body: 'refused' })
    );
    await button(page, RELOAD).click();
    await expectSentence('This file cannot be read from the server.');
    await expect(details(page)).toHaveText('');

    // A file deleted from the server: the sentence, no dialog, no old model.
    const gone = `${tmpPath}/gone.stl`;
    await upload(page, gone, stl(box(1, 1, 1)));
    await open(page, gone);
    expect(await page.contents.deleteFile(gone)).toBe(true);
    await button(page, RELOAD).click();
    await expectSentence('This file cannot be read from the server.');
    await expect(details(page)).toHaveText('');
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    expect((await measure(page)).covered).toBeLessThan(5000);
    // The restore at the end of this test would ask for the deleted file.
    await page.evaluate(() =>
      (window as any).jupyterapp.shell.currentWidget.dispose()
    );

    // A lost graphics context names the refresh icon, which brings the model
    // back.
    await upload(page, `${tmpPath}/lost.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/lost.stl`);
    await page.evaluate((shown: string) => {
      const canvas = document.querySelector(
        `${shown} .jp-AdvancedMeshViewer canvas`
      ) as HTMLCanvasElement;
      canvas
        .getContext('webgl2')!
        .getExtension('WEBGL_lose_context')!
        .loseContext();
    }, SHOWN);
    await expectSentence(
      'The graphics context was lost, so press the refresh icon to show the model again.'
    );
    await button(page, RELOAD).click();
    await expect(message(page)).toHaveText('');
    expect((await measure(page)).covered).toBeGreaterThan(1000);

    // In a browser with no WebGL the restored tab says so.
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as any).getContext = function (
        this: HTMLCanvasElement,
        kind: string,
        ...rest: unknown[]
      ) {
        return kind.startsWith('webgl')
          ? null
          : (getContext as any).call(this, kind, ...rest);
      };
    });
    await page.reload({ waitForIsReady: false });
    await expectSentence(
      'WebGL is not available in this browser, so the model cannot be shown.'
    );
  });

  // ACC-MESH-91-ERROR
  test('ACC-MESH-91-ERROR a damaged and an empty file of every format show one plain sentence', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    const damaged =
      'This file cannot be read, because it is damaged or is not a mesh file of this type.';
    const expectSentence = async (expected: string) => {
      await expect(message(page)).toHaveText(expected, { timeout: 30000 });
      const text = (await message(page).textContent()) as string;
      expect(text).toMatch(/^[A-Z][^.]*\.$/);
      expect(text).not.toMatch(/error|exception|undefined|null|worker/i);
    };
    for (const extension of ['ply', 'obj', '3mf', 'glb', 'step', 'stp']) {
      await upload(
        page,
        `${tmpPath}/bad.${extension}`,
        Buffer.from('not a mesh file')
      );
      await page.filebrowser.open(`${tmpPath}/bad.${extension}`);
      await expectSentence(damaged);
      await upload(page, `${tmpPath}/zero.${extension}`, Buffer.alloc(0));
      await page.filebrowser.open(`${tmpPath}/zero.${extension}`);
      await expectSentence('This file is empty.');
    }
  });

  // DEF-MESH-69-ASSET
  test('DEF-MESH-69-ASSET a failed worker load asks for a page reload, not a damaged file', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/worker.stl`;
    await upload(page, file, stl(box(1, 1, 1)));
    await open(page, file);

    // The worker's chunk name changes with every build, so the page records the
    // URL it asks for rather than the test naming the file.
    await page.addInitScript(() => {
      const Native = (window as any).Worker;
      (window as any).workerUrls = [];
      (window as any).Worker = class extends Native {
        constructor(url: string, options?: any) {
          (window as any).workerUrls.push(String(url));
          super(url, options);
        }
      };
    });
    // The restored mesh tab is the current tab, so Galata's readiness wait for
    // an active Launcher would never finish.
    await page.reload({ waitForIsReady: false });
    await viewer(page).waitFor();
    await expect(details(page)).toHaveText(/./, { timeout: 30000 });

    const before = await page.evaluate(() => (window as any).workerUrls.length);
    await button(page, RELOAD).click();
    await expect(message(page)).toHaveText('');
    const worker = await page.evaluate(
      (at: number) => (window as any).workerUrls[at] as string,
      before
    );
    expect(worker).toContain('/static/');
    await page.route(worker, (route: any) =>
      route.fulfill({ status: 404, body: 'gone' })
    );
    await button(page, RELOAD).click();
    await expect(message(page)).toHaveText(
      'This viewer was updated; reload the page to use it.'
    );
    await expect(details(page)).toHaveText('');
  });

  // ACC-MESH-92-LARGE
  test('ACC-MESH-92-LARGE a 100 MB binary STL of 2,000,000 triangles opens and renders', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(240000);
    // A wave surface of 1000 x 1000 cells, two triangles each.
    const size = 84 + 50 * 2000000;
    const file = Buffer.alloc(size);
    file.writeUInt32LE(2000000, 80);
    const height = (i: number, j: number) =>
      40 * Math.sin(i / 60) * Math.cos(j / 60);
    let at = 84;
    const triangle = (a: Point, b: Point, c: Point) => {
      at += 12;
      for (const value of [...a, ...b, ...c]) {
        file.writeFloatLE(value, at);
        at += 4;
      }
      at += 2;
    };
    for (let i = 0; i < 1000; i++) {
      for (let j = 0; j < 1000; j++) {
        const a = [i, j, height(i, j)];
        const b = [i + 1, j, height(i + 1, j)];
        const c = [i + 1, j + 1, height(i + 1, j + 1)];
        const d = [i, j + 1, height(i, j + 1)];
        triangle(a, b, c);
        triangle(a, c, d);
      }
    }
    expect(at).toBe(size);
    const path = `${tmpPath}/large.stl`;
    await upload(page, path, file);
    await page.filebrowser.open(path);
    await viewer(page).waitFor();
    await expect(details(page)).toContainText('2,000,000 triangles', {
      timeout: 120000
    });
    await expect(details(page)).toContainText('95.4 MB');
    await expect(message(page)).toHaveText('');
    expect((await measure(page)).covered).toBeGreaterThan(5000);
  });

  // ACC-MESH-93-TABS
  test('ACC-MESH-93-TABS a hidden tab holds no context; 20 tabs all show their model with the camera kept; closing a tab frees its data', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(240000);
    await page.addInitScript(countContexts);
    const paths: string[] = [];
    for (let i = 0; i < 20; i++) {
      const path = `${tmpPath}/tab${i}.stl`;
      paths.push(path);
      await upload(page, path, stl(box(1, 1 + i / 10, 1)));
    }
    await page.reload();
    const live = (): Promise<number> =>
      page.evaluate(() => (window as any).liveContexts());
    const select = (path: string) =>
      page.evaluate(async (p: string) => {
        const app = (window as any).jupyterapp;
        const widget = Array.from(
          app.shell.widgets('main') as Iterable<any>
        ).find((w: any) => w.context?.path === p);
        app.shell.activateById(widget.id);
      }, path);

    for (const path of paths) {
      await page.evaluate(
        (p: string) =>
          (window as any).jupyterapp.commands.execute('docmanager:open', {
            path: p
          }),
        path
      );
      await viewer(page).waitFor();
      await expect(details(page)).toHaveText(/./, { timeout: 30000 });
      // Only the tab on show holds a context.
      await expect.poll(live).toBe(1);
    }
    await expect(viewer(page)).toHaveCount(1);
    await modelOnShow(page);

    // A hidden tab renders nothing: it has no canvas.
    const canvases = await page.evaluate(
      () => document.querySelectorAll('.jp-AdvancedMeshViewer canvas').length
    );
    expect(canvases).toBe(1);

    // The first and the last tab show their model, with the camera kept.
    await select(paths[0]);
    await expect(viewer(page)).toHaveCount(1);
    await expect(details(page)).toContainText('1.00 × 1.00 × 1.00');
    const firstOpen = await modelOnShow(page);
    await drag(page, 'left', 140, 50);
    const moved = await measure(page);
    const view = await camera(page);
    expect(change(firstOpen, moved)).toBeGreaterThan(1);

    await select(paths[19]);
    await expect(details(page)).toContainText('2.9');
    await modelOnShow(page);
    await expect.poll(live).toBe(1);

    await select(paths[0]);
    await expect(details(page)).toContainText('1.00 × 1.00 × 1.00');
    await expect(message(page)).toHaveText('');
    expect(await camera(page)).toEqual(view);
    const shownAgain = await measure(page);
    expect(shownAgain.covered).toBe(moved.covered);
    expect(change(moved, shownAgain)).toBeLessThan(0.01);
    await expect.poll(live).toBe(1);

    // Closing a tab frees the GPU data of its model and drops the model.
    await page.evaluate(() => {
      const scene = (window as any).jupyterapp.shell.currentWidget.content
        .scene;
      (window as any).closedScene = scene;
      (window as any).freedGeometry = false;
      scene.model.children[0].geometry.addEventListener('dispose', () => {
        (window as any).freedGeometry = true;
      });
      (window as any).jupyterapp.shell.currentWidget.dispose();
    });
    const closed = await page.evaluate(() => ({
      freed: (window as any).freedGeometry,
      model: (window as any).closedScene.model
    }));
    expect(closed).toEqual({ freed: true, model: null });
    await expect(tabs(page).filter({ hasText: /^tab0\.stl$/ })).toHaveCount(0);

    await page.evaluate(async () => {
      const app = (window as any).jupyterapp;
      for (const widget of Array.from(
        app.shell.widgets('main') as Iterable<any>
      )) {
        if ((widget as any).context) {
          (widget as any).dispose();
        }
      }
    });
    await expect.poll(live).toBe(0);
    // Every tab shown made a context of its own, so none was reused or kept.
    expect(
      await page.evaluate(() => (window as any).madeContexts())
    ).toBeGreaterThanOrEqual(20);
  });

  // ACC-MESH-94-RESTORE
  test('ACC-MESH-94-RESTORE an open mesh tab returns after a page reload', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/kept.stl`;
    await upload(page, file, stl(box(1, 1, 1)));
    await open(page, file);
    // Galata's readiness check waits for a Launcher tab, which the restored
    // layout does not have.
    await page.reload({ waitForIsReady: false });
    await expect(currentTab(page)).toHaveText('kept.stl');
    await viewer(page).waitFor();
    await expect(details(page)).toContainText('12 triangles', {
      timeout: 30000
    });
    const restored = await page.evaluate(() => {
      const widget = (window as any).jupyterapp.shell.currentWidget;
      return { path: widget.context.path };
    });
    expect(restored).toEqual({ path: file });
    await modelOnShow(page);
  });

  // ACC-MESH-95-THEME
  test('ACC-MESH-95-THEME the background follows the theme with no reload and the model stays readable', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/cube.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/cube.stl`);

    const expectTheme = async () => {
      const background = await resolved(page, 'var(--jp-layout-color0)');
      const shot = await measure(page);
      expect(shot.background).toEqual(background);
      expect(shot.covered).toBeGreaterThan(1000);
      return shot;
    };
    const light = await expectTheme();
    await page.theme.setDarkTheme();
    const dark = await expectTheme();
    expect(dark.background).not.toEqual(light.background);
    // The same model covers about the same pixels on either background.
    expect(Math.abs(dark.covered / light.covered - 1)).toBeLessThan(0.02);
  });

  // ACC-MESH-96-LAZY
  test('ACC-MESH-96-LAZY three.js loads only when the first mesh file opens, and no WASM with an STL', async ({
    page,
    tmpPath
  }) => {
    await upload(page, `${tmpPath}/cube.stl`, stl(box(1, 1, 1)));
    const scripts: string[] = [];
    const wasm: string[] = [];
    page.on('request', (request: any) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith('.js')) {
        scripts.push(request.url());
      }
      if (pathname.endsWith('.wasm')) {
        wasm.push(request.url());
      }
    });
    await page.reload();

    // three.js keeps this text in its bundle after minification.
    const holdsThree = async (urls: string[]) => {
      for (const url of urls) {
        const body = await (await page.request.get(url)).text();
        if (body.includes('WebGLRenderer')) {
          return true;
        }
      }
      return false;
    };
    const atStart = [...scripts];
    expect(atStart.length).toBeGreaterThan(0);
    expect(await holdsThree(atStart)).toBe(false);

    await open(page, `${tmpPath}/cube.stl`);
    const afterOpen = scripts.filter(url => !atStart.includes(url));
    expect(await holdsThree(afterOpen)).toBe(true);
    expect(wasm).toEqual([]);

    // The STEP WASM loads only when a STEP file opens.
    await upload(page, `${tmpPath}/cube.step`, CUBE);
    await open(page, `${tmpPath}/cube.step`);
    expect(
      wasm.filter(url => new URL(url).pathname.endsWith('/occt-import-js.wasm'))
    ).not.toEqual([]);
  });

  // DEF-MEDIA-17-CHECKPOINT
  test('DEF-MEDIA-17-CHECKPOINT opening a mesh file writes no checkpoint, and the viewer still works', async ({
    page,
    tmpPath
  }) => {
    const file = `${tmpPath}/cube.stl`;
    await upload(page, file, stl(box(1, 1, 1)));
    await open(page, file);
    // JupyterLab writes the checkpoint as the document opens.
    await page.waitForTimeout(1000);
    const checkpoints = () =>
      page.evaluate(
        (path: string) =>
          (window as any).jupyterapp.serviceManager.contents.listCheckpoints(
            path
          ),
        file
      );
    expect(await checkpoints()).toEqual([]);
    await modelOnShow(page);
    await expect(
      toolbar(page).locator('[data-jp-item-name="read-only-indicator"]')
    ).toHaveCount(0);

    await upload(page, file, stl(globe()));
    await button(page, RELOAD).click();
    await expect(details(page)).toContainText('256 triangles');
    await modelOnShow(page);
    expect(await checkpoints()).toEqual([]);
  });

  // DEF-MEDIA-18-SAVE-EMPTIES
  test('DEF-MEDIA-18-SAVE-EMPTIES Save As and Ctrl+S after a rename keep the mesh file and its content', async ({
    page,
    request,
    tmpPath
  }) => {
    const file = `${tmpPath}/save.stl`;
    const content = stl(box(1, 1, 1));
    await upload(page, file, content);
    await open(page, file);
    await modelOnShow(page);

    // A rename makes the document model writable again.
    const renamed = `${tmpPath}/renamed.stl`;
    expect(await page.contents.renameFile(file, renamed)).toBe(true);
    await expect(currentTab(page)).toHaveText('renamed.stl');

    // Save As is refused through the notification system, opens no dialog and
    // writes nothing. The notification stays in the bell's list, so its count
    // is the evidence of the refusal that the test can still read.
    const bell = () =>
      page.locator('.jp-Notification-Status').innerText().then(Number);
    const before = await bell();
    await page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('docmanager:save-as')
    );
    await expect.poll(bell, { timeout: 5000 }).toBe(before + 1);
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);

    // Ctrl+S is refused the same way, shows no error dialog and writes nothing.
    const beforeSave = await bell();
    await viewer(page).focus();
    await page.keyboard.press('Control+s');
    await expect.poll(bell, { timeout: 5000 }).toBe(beforeSave + 1);
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    const saved = await page.evaluate(async (path: string) => {
      const model = await (
        window as any
      ).jupyterapp.serviceManager.contents.get(path, { content: true });
      return model.content as string;
    }, renamed);
    // The server wraps its base64 at 76 characters; the bytes are the same.
    expect(saved.replace(/\s+/g, '')).toBe(content.toString('base64'));
    expect((await modelOnShow(page)).covered).toBeGreaterThan(5000);

    // Delete the file behind the context's back, so the context still holds
    // the writable model from the rename. Its save path then finds a 404 and
    // writes the empty document model through the default contents provider;
    // Ctrl+S must leave the file absent.
    expect((await request.delete(`/api/contents/${renamed}`)).status()).toBe(
      204
    );
    const beforeDeleted = await bell();
    await page.keyboard.press('Control+s');
    await expect.poll(bell, { timeout: 5000 }).toBe(beforeDeleted + 1);
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);
    expect((await request.get(`/api/contents/${renamed}`)).status()).toBe(404);
  });

  // ACC-MESH-97-LOCAL
  test('ACC-MESH-97-LOCAL opening any format requests only the lab', async ({
    page,
    tmpPath,
    baseURL
  }) => {
    test.setTimeout(180000);
    const files: [string, Buffer][] = [
      ['local.stl', stl(box(1, 1, 1))],
      ['local.ply', Buffer.from(plySurface(box(1, 1, 1)))],
      ['local.obj', Buffer.from(obj(box(1, 1, 1)))],
      ['local.3mf', threemf(box(1, 1, 1))],
      ['local.glb', glb(box(1, 1, 1))],
      ['local.step', CUBE]
    ];
    const urls: string[] = [];
    page.on('request', (request: any) => urls.push(request.url()));
    for (const [name, content] of files) {
      await upload(page, `${tmpPath}/${name}`, content);
      await open(page, `${tmpPath}/${name}`);
      await measure(page);
    }
    const origin = new URL(baseURL!).origin;
    const foreign = urls.filter(
      url =>
        !url.startsWith(`${origin}/`) &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:')
    );
    expect(urls.some(url => url.includes('/files/'))).toBe(true);
    expect(foreign).toEqual([]);
  });

  // ACC-MESH-101-LIGHTS
  test('ACC-MESH-101-LIGHTS Studio, Neutral and Three-point light the cube and the torus above 3:1 in both themes', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(240000);
    await upload(page, `${tmpPath}/lit-cube.stl`, stl(box(1, 1, 1)));
    await upload(page, `${tmpPath}/lit-torus.stl`, stl(torus()));
    await upload(page, `${tmpPath}/lit-z.stl`, stl(box(1, 1, 1)));
    const styles = ['Studio', 'Neutral', 'Three-point'];
    const linear = (c: number) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    // The luminance a contrast ratio implies, on either panel: a dark face on
    // the light panel or a lit face on the dark one.
    const luminance = (panel: number[], contrast: number) => {
      const panelL =
        0.2126 * linear(panel[0]) +
        0.7152 * linear(panel[1]) +
        0.0722 * linear(panel[2]);
      return panelL > 0.5
        ? (panelL + 0.05) / contrast - 0.05
        : contrast * (panelL + 0.05) - 0.05;
    };
    const cube: { [key: string]: any } = {};
    const rim: { [key: string]: any } = {};
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.theme.setDarkTheme();
      } else {
        await page.theme.setLightTheme();
      }
      await open(page, `${tmpPath}/lit-cube.stl`);
      const grids: { [style: string]: IShot } = {};
      for (const style of styles) {
        await choose(page, 'advanced-lighting', style);
        const shot = await shotOf(page);
        grids[style] = await measure(page);
        const report = await contrastReport(page, shot);
        // Every visible face of the cube holds 3:1 against the panel; the
        // lowest measured face is 3.27:1, Three-point in the light theme.
        expect(report.faces).toHaveLength(3);
        for (const face of report.faces) {
          expect(face.n).toBeGreaterThan(1000);
          expect(face.median).toBeGreaterThanOrEqual(3);
        }
        cube[`${theme} ${style}`] = report;
      }
      // The three rigs shade the faces differently: the measured mean change
      // is about 4 levels over the 32x20 grid.
      expect(change(grids.Studio, grids.Neutral)).toBeGreaterThan(0.1);
      expect(change(grids.Studio, grids['Three-point'])).toBeGreaterThan(0.1);
      expect(change(grids.Neutral, grids['Three-point'])).toBeGreaterThan(0.1);

      await open(page, `${tmpPath}/lit-torus.stl`);
      for (const style of styles) {
        await choose(page, 'advanced-lighting', style);
        const shot = await shotOf(page);
        const report = await contrastReport(page, shot);
        // The curved mesh's interior median holds 3:1 in every style; the
        // lowest is 3.50:1, Three-point in the light theme.
        expect(report.interior.n).toBeGreaterThan(10000);
        expect(report.interior.median).toBeGreaterThanOrEqual(3);
        const band = await rimReport(page, shot);
        expect(band.n).toBeGreaterThan(500);
        rim[`${theme} ${style}`] = band;
      }
      // Three-point's rim is brighter than Studio's: the top 12 rows of the
      // torus measure 0.258 against 0.246 (light) and 0.258 against 0.242
      // (dark). The outermost two pixels of the silhouette are antialiased
      // against the panel, so they are not the rim measure.
      expect(rim[`${theme} Three-point`].top).toBeGreaterThan(
        rim[`${theme} Studio`].top * 1.02
      );
    }
    // Neutral lifts the darkest face: its median luminance rises from 0.1356
    // to 0.1528, 12.7 percent, in both themes.
    for (const theme of ['light', 'dark']) {
      const studio = cube[`${theme} Studio`];
      const neutral = cube[`${theme} Neutral`];
      expect(
        luminance(neutral.panel, neutral.faces[0].median) /
          luminance(studio.panel, studio.faces[0].median)
      ).toBeGreaterThan(1.1);
    }
    // The style follows the next file in the folder, as the shading does: a
    // file never opened before shows the menu check on Three-point.
    await page.theme.setLightTheme();
    await open(page, `${tmpPath}/lit-torus.stl`);
    await choose(page, 'advanced-lighting', 'Three-point');
    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await expect(currentTab(page)).toHaveText('lit-z.stl');
    await expect(message(page)).toHaveText('');
    await item(page, 'advanced-lighting').click();
    // Only the active style renders as a checked menuitemcheckbox, and it is
    // Three-point, the style set on the previous file.
    const checked = page.locator('.lm-Menu-item[role="menuitemcheckbox"]');
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveAttribute('aria-checked', 'true');
    await expect(checked.locator('.lm-Menu-itemLabel')).toHaveText(
      'Three-point'
    );
    await page.keyboard.press('Escape');
  });

  // ACC-MESH-102-GRID
  test('ACC-MESH-102-GRID the grid adds lines outside the model in both themes and stays on across Page Down and Reload', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(240000);
    const dir = `${tmpPath}/folder`;
    const triangles = box(1, 1, 1);
    await upload(page, `${dir}/a.stl`, stl(triangles));
    await upload(page, `${dir}/b.stl`, stl(torus()));
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.theme.setDarkTheme();
      } else {
        await page.theme.setLightTheme();
      }
      await open(page, `${dir}/a.stl`);
      await expect(toggle(page, 'grid')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      const off = await shotOf(page);
      await toggle(page, 'grid').click();
      await settled(page);
      await expect(toggle(page, 'grid')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const on = await shotOf(page);
      const report = await gridReport(page, off, on);
      // Measured: 45564 grid pixels at 7.46:1 (light) and 8.13:1 (dark); the
      // model's interior is byte-identical.
      expect(report.gridPixels).toBeGreaterThanOrEqual(2000);
      expect(report.gridMedian).toBeGreaterThanOrEqual(3);
      expect(report.interiorSampled).toBeGreaterThan(10000);
      expect(report.interiorChanged).toBe(0);
      // Off again restores every pixel of the first shot.
      await toggle(page, 'grid').click();
      await settled(page);
      await expect(toggle(page, 'grid')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      const back = await shotOf(page);
      const restored = await gridReport(page, off, back);
      expect(restored.gridPixels).toBe(0);
      expect(restored.interiorChanged).toBe(0);
    }

    // Page Down carries the grid to the next file.
    await page.theme.setLightTheme();
    await open(page, `${dir}/a.stl`);
    await toggle(page, 'grid').click();
    await settled(page);
    const countGrid = async () => {
      await expect(toggle(page, 'grid')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const on = await shotOf(page);
      await toggle(page, 'grid').click();
      await settled(page);
      const off = await shotOf(page);
      await toggle(page, 'grid').click();
      await settled(page);
      const report = await gridReport(page, off, on);
      expect(report.gridPixels).toBeGreaterThanOrEqual(2000);
      expect(report.gridMedian).toBeGreaterThanOrEqual(3);
      expect(report.interiorChanged).toBe(0);
    };
    await viewer(page).focus();
    await page.keyboard.press('PageDown');
    await expect(currentTab(page)).toHaveText('b.stl');
    await expect(details(page)).toHaveText(/./, { timeout: 30000 });
    await expect(message(page)).toHaveText('');
    await countGrid();

    // Reload keeps it too: one more triangle, of no area, changes the read-out
    // and not the picture.
    await upload(
      page,
      `${dir}/b.stl`,
      stl([...triangles, ...new Array(1).fill(new Array(9).fill(0))])
    );
    await button(page, RELOAD).click();
    await expect(details(page)).toContainText(
      `${triangles.length + 1} triangles`
    );
    await expect(message(page)).toHaveText('');
    await countGrid();
  });

  // ACC-MESH-103-PROJ
  test('ACC-MESH-103-PROJ the Orthographic toggle keeps the model within 10 percent in size and centre and toggles back', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    await upload(page, `${tmpPath}/proj.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/proj.stl`);
    const before = await measure(page);
    const stateBefore = await cameraState(page);
    expect(stateBefore.orthographic).toBe(false);
    expect(stateBefore.up).toEqual([0, 0, 1]);
    await toggle(page, 'orthographic').click();
    await settled(page);
    await expect(toggle(page, 'orthographic')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const after = await measure(page);
    const stateAfter = await cameraState(page);
    expect(stateAfter.orthographic).toBe(true);
    expect(stateAfter.up).toEqual([0, 0, 1]);
    expect(stateAfter.target).toEqual([0, 0, 0]);
    // Measured: width -6.8 percent, height -2.5 percent, silhouette centre
    // 8.1 percent of its height.
    expect(
      Math.abs(boxWidth(after) - boxWidth(before)) / boxWidth(before)
    ).toBeLessThanOrEqual(0.1);
    expect(
      Math.abs(boxHeight(after) - boxHeight(before)) / boxHeight(before)
    ).toBeLessThanOrEqual(0.1);
    expect(
      Math.hypot(
        centreX(after) - centreX(before),
        centreY(after) - centreY(before)
      )
    ).toBeLessThanOrEqual(0.1 * Math.max(boxWidth(before), boxHeight(before)));
    expect(after.covered).toBeGreaterThan(5000);
    await toggle(page, 'orthographic').click();
    await settled(page);
    await expect(toggle(page, 'orthographic')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    const back = await measure(page);
    expect((await cameraState(page)).orthographic).toBe(false);
    expect(Math.abs(back.left - before.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.right - before.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.top - before.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.bottom - before.bottom)).toBeLessThanOrEqual(1);
  });

  // ACC-MESH-104-VIEWS
  test('ACC-MESH-104-VIEWS each of the ten views puts the named side towards the camera and fits the cube', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(240000);
    await upload(page, `${tmpPath}/colour-cube.ply`, Buffer.from(colourCube()));
    await open(page, `${tmpPath}/colour-cube.ply`);
    const faces: { [view: string]: string[] } = {
      Front: ['red'],
      Back: ['green'],
      Right: ['blue'],
      Left: ['yellow'],
      Top: ['magenta'],
      Bottom: ['cyan'],
      'Front-Left': ['magenta', 'yellow', 'red'],
      'Front-Right': ['magenta', 'red', 'blue'],
      'Back-Left': ['magenta', 'green', 'yellow'],
      'Back-Right': ['magenta', 'blue', 'green']
    };
    const reports: { [view: string]: any } = {};
    for (const name of Object.keys(faces)) {
      await choose(page, 'advanced-views', name);
      const report = await viewReport(page, await shotOf(page));
      reports[name] = report;
      for (const colour of [
        'red',
        'green',
        'blue',
        'yellow',
        'magenta',
        'cyan'
      ]) {
        const count = report.counts[colour] ?? 0;
        if (faces[name].includes(colour)) {
          expect(count).toBeGreaterThan(50000);
        } else {
          expect(count).toBeLessThan(5000);
        }
      }
      // The model stays fitted: its centre within 8 percent of the panel's,
      // and its shorter side over half of the panel's shorter side.
      expect(
        Math.abs((report.left + report.right) / 2 - report.width / 2)
      ).toBeLessThan(report.width * 0.08);
      expect(
        Math.abs((report.top + report.bottom) / 2 - report.height / 2)
      ).toBeLessThan(report.height * 0.08);
      expect(
        Math.min(report.right - report.left + 1, report.bottom - report.top + 1)
      ).toBeGreaterThan(Math.min(report.width, report.height) * 0.5);
      // No roll: the camera's up axis never changes.
      expect((await cameraState(page)).up).toEqual([0, 0, 1]);
    }
    // The corners show the top face above the two sides, and the named side on
    // the named hand: yellow left and red right in Front-Left, and so on.
    const sides: [string, string, string][] = [
      ['Front-Left', 'yellow', 'red'],
      ['Front-Right', 'red', 'blue'],
      ['Back-Left', 'green', 'yellow'],
      ['Back-Right', 'blue', 'green']
    ];
    for (const [view, left, right] of sides) {
      const report = reports[view];
      expect(report.centroids.magenta[1]).toBeLessThan(
        Math.min(report.centroids[left][1], report.centroids[right][1]) - 100
      );
      expect(report.centroids[left][0]).toBeLessThan(report.width / 2 - 50);
      expect(report.centroids[right][0]).toBeGreaterThan(report.width / 2 + 50);
    }
    // Top and Bottom are rolled the same way: +X is right from above and left
    // from below, with the front side at the bottom or the top edge.
    for (const view of ['Top', 'Bottom']) {
      expect(reports[view].counts.blue).toBeGreaterThan(100);
      expect(reports[view].counts.yellow).toBeGreaterThan(100);
    }
    expect(reports.Top.centroids.blue[0]).toBeGreaterThan(
      reports.Top.width / 2 + 50
    );
    expect(reports.Top.centroids.yellow[0]).toBeLessThan(
      reports.Top.width / 2 - 50
    );
    expect(reports.Bottom.centroids.blue[0]).toBeLessThan(
      reports.Bottom.width / 2 - 50
    );
    expect(reports.Bottom.centroids.yellow[0]).toBeGreaterThan(
      reports.Bottom.width / 2 + 50
    );
  });

  // ACC-MESH-104-VIEWS
  test('ACC-MESH-104-VIEWS the Views and Lighting buttons take the keyboard focus back when their menu closes', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    await upload(page, `${tmpPath}/focus.stl`, stl(box(1, 1, 1)));
    await open(page, `${tmpPath}/focus.stl`);
    // The button is a jp-button element whose real button sits in its shadow
    // root, and document.activeElement retargets to that host.
    const focusIsOn = (name: string) =>
      page.evaluate(
        (name: string) =>
          document.activeElement ===
          document.querySelector(`[data-jp-item-name="${name}"] jp-button`),
        name
      );
    await item(page, 'advanced-views').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lm-Menu')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await focusIsOn('advanced-views')).toBe(true);
    await choose(page, 'advanced-views', 'Front');
    expect(await focusIsOn('advanced-views')).toBe(true);
    await item(page, 'advanced-lighting').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lm-Menu')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await focusIsOn('advanced-lighting')).toBe(true);
  });

  // ACC-MESH-105-REALFILE
  test('ACC-MESH-105-REALFILE the supplied binary STL opens, reads 12,616 triangles and stays on show through Reload, Front, Grid and Orthographic', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    await upload(page, `${tmpPath}/all-clamp-and-toes.stl`, REAL);
    await open(page, `${tmpPath}/all-clamp-and-toes.stl`);
    await expect(details(page)).toContainText('12,616 triangles');
    await expect(details(page)).toContainText('144.4 × 93.3 × 12.8');
    await modelOnShow(page);

    await button(page, RELOAD).click();
    await expect(message(page)).toHaveText('');
    await modelOnShow(page);

    await choose(page, 'advanced-views', 'Front');
    await modelOnShow(page);

    // The grid leaves the model's pixels as they were and adds lines around
    // them.
    const front = await shotOf(page);
    await toggle(page, 'grid').click();
    await settled(page);
    const gridOn = await shotOf(page);
    const report = await gridReport(page, front, gridOn);
    expect(report.gridPixels).toBeGreaterThanOrEqual(2000);
    expect(report.interiorSampled).toBeGreaterThan(5000);
    expect(report.interiorChanged).toBe(0);
    await modelOnShow(page);

    await toggle(page, 'orthographic').click();
    await settled(page);
    await expect(toggle(page, 'orthographic')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect((await cameraState(page)).orthographic).toBe(true);
    await modelOnShow(page);
    await expect(details(page)).toContainText('12,616 triangles');
  });

  // ACC-MESH-106-PERF-UI
  test('ACC-MESH-106-PERF-UI a 95 MB STL opens with no main-thread task over 200 ms and reads out within 20 s', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    const file = `${tmpPath}/stl-95mb.stl`;
    await upload(page, file, sphere(998, 998));
    await watchFrames(page);
    const started = Date.now();
    await page.filebrowser.open(file);
    await viewer(page).waitFor();
    await expect(details(page)).toHaveText(/./, { timeout: 20000 });
    const wall = Date.now() - started;
    await modelBuilt(page);
    await settled(page);
    const probe = await frameGaps(page);
    console.log(
      'PERF 95MB ' +
        JSON.stringify({
          wall,
          frames: probe.frames,
          maxGap: probe.max,
          over: probe.over,
          tasks: probe.tasks
        })
    );
    // An empty probe would pass both checks while seeing nothing.
    expect(probe.frames).toBeGreaterThan(0);
    expect(probe.over).toEqual([]);
    expect(probe.max).toBeLessThanOrEqual(200);
    expect(wall).toBeLessThanOrEqual(20000);
    await expect(details(page)).toContainText('1,992,008 triangles');
  });

  // ACC-MESH-107-PERF-FPS
  test('ACC-MESH-107-PERF-FPS a 1M-triangle model orbits at 25 fps and idle draws at most two frames', async ({
    page
  }) => {
    test.setTimeout(180000);
    const file = rootFile(MILLION, MILLION_BYTES);
    if (!file) {
      test.skip(
        true,
        'the 1M fixture is not in JUPYTERLAB_GALATA_ROOT_DIR or tmp/workflows/mesh-viewer/fixtures'
      );
      return;
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await watchDraws(page);
    // The fixture appears in the root after the page first listed it.
    await page.filebrowser.openHomeDirectory();
    await page.filebrowser.refresh();
    await page.filebrowser.open(file);
    await viewer(page).waitFor();
    await expect(details(page)).toContainText('1,000,000 triangles', {
      timeout: 120000
    });
    await modelBuilt(page);
    await page.waitForTimeout(500);
    // Four drag-only seconds let the ladder measure the full mesh, the eager
    // 250,000 rung and the lazy rungs, and settle on the rung that fits. The
    // warm-up does not zoom, so the measured window that follows starts at the
    // fitted framing and its wheel phase supplies the zoom.
    await orbitPipelined(page, 4000, false);
    const primed = await proxyState(page);
    // The same 5 s window drew 13 frames with the full mesh.
    const orbit = await orbitPipelined(page, 5000);
    // Idle: no input for three seconds after a settle pause. A resize here
    // restarts the pump and draws, so the viewport is not touched.
    await page.waitForTimeout(500);
    const rest = await proxyState(page);
    await resetDraws(page);
    await page.waitForTimeout(3000);
    const idle = await drawReport(page);
    const fps = (orbit.report.frames / orbit.report.elapsed) * 1000;
    console.log(
      'PERF 1M ' +
        JSON.stringify({
          sent: orbit.sent,
          frames: orbit.report.frames,
          elapsed: orbit.report.elapsed,
          fps,
          drawnMedian: orbit.report.drawnMedian,
          drawnMax: orbit.report.drawnMax,
          tickMedian: orbit.report.tickMedian,
          tickMax: orbit.report.tickMax,
          renderer: orbit.report.renderer,
          primed,
          during: orbit.during,
          rest,
          idle
        })
    );
    // The orbit is trusted input and moved the camera.
    expect(
      orbit.before.position.some(
        (value, index) => Math.abs(value - orbit.after.position[index]) > 1e-3
      )
    ).toBe(true);
    expect(
      Math.abs(orbit.after.distance / orbit.before.distance - 1)
    ).toBeGreaterThan(0.01);
    // The ladder picks the rung by measurement. On a software rasterizer the
    // full mesh misses the budget, more than one rung is built, a
    // simplification is on show while the camera moves, and the rung the loop
    // settled on met the budget. On a hardware renderer level 0 fits and no
    // rung is ever shown.
    const software = /swiftshader|llvmpipe|software/i.test(
      orbit.report.renderer
    );
    if (software) {
      expect(primed.slow).toBe(true);
      expect(rest.levels.length).toBeGreaterThan(1);
      expect(orbit.during.level).toBeGreaterThan(0);
      expect(orbit.during.levelTriangles).toBeGreaterThan(0);
      expect(orbit.during.levelTriangles).toBeLessThan(1_000_000);
      expect(rest.restLevel).toBeGreaterThan(0);
      expect(rest.levelFits).toBe(true);
      expect(rest.floorMiss).toBe(false);
    } else {
      expect(primed.slow).toBe(false);
      expect(orbit.during.level).toBe(0);
      expect(orbit.during.levelFits).toBe(true);
      expect(rest.floorMiss).toBe(false);
    }
    expect(orbit.report.drawnMedian).toBeLessThanOrEqual(40);
    // 25 fps over the 5 s window, on the software renderer too: the rung draws
    // a fraction of the million triangles where the full mesh drew 13 frames.
    expect(orbit.report.frames).toBeGreaterThanOrEqual(125);
    // At rest the full mesh is back on show and the settle frame is the last
    // draw.
    expect(rest.level).toBe(0);
    expect(rest.modelVisible).toBe(true);
    expect(rest.proxyVisible).toBe(false);
    expect(idle.ticks).toBeGreaterThanOrEqual(60);
    expect(idle.frames).toBeLessThanOrEqual(2);
  });

  // ACC-MESH-107-PERF-FPS, the other side of the threshold: a model that
  // already meets the bar keeps the full mesh and builds no rung.
  test('ACC-MESH-107-PERF-FPS a 12,616-triangle model draws the full mesh with no proxy', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    const file = `${tmpPath}/all-clamp-and-toes.stl`;
    await upload(page, file, REAL);
    await open(page, file);
    await modelBuilt(page);
    await page.waitForTimeout(500);
    const start = await proxyState(page);
    await drag(page, 'left', 120, 40);
    await page.waitForTimeout(500);
    const after = await proxyState(page);
    console.log('PERF 1M SMALL ' + JSON.stringify({ start, after }));
    expect(start.levels.length).toBe(0);
    expect(start.level).toBe(0);
    expect(start.proxy).toBe(false);
    expect(after.levels.length).toBe(0);
    expect(after.level).toBe(0);
    expect(after.modelVisible).toBe(true);
  });

  // ACC-MESH-108-PERF-MEM
  test('ACC-MESH-108-PERF-MEM a 95 MB STL peaks under 1.5 GB, and closing the tab loses the context and returns the heap', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(180000);
    const file = `${tmpPath}/stl-95mb.stl`;
    await upload(page, file, sphere(998, 998));
    const heap = await watchHeap(page);
    try {
      const before = await heap.measure();
      await page.evaluate(() => {
        const probe = { max: 0 };
        (window as any).memoryProbe = probe;
        (window as any).memoryTimer = setInterval(() => {
          const memory = (performance as any).memory;
          if (memory) {
            probe.max = Math.max(probe.max, memory.usedJSHeapSize);
          }
        }, 50);
      });
      await page.filebrowser.open(file);
      await viewer(page).waitFor();
      await expect(details(page)).toHaveText(/./, { timeout: 20000 });
      await modelBuilt(page);
      await settled(page);
      const memoryMax = await page.evaluate(() => {
        clearInterval((window as any).memoryTimer);
        return (window as any).memoryProbe.max;
      });
      const peak = heap.peak();
      const pagePeak = heap.pagePeak();
      const workerPeak = heap.workerPeak();

      // The tab returns the context and the heap: the canvas loses its WebGL
      // context, and the used and backing bytes come back to where they were.
      await page.evaluate(() => {
        const canvas = document.querySelector('.jp-AdvancedMeshViewer canvas');
        (window as any).contextLost = false;
        canvas?.addEventListener('webglcontextlost', () => {
          (window as any).contextLost = true;
        });
        (window as any).jupyterapp.shell.currentWidget.dispose();
      });
      await expect
        .poll(() => page.evaluate(() => (window as any).contextLost), {
          timeout: 30000
        })
        .toBe(true);
      const after = await heap.measure();
      console.log(
        'PERF 95MB memory ' +
          JSON.stringify({
            before,
            peak,
            pagePeak,
            workerPeak,
            after,
            memoryMax,
            returned: after - before
          })
      );
      // A sample that never saw the worker would pass the budget while
      // measuring nothing, so the worker's part of the sum is asserted.
      expect(workerPeak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(1.5 * 1024 ** 3);
      expect(memoryMax).toBeLessThanOrEqual(1.5 * 1024 ** 3);
      expect(after - before).toBeLessThanOrEqual(100 * 1024 * 1024);
    } finally {
      await heap.stop();
    }
  });

  // ACC-MESH-110-PERF-LARGE, DEF-MESH-19-LIMIT
  test('ACC-MESH-110-PERF-LARGE a 1 GiB STL opens without a gap over 200 ms and under a 4 GB heap', async ({
    page
  }) => {
    const file = largeFile();
    if (!file) {
      test.skip(
        true,
        `the 1 GiB fixture is not in JUPYTERLAB_GALATA_ROOT_DIR or tmp/workflows/mesh-viewer/fixtures`
      );
      return;
    }
    // The 1 GiB read has no wall bar of its own (the criterion is the 200 ms
    // gap and the 4 GB heap). It measures 343-452 s, and a host running a
    // second Galata suite took the old 900 s guard, so the guard follows the
    // read, not a budget.
    test.setTimeout(1800000);
    // The fixture appears in the root after the page first listed it.
    await page.filebrowser.openHomeDirectory();
    await page.filebrowser.refresh();
    let crashed = false;
    page.on('crash', () => {
      crashed = true;
    });
    const heap = await watchHeap(page);
    try {
      const before = await heap.measure();
      await watchFrames(page);
      const started = Date.now();
      const opened = page.filebrowser.open(file);
      // The read runs in a worker, so the tab answers while it reads.
      await page.waitForTimeout(2000);
      const answered = await Promise.race([
        page.evaluate(() => Date.now()),
        new Promise(resolve => setTimeout(() => resolve(false), 1000))
      ]);
      expect(await opened).not.toBe(false);
      expect(answered).not.toBe(false);
      await viewer(page).waitFor();
      await expect(details(page)).toHaveText(/./, { timeout: 1200000 });
      const wall = Date.now() - started;
      await modelBuilt(page);
      await settled(page);
      const probe = await frameGaps(page);
      const peak = heap.peak();
      const pagePeak = heap.pagePeak();
      const workerPeak = heap.workerPeak();
      console.log(
        'PERF 1GIB ' +
          JSON.stringify({
            wall,
            peak,
            pagePeak,
            workerPeak,
            before,
            frames: probe.frames,
            maxGap: probe.max,
            over: probe.over,
            tasks: probe.tasks
          })
      );
      expect(crashed).toBe(false);
      expect(workerPeak).toBeGreaterThan(0);
      expect(probe.frames).toBeGreaterThan(0);
      expect(probe.over).toEqual([]);
      expect(probe.max).toBeLessThanOrEqual(200);
      expect(peak).toBeLessThanOrEqual(4 * 1024 ** 3);
      await expect(details(page)).toContainText('21,464,352 triangles');
    } finally {
      await heap.stop();
    }
  });

  // The 3MF reader runs on the page, so this records what its parse costs. The
  // 1M grid is the highly compressible case: deflate shrinks the repeating XML
  // to a few MB while the expanded text stays above a hundred MB.
  test('ACC-MESH-111-THREEMF-PERF a 3MF parse on the page is measured at 250k and 1M triangles', async ({
    page,
    tmpPath
  }) => {
    test.setTimeout(900000);
    const measured: any[] = [];
    for (const target of [250_000, 1_000_000]) {
      const file = `${tmpPath}/grid-${target}.3mf`;
      const content = threemfGrid(target);
      await upload(page, file, content);
      await watchFrames(page);
      const started = Date.now();
      let opened = false;
      let readout = '';
      try {
        await page.filebrowser.open(file);
        await viewer(page).waitFor();
        await expect(details(page)).toHaveText(/./, { timeout: 600000 });
        readout = (await details(page).textContent()) ?? '';
        await modelBuilt(page);
        await settled(page);
        opened = true;
      } catch (reason) {
        // A parse that never returns is the finding, not a test failure.
      }
      const probe = await frameGaps(page).catch(() => null);
      const tasks = (probe?.tasks ?? []).map((task: number[]) => task[1]);
      measured.push({
        target,
        bytes: content.length,
        readout,
        opened,
        wall: Date.now() - started,
        maxTask: tasks.length ? Math.max(...tasks) : 0,
        tasks,
        maxGap: probe?.max ?? -1,
        over: probe?.over ?? []
      });
    }
    console.log('PERF 3MF ' + JSON.stringify(measured));
    // An empty probe would record nothing while appearing to measure, so the
    // first fixture must open and the probe must see the parse task.
    expect(measured[0].opened).toBe(true);
    expect(measured[0].maxTask > 0 || measured[0].over.length > 0).toBe(true);
  });
});
