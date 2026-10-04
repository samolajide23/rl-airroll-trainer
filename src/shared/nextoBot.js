import { NEXTO_ACTIONS, nextoControls, nextoObservation } from "./nextoObservation.js";

export class NextoBot {
  constructor() {
    this.ready = false;
    this.error = null;
    this.generation = 0;
    this.reset();
    this.worker = new Worker(new URL("./nextoWorker.js", import.meta.url), { type: "module" });
    this.armTimeout(30000, "Nexto loading timed out. Check your connection, then exit and reopen the match.");
    this.worker.onmessage = ({ data }) => {
      if (data.type === "ready") { clearTimeout(this.timeout); this.ready = true; }
      else if (data.generation !== undefined && data.generation !== this.generation) return;
      else if (data.type === "action") {
        clearTimeout(this.timeout);
        if (!Number.isInteger(data.action) || !NEXTO_ACTIONS[data.action]) {
          this.error = "Invalid Nexto action";
          this.pending = false;
          return;
        }
        this.action = NEXTO_ACTIONS[data.action];
        this.input = nextoControls(this.action);
        this.remaining = 8;
        this.pending = false;
        this.decisions += 1;
        this.milliseconds = data.milliseconds;
      } else if (data.type === "error") {
        clearTimeout(this.timeout);
        this.error = data.message;
        this.pending = false;
      }
    };
    this.worker.onerror = event => { clearTimeout(this.timeout); this.error = event.message; this.pending = false; };
    this.worker.postMessage({ type: "load" });
  }

  reset() {
    if (this.ready) clearTimeout(this.timeout);
    this.generation += 1;
    this.pending = false;
    this.remaining = 0;
    this.action = Array(8).fill(0);
    this.input = {};
    this.decisions = 0;
  }

  request(car, opponent, ball, pads) {
    if (!this.ready || this.pending || this.error || this.remaining > 0) return;
    const observation = nextoObservation(car, opponent, ball, pads, this.action);
    this.pending = true;
    this.armTimeout(10000, "Nexto inference timed out. Exit and reopen the match.");
    this.worker.postMessage({ type: "step", generation: this.generation,
      observation });
  }

  armTimeout(milliseconds, message) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => { this.error = message; this.pending = false; }, milliseconds);
  }

  dispose() { clearTimeout(this.timeout); this.worker.terminate(); }
}