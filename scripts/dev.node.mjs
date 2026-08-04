import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";

import { buildDevEnvironment } from "./dev.mjs";

test("development paths are isolated without replacing toolchain paths", () => {
  const root = resolve("fixture-project");
  const original = {
    HOME: "/real/home",
    CARGO_HOME: "/real/cargo",
    CODEX_HOME: "/real/codex",
    PI_CODING_AGENT_DIR: "/real/pi",
  };

  const { devRoot, devHome, environment } = buildDevEnvironment(root, original);

  assert.equal(devRoot, join(root, ".stackferry-dev"));
  assert.equal(devHome, join(devRoot, "home"));
  assert.equal(environment.HOME, original.HOME);
  assert.equal(environment.CARGO_HOME, original.CARGO_HOME);
  assert.equal(environment.STACKFERRY_TEST_HOME, devHome);
  assert.equal(environment.CODEX_HOME, join(devHome, ".codex"));
  assert.equal(environment.PI_CODING_AGENT_DIR, join(devHome, ".pi", "agent"));
  assert.equal(environment.XDG_DATA_HOME, join(devHome, ".local", "share"));
});
