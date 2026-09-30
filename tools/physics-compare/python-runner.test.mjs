import test from "node:test";
import assert from "node:assert/strict";
import { resolvePython } from "../python-runner.mjs";

test("an invalid explicit Python override never silently falls back", () => {
  assert.throws(() => resolvePython({ env: { ...process.env, PYTHON: "nonexistent-python-reference-interpreter" } }), { code: "PYTHON_INVALID_OVERRIDE" });
  assert.throws(() => resolvePython({ env: { ...process.env, PYTHON: "" } }), { code: "PYTHON_INVALID_OVERRIDE" });
});