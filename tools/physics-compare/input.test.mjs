import test from "node:test";
import assert from "node:assert/strict";

test("physics input preserves short taps and separates swivel deadzone", async () => {
  const listeners = new Map();
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  globalThis.window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  globalThis.localStorage = { getItem: () => null, setItem() { } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => [] } });
  const settings = await import("../../src/shared/settings.js");
  const input = await import("../../src/shared/input.js");
  const send = (name, values = {}) => listeners.get(name)({ preventDefault() { }, ...values });
  try {
    for (let tap = 0; tap < 2; tap++) {
      send("keydown", { code: "Space" });
      send("keyup", { code: "Space" });
    }
    assert.deepEqual(Array.from({ length: 5 }, () => input.readPhysicsControls().jump), [true, false, true, false, false]);
    send("keydown", { code: "Space" });
    assert.equal(input.readPhysicsControls().jump, true);
    assert.equal(input.readPhysicsControls().jump, true);
    send("blur");
    assert.equal(input.readPhysicsControls().jump, false);
    settings.setBind("jumpAlternative", "KeyJ");
    send("keydown", { code: "Space" });
    send("keydown", { code: "KeyJ" });
    send("keyup", { code: "Space" });
    assert.equal(input.isActionDown("jump"), true);
    assert.equal(input.readPhysicsControls().jump, true);
    assert.equal(input.readPhysicsControls().jump, true);
    send("keyup", { code: "KeyJ" });
    assert.equal(input.readPhysicsControls().jump, false);
    send("keydown", { code: "KeyJ" });
    send("keyup", { code: "KeyJ" });
    assert.equal(input.readPhysicsControls().jump, true);
    assert.equal(input.readPhysicsControls().jump, false);
    settings.setBind("jump", "Mouse0");
    send("mousedown", { button: 0 });
    send("mouseup", { button: 0 });
    assert.equal(input.readPhysicsControls().jump, true);
    assert.equal(input.readPhysicsControls().jump, false);
    settings.setPad("deadzone", 0.3);
    settings.setPad("freeLookDeadzone", 0.1);
    navigator.getGamepads = () => [{ axes: [0.2, 0, 0.2, 0], buttons: [] }];
    const controls = input.readControls();
    assert.equal(controls.steer, 0);
    assert(Math.abs(controls.lookRight - 1 / 9) < 1e-10);
    settings.setPad("jumpAlternative", 5);
    navigator.getGamepads = () => [{ axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, (_, index) => ({ pressed: index === 5, value: index === 5 ? 1 : 0 })) }];
    assert.equal(input.readControls().jump, true);
    assert.equal(input.isActionDown("jump"), true);
    send("mousedown", { button: 0 });
    send("mouseup", { button: 0 });
    assert.equal(input.readPhysicsControls().jump, true);
    assert.equal(input.readPhysicsControls().jump, true, "keyboard release must not cancel a held controller jump");
    navigator.getGamepads = () => [];
    assert.equal(input.readPhysicsControls().jump, false);
    const restingPad = { index: 0, connected: true, axes: [0.004, 0.004], buttons: [] };
    const usedPad = { index: 1, connected: true, axes: [0.7, 0], buttons: [] };
    navigator.getGamepads = () => [restingPad, usedPad];
    assert.equal(input.getActiveGamepad(), usedPad, "an idle first pad must not block the controller being used");
    usedPad.buttons = [{ pressed: true, value: 1 }];
    settings.setPad("jump", 0);
    input.consumePadButtonUntilRelease(0);
    assert.equal(input.readControls().jump, false);
    assert.equal(input.readControls().jump, false, "selection must preserve suppression on repeated reads");
    usedPad.axes[0] = 0;
    usedPad.buttons = [];
    assert.equal(input.getActiveGamepad(), usedPad, "selection stays stable at rest");
    usedPad.connected = false;
    restingPad.buttons = [{ pressed: true, value: 1 }];
    assert.equal(input.getActiveGamepad(), restingPad, "disconnected controllers are not selected");
    assert.equal(input.readControls().jump, true, "suppression must not leak to a different controller");
    restingPad.buttons = [];
    usedPad.connected = true;
    settings.setPad("deadzone", 0.1);
    usedPad.axes[0] = 0.15;
    assert.equal(input.getActiveGamepad(), usedPad, "gentle steering above the configured deadzone must select the controller");
    usedPad.axes[0] = 0.004;
    restingPad.axes = [0.004, 0.004, 0.004, 0.004];
    assert.equal(input.getActiveGamepad(), usedPad, "idle stick noise must not switch controllers");
    settings.setPad("deadzone", 0.3);
    restingPad.axes[2] = 0.15;
    assert.equal(input.getActiveGamepad(), restingPad, "camera activity must use its separate configured deadzone");
    restingPad.axes[2] = 0;
    usedPad.axes[0] = 0.2;
    assert.equal(input.getActiveGamepad(), restingPad, "steering below the configured deadzone must not switch controllers");
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
});