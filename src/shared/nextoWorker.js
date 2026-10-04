let runtime;
let session;
const root = new URL(`${import.meta.env.BASE_URL}bots/nexto/`, self.location.origin);

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      runtime = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort.wasm.min.mjs");
      runtime.env.wasm.numThreads = 1;
      runtime.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/";
      const manifestResponse = await fetch(new URL("manifest.json", root));
      if (!manifestResponse.ok) throw new Error("Nexto manifest unavailable");
      const manifest = await manifestResponse.json();
      const response = await fetch(new URL(manifest.model, root));
      if (!response.ok) throw new Error("Nexto model unavailable");
      const bytes = await response.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
      if (hash !== manifest.sha256) throw new Error("Nexto model hash mismatch");
      session = await runtime.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
      const warmup = await session.run({
        query: new runtime.Tensor("float32", new Float32Array(32), [1, 1, 32]),
        entities: new runtime.Tensor("float32", new Float32Array(37 * 24), [1, 37, 24]),
        mask: new runtime.Tensor("float32", new Float32Array(37), [1, 37]),
      });
      if (warmup.logits.data.length !== 90 || !warmup.logits.data.every(Number.isFinite)) throw new Error("Invalid Nexto warmup output");
      self.postMessage({ type: "ready" });
    } else if (data.type === "step") {
      if (!session) throw new Error("Nexto policy is not ready");
      const start = performance.now();
      const outputs = await session.run({
        query: new runtime.Tensor("float32", data.observation.query, [1, 1, 32]),
        entities: new runtime.Tensor("float32", data.observation.entities, [1, 37, 24]),
        mask: new runtime.Tensor("float32", data.observation.mask, [1, 37]),
      });
      const logits = outputs.logits.data;
      if (logits.length !== 90 || !logits.every(Number.isFinite)) throw new Error("Invalid Nexto policy output");
      let action = 0;
      for (let index = 1; index < logits.length; index++) if (logits[index] > logits[action]) action = index;
      self.postMessage({ type: "action", generation: data.generation, action, milliseconds: performance.now() - start });
    }
  } catch (error) {
    self.postMessage({ type: "error", generation: data.generation, message: error.message });
  }
};