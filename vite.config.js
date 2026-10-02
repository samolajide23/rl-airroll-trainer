import { defineConfig } from "vite";
import { SOCCAR_TRI_COUNT, SOCCAR_TRIS, SOCCAR_MESH_ENDS, SOCCAR_QUERY_ORDER, SOCCAR_BT_TRIS } from "./src/shared/soccarMeshData.js";

export default defineConfig({
  server: { hmr: false },
  worker: { format: "es" },
  plugins: [{
    name: "compact-arena-data",
    apply: "build",
    transform(source, id) {
      if (!id.replaceAll("\\", "/").endsWith("/src/shared/soccarMeshData.js")) return;
      const arrays = { SOCCAR_TRIS, SOCCAR_BT_TRIS, SOCCAR_QUERY_ORDER };
      const encodedArrays = Object.entries(arrays).map(([name, values]) => {
        const integer = values instanceof Uint16Array;
        const stride = integer ? 2 : 4;
        const bytes = Buffer.alloc(values.length * stride);
        for (let index = 0; index < values.length; index++) {
          if (integer) bytes.writeUInt16LE(values[index], index * stride);
          else bytes.writeFloatLE(values[index], index * stride);
        }
        return `
          export const ${name} = new ${integer ? "Uint16Array" : "Float32Array"}(${values.length});
          {
            const encoded = atob(${JSON.stringify(bytes.toString("base64"))});
            const bytes = Uint8Array.from(encoded, character => character.charCodeAt(0));
            const view = new DataView(bytes.buffer);
            for (let index = 0; index < ${name}.length; index++) {
              ${name}[index] = view.${integer ? "getUint16" : "getFloat32"}(index * ${stride}, true);
            }
          }
        `;
      });
      return {
        code: `
          export const SOCCAR_TRI_COUNT = ${SOCCAR_TRI_COUNT};
          export const SOCCAR_MESH_ENDS = ${JSON.stringify(SOCCAR_MESH_ENDS)};
          ${encodedArrays.join("\n")}
        `,
        map: null,
      };
    },
  }],
  build: {
    rollupOptions: {
      input: { trainer: "index.html", replay: "replay.html", replayStudies: "design-previews/replay-studies.html", playbackStudies: "design-previews/playback-studies.html" },
      output: {
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (path.includes("/node_modules/three/")) return "three";
          if (path.endsWith("/soccarMeshData.js")) return "arena-data";
        },
      },
    },
  },
});