#!/usr/bin/env node
/**
 * Convert RocketSim soccar .cmf dumps (Bullet units) into src/shared/soccarMeshData.js.
 *
 * Usage:
 *   node tools/physics-compare/gen_soccar_mesh.mjs
 *
 * Expects: tools/physics-compare/collision_meshes/soccar/*.cmf
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "collision_meshes", "soccar");
const OUT = path.join(HERE, "../../src/shared/soccarMeshData.js");
const BT_TO_UU = 50;

const files = (await readdir(SRC)).filter((f) => f.endsWith(".cmf")).sort();
if (!files.length) {
  console.error(`No .cmf files in ${SRC}`);
  process.exit(1);
}

const flat = [];
const meshEnds = [];
let triCount = 0;
for (const name of files) {
  const buf = await readFile(path.join(SRC, name));
  const nTri = buf.readInt32LE(0);
  const nVert = buf.readInt32LE(4);
  let off = 8;
  const idx = [];
  for (let i = 0; i < nTri; i++) {
    idx.push([buf.readInt32LE(off), buf.readInt32LE(off + 4), buf.readInt32LE(off + 8)]);
    off += 12;
  }
  const verts = [];
  for (let i = 0; i < nVert; i++) {
    verts.push([
      buf.readFloatLE(off) * BT_TO_UU,
      buf.readFloatLE(off + 4) * BT_TO_UU,
      buf.readFloatLE(off + 8) * BT_TO_UU,
    ]);
    off += 12;
  }
  for (const [a, b, c] of idx) {
    flat.push(...verts[a], ...verts[b], ...verts[c]);
    triCount += 1;
  }
  meshEnds.push(triCount);
}

const trace = process.argv[2] ?? path.join(HERE, "out/native/ball_wall_trace.exe");
const result = spawnSync(trace, [path.dirname(SRC), "mesh-order"], { encoding: "utf8", maxBuffer: 8000000 });
if (result.status !== 0) throw new Error(`Native mesh-order trace failed: ${result.error?.message ?? result.stderr}`);
const nativeTriangles = result.stdout.split("\n").filter(line => line.startsWith("{")).map(JSON.parse);
const byVertices = new Map();
for (let triangle = 0; triangle < triCount; triangle++)
  byVertices.set(flat.slice(triangle * 9, triangle * 9 + 9).map(Math.fround).join(","), triangle);
const queryOrder = nativeTriangles.map(entry => byVertices.get(entry.vertices.flat().map(value => Math.fround(value * BT_TO_UU)).join(",")));
if (queryOrder.length !== triCount || queryOrder.some(index => index === undefined) || new Set(queryOrder).size !== triCount)
  throw new Error("Native mesh traversal must map bijectively to all source triangles");

const body =
  "/** Auto-generated from RocketSim soccar .cmf (UU). Run gen_soccar_mesh.mjs to refresh. */\n" +
  `export const SOCCAR_TRI_COUNT = ${triCount};\n` +
  `export const SOCCAR_MESH_ENDS = ${JSON.stringify(meshEnds)};\n` +
  `export const SOCCAR_QUERY_ORDER = new Uint16Array(${JSON.stringify(queryOrder)});\n` +
  `export const SOCCAR_BT_TRIS = new Float32Array(${JSON.stringify(flat.map(value => value / BT_TO_UU))});\n` +
  `export const SOCCAR_TRIS = new Float32Array(${JSON.stringify(flat)});\n`;

await writeFile(OUT, body);
console.log(`wrote ${OUT} (${triCount} tris, ${files.length} meshes)`);
