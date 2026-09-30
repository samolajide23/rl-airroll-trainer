import test from "node:test";
import assert from "node:assert/strict";

test("malformed stored metrics are discarded while valid bounded history survives", async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => JSON.stringify({
      invalid: {},
      mixed: [null, [], { success: "yes" }, { success: true, touches: "2" }, { success: false, duration: -1 }, { success: true, label: 2 }, { success: false }],
      valid: Array.from({ length: 60 }, () => ({ success: true, touches: 2 })),
    }),
    setItem() {},
  };
  try {
    const metrics = await import("../../src/shared/metrics.js?malformed");
    assert.deepEqual(metrics.recentAttempts("invalid"), []);
    assert.deepEqual(metrics.recentAttempts("mixed"), [{ success: false }]);
    assert.equal(metrics.recentAttempts("valid", 100).length, 40);
    assert.doesNotThrow(() => metrics.recordAttempt("invalid", { success: true }));
    assert.doesNotThrow(() => metrics.recordAttempt("__proto__", { success: true }));
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("storage failures preserve in-memory attempts without interrupting drills", async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
  };
  try {
    const metrics = await import("../../src/shared/metrics.js");
    assert.doesNotThrow(() => metrics.recordAttempt("storage-test", { success: true }));
    assert.equal(metrics.recentAttempts("storage-test").length, 1);
    assert.equal(metrics.consistencyRate("storage-test"), 1);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});