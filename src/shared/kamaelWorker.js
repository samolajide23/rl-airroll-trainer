import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";

let runtime;
const revision = "0033a98d4e060670f334f60f7f8dc5ee21ba93bb";
const base = new URL(`${import.meta.env.BASE_URL}bots/kamael/`, self.location.origin);

async function initialize() {
  runtime = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" });
  await runtime.loadPackage("numpy");
  const manifest = await (await fetch(new URL("manifest.json", base))).json();
  if (manifest.revision !== revision) throw new Error("Kamael source revision mismatch");
  runtime.FS.mkdirTree("/kamael");
  for (const name of ["Kamael.py", "impossibum_states.py", "impossibum_utilities.py", "bot_ignore_list.txt", "browser_adapter.py"]) {
    const response = await fetch(new URL(name, base));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (manifest.files[name]) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const hash = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
      if (hash !== manifest.files[name]) throw new Error(`${name}: source integrity mismatch`);
    }
    runtime.FS.writeFile(`/kamael/${name}`, bytes);
  }
  await runtime.runPythonAsync("import sys\nsys.path.insert(0, '/kamael')\nfrom browser_adapter import browser_begin, browser_step\nbrowser_begin()");
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "initialize") {
      await initialize();
      self.postMessage({ type: "ready" });
    } else if (data.type === "begin") {
      runtime.globals.set("browser_name", data.name);
      runtime.runPython("browser_begin(browser_name)");
      self.postMessage({ type: "begun", generation: data.generation });
    } else if (data.type === "step") {
      runtime.globals.set("browser_input", JSON.stringify(data.input));
      const result = JSON.parse(runtime.runPython("browser_step(browser_input)"));
      self.postMessage({ type: "controls", generation: data.generation, ...result });
    }
  } catch (error) {
    self.postMessage({ type: "error", generation: data.generation, message: String(error.stack ?? error) });
  }
};