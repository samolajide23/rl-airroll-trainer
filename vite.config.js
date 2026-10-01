import { defineConfig } from "vite";
import { SOCCAR_TRI_COUNT, SOCCAR_TRIS, SOCCAR_MESH_ENDS } from "./src/shared/soccarMeshData.js";

export default defineConfig({
  plugins: [{
    name: "compact-arena-data",
    apply: "build",
    transform(source, id) {
      if (!id.replaceAll("\\", "/").endsWith("/src/shared/soccarMeshData.js")) return;
      const bytes = Buffer.alloc(SOCCAR_TRIS.length * 4);
      for (let index = 0; index < SOCCAR_TRIS.length; index++) {
        bytes.writeFloatLE(SOCCAR_TRIS[index], index * 4);
      }
      return {
        code: `
          export const SOCCAR_TRI_COUNT = ${SOCCAR_TRI_COUNT};
          export const SOCCAR_MESH_ENDS = ${JSON.stringify(SOCCAR_MESH_ENDS)};
          const encoded = atob(${JSON.stringify(bytes.toString("base64"))});
          const bytes = Uint8Array.from(encoded, character => character.charCodeAt(0));
          const view = new DataView(bytes.buffer);
          export const SOCCAR_TRIS = new Float32Array(${SOCCAR_TRIS.length});
          for (let index = 0; index < SOCCAR_TRIS.length; index++) {
            SOCCAR_TRIS[index] = view.getFloat32(index * 4, true);
          }
        `,
        map: null,
      };
    },
  }],
  build: {
    rollupOptions: {
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