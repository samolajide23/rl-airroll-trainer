import test from "node:test";
import assert from "node:assert/strict";
import { CAMERA_PRESETS, matchingCameraPreset } from "../../src/shared/cameraPresets.js";

test("binding presets reset only bindings and list each supported action once", async () => {
  await withSettings(null, settings => {
    const actions = settings.BIND_SECTIONS.flatMap(section => section.actions.map(action => action.id));
    assert.equal(new Set(actions).size, actions.length);
    assert.deepEqual([...actions].sort(), Object.keys(settings.DEFAULT_BINDS).sort());
    settings.setBind("lookUp", "ArrowUp");
    assert.equal(settings.getControlPreset(), "custom");
    settings.setPad("aerialSensitivity", 1.8);
    settings.setCamera("height", 90);
    settings.resetControlBindings();
    assert.equal(settings.getControlPreset(), "default");
    assert.equal(settings.getPad().aerialSensitivity, 1.8);
    assert.equal(settings.getCamera().height, 90);
  }, "binding-presets");
});

test("controller sensitivity and dodge settings load, clamp and reject malformed values", async () => {
  await withSettings(JSON.stringify({ pad: { steeringSensitivity: 1.8, aerialSensitivity: 1.8, dodgeDeadzone: 0.96 } }), settings => {
    assert.equal(settings.getPad().steeringSensitivity, 1.8);
    assert.equal(settings.getPad().aerialSensitivity, 1.8);
    assert.equal(settings.getPad().dodgeDeadzone, 0.96);
    settings.setPad("steeringSensitivity", 99);
    assert.equal(settings.getPad().steeringSensitivity, 10);
    settings.setPad("aerialSensitivity", NaN);
    assert.equal(settings.getPad().aerialSensitivity, 1.8);
    settings.setPad("dodgeDeadzone", -1);
    assert.equal(settings.getPad().dodgeDeadzone, 0.1);
  }, "control-sliders");
});

test("camera presets apply exact values without modifying controls", async () => {
  await withSettings(null, settings => {
    const binds = { ...settings.getBinds() };
    const pad = { ...settings.getPad() };
    for (const preset of CAMERA_PRESETS) {
      settings.applyCameraPreset(preset.camera);
      for (const [key, value] of Object.entries(preset.camera)) assert.equal(settings.getCamera()[key], value);
      assert.equal(matchingCameraPreset(settings.getCamera()), preset.id);
    }
    settings.setCamera("height", 145);
    assert.equal(matchingCameraPreset(settings.getCamera()), "custom");
    assert.deepEqual(settings.getBinds(), binds);
    assert.deepEqual(settings.getPad(), pad);
  }, "presets");
});

async function withSettings(raw, run, suffix) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => key.endsWith("-v9") ? raw : null,
    setItem() { throw new Error("storage unavailable"); },
  };
  try {
    const settings = await import(`../../src/shared/settings.js?${suffix}`);
    await run(settings);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test("recorded zero controller deadzone survives loading and saving", async () => {
  await withSettings(JSON.stringify({ pad: { deadzone: 0 } }), settings => {
    assert.equal(settings.getPad().deadzone, 0);
    settings.setPad("deadzone", 0.2);
    settings.setPad("deadzone", 0);
    assert.equal(settings.getPad().deadzone, 0);
  }, "zero-deadzone");
});

test("settings reject malformed values and preserve explicitly cleared binds", async () => {
  await withSettings(JSON.stringify({
    binds: { steerLeft: "", steerRight: 2, airRoll: "", yawLeft: "KeyJ" },
    pad: { pitchAxis: 9, yawAxis: null, lookXAxis: -1, lookYAxis: "2", airRoll: null, invertPitch: "yes", deadzone: 9 },
    camera: { fov: 999, distance: "bad", ballCamMode: "bad", shake: "yes" },
  }), settings => {
    assert.equal(settings.getBind("steerLeft"), "");
    assert.equal(settings.getBind("airRoll"), "");
    assert.equal(settings.getBind("steerRight"), settings.DEFAULT_BINDS.steerRight);
    const pad = settings.getPad();
    for (const key of ["pitchAxis", "yawAxis", "lookXAxis", "lookYAxis", "invertPitch"]) {
      assert.equal(pad[key], settings.DEFAULT_PAD[key]);
    }
    assert.equal(pad.airRoll, null);
    assert.equal(pad.deadzone, 0.5);
    assert.equal(settings.getCamera().fov, 110);
    assert.equal(settings.getCamera().distance, settings.DEFAULT_CAMERA.distance);
    assert.equal(settings.getCamera().ballCamMode, "toggle");
    let notified = false;
    const unsubscribe = settings.onBindsChange(() => { notified = true; });
    assert.doesNotThrow(() => settings.setBind("boost", "KeyB"));
    assert.equal(settings.getBind("boost"), "KeyB");
    assert.equal(notified, true);
    unsubscribe();
  }, "malformed");
});

test("invalid JSON and array settings retain usable defaults", async () => {
  for (const [index, raw] of ["{bad", "[]", "null"].entries()) {
    await withSettings(raw, settings => {
      assert.deepEqual(settings.getPad(), settings.DEFAULT_PAD);
      assert.deepEqual(settings.getCamera(), settings.DEFAULT_CAMERA);
    }, `invalid-${index}`);
  }
});

test("Free Play bindings share gameplay buttons without replacing driving binds", async () => {
  await withSettings(null, settings => {
    settings.setPad("defendShot", settings.getPad().airRollLeft);
    assert.equal(settings.getPad().airRollLeft, 4);
    assert.equal(settings.getPad().defendShot, 4);
    settings.setBind("takePossession", "KeyW");
    assert.equal(settings.getBind("throttle"), "KeyW");
    assert.equal(settings.getBind("pitchDown"), "KeyW");
    settings.setBind("startDribble", "KeyW");
    assert.equal(settings.getBind("takePossession"), "");
    assert.equal(settings.getBind("throttle"), "KeyW");
  }, "ball-control-sharing");
});