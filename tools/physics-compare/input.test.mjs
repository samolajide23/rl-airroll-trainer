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
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
});