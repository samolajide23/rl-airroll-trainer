import init, { get_replay_frames_data_with_progress, parse_replay } from "@rlrml/subtr-actor";
import wasmUrl from "@rlrml/subtr-actor/rl_replay_subtr_actor_bg.wasm?url";
import { normalizeReplay } from "./timeline.js";

self.onmessage = async event => {
  try {
    await init({ module_or_path: wasmUrl });
    const decoded = get_replay_frames_data_with_progress(new Uint8Array(event.data), () => {
      self.postMessage({ type: "progress" });
    }, 1000);
    self.postMessage({ type: "loaded", replay: normalizeReplay(decoded, parse_replay(new Uint8Array(event.data))) });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message ?? String(error) });
  }
};