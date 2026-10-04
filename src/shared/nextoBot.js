import { NEXTO_ACTIONS, nextoControls, nextoObservation } from "./nextoObservation.js";

export const NEXTO_KICKOFF = [
  [44, [1, 0, 0, 0, 0, 0, 1, 0]],
  [16, [1, -1, 0, 0, 0, 0, 1, 0]],
  [8, [1, 0, 0, 0, 0, 1, 1, 0]],
  [4, [1, 0, 0, 0, 0, 0, 1, 0]],
  [4, [1, 0, -0.7, 0.8, 0, 1, 1, 0]],
  [52, [1, 0, 1, 0, 0, 0, 1, 0]],
  [40, [1, 0, 0.5, 0, 1, 0, 0, 0]],
].flatMap(([ticks, action]) => Array.from({ length: ticks }, () => action));

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
        this.queuedAction = NEXTO_ACTIONS[data.action];
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
    this.queuedAction = null;
    this.action = Array(8).fill(0);
    this.input = {};
    this.decisions = 0;
    this.appliedDecisions = 0;
    this.missedDeadlines = 0;
    this.kickoffTick = -1;
  }

  startKickoff() { this.kickoffTick = 0; }

  inputForTick(ball) {
    if (this.error) return {};
    if (this.kickoffTick >= 0) {
      if (ball.pos.y !== 0 || this.kickoffTick >= NEXTO_KICKOFF.length) {
        this.kickoffTick = -1;
      } else {
        this.action = NEXTO_KICKOFF[this.kickoffTick++];
        this.input = nextoControls(this.action);
        return this.input;
      }
    }
    if (this.remaining === 0) {
      if (this.queuedAction) {
        this.action = this.queuedAction;
        this.input = nextoControls(this.action);
        this.queuedAction = null;
        this.appliedDecisions += 1;
      } else if (this.pending) this.missedDeadlines += 1;
      this.remaining = 8;
    }
    return this.input;
  }

  advanceTick() {
    this.remaining = Math.max(0, this.remaining - 1);
  }

  request(car, opponent, ball, pads) {
    if (!this.ready || this.pending || this.error || this.queuedAction ||
        (this.remaining !== 0 && this.remaining !== 7) || this.kickoffTick >= 0) return;
    const observation = nextoObservation(car, opponent, ball, pads, this.action);
    this.pending = true;
    this.armTimeout(10000, "Nexto inference timed out. Exit and reopen the match.");
    this.worker.postMessage({ type: "step", generation: this.generation,
      observation }, [observation.query.buffer, observation.entities.buffer, observation.mask.buffer]);
  }

  armTimeout(milliseconds, message) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => { this.error = message; this.pending = false; }, milliseconds);
  }

  dispose() { clearTimeout(this.timeout); this.worker.terminate(); }
}