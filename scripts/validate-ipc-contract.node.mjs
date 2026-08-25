import assert from "node:assert/strict";
import test from "node:test";

import { validateIpcContract } from "./validate-ipc-contract.mjs";

test("frontend invokes resolve to registered Tauri commands", () => {
  const result = validateIpcContract();
  assert.ok(result.declarations > 0);
  assert.ok(result.registrations > 0);
  assert.ok(result.invocations > 0);
});
