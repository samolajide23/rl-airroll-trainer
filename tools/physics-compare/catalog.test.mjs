import test from "node:test";
import assert from "node:assert/strict";
import { PHASES, GAME_MODES, FREE_PLAY } from "../../src/modes/catalog.js";

test("training curriculum preserves drill launchers and distinct ordered mechanics", () => {
  assert.equal(PHASES.length, 11);
  assert.equal(new Set(PHASES.map(phase => phase.id)).size, PHASES.length);
  assert.equal(new Set(GAME_MODES.map(mode => mode.id)).size, GAME_MODES.length);
  assert.equal(FREE_PLAY.id, "arena");
  assert.equal(GAME_MODES.filter(mode => mode.available).length, 15);
  for (const id of ["driving", "dodges"]) {
    const mode = GAME_MODES.find(mode => mode.id === id);
    assert.equal(mode.available, true);
    assert.equal(mode.steps.length, 5);
  }
  for (const phase of PHASES) {
    for (const mode of phase.modes) {
      assert(mode.steps.length >= 4);
      assert(mode.steps.every(step => typeof step === "string" && step.length > 0));
      if (mode.id !== FREE_PLAY.id) assert(/^(Beginner|Intermediate|Advanced|Expert)( to (Intermediate|Advanced|Expert))?$/.test(mode.level));
      if (mode.available) {
        assert.equal(typeof mode.load, "function");
        assert.equal(typeof mode.create, "function");
      } else {
        assert.equal(mode.create, undefined);
      }
    }
  }
  for (const id of ["half-flip", "ground-pinch", "kuxir-pinch", "flip-reset"]) {
    assert(GAME_MODES.some(mode => mode.id === id && !mode.available));
  }
});