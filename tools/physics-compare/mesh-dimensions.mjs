/** Independently verify generated browser geometry against soccar CMF fixtures. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SOCCAR_TRIS } from "../../src/shared/soccarMeshData.js";

const root = new URL("./collision_meshes/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const files = (await readdir(new URL("soccar/", root))).filter(n => n.endsWith(".cmf")).sort();
assert.deepEqual(files, Object.keys(manifest.meshes).sort(), "reference mesh set mismatch");
let index = 0;
for (const file of files) {
  const buffer = await readFile(new URL(`soccar/${file}`, root));
  assert.equal(createHash("sha256").update(buffer).digest("hex"), manifest.meshes[file], `${file}: fixture hash mismatch`);
  const triangles = buffer.readInt32LE(0), vertices = buffer.readInt32LE(4);
  const start = 8 + triangles * 12;
  assert.equal(buffer.length, start + vertices * 12, `${file}: invalid CMF size`);
  for (let tri = 0; tri < triangles; tri++) for (let corner = 0; corner < 3; corner++) {
    const vertex = buffer.readInt32LE(8 + tri * 12 + corner * 4);
    assert(vertex >= 0 && vertex < vertices, "invalid vertex index");
    for (let axis = 0; axis < 3; axis++) {
      const expected = Math.fround(buffer.readFloatLE(start + vertex * 12 + axis * 4) * 50);
      assert.equal(SOCCAR_TRIS[index++], expected, `${file}: browser collision vertex mismatch`);
    }
  }
}
assert.equal(index, SOCCAR_TRIS.length, "browser/reference triangle counts differ");
console.log(`PASS: ${index / 9} soccar triangles, every vertex bit-identical to hash-verified fixtures (BT → uu ×50).`);