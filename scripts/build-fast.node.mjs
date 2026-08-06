import assert from "node:assert/strict";
import test from "node:test";

import { buildFastBundleArgs } from "./build-fast.mjs";

const expectedSuffix = ["--", "--profile", "fast-release"];

test("builds a Windows MSI without invoking a package script", () => {
  assert.deepEqual(buildFastBundleArgs("win32"), [
    "tauri",
    "build",
    "--bundles",
    "msi",
    ...expectedSuffix,
  ]);
});

test("builds a macOS DMG", () => {
  assert.deepEqual(buildFastBundleArgs("darwin"), [
    "tauri",
    "build",
    "--bundles",
    "dmg",
    ...expectedSuffix,
  ]);
});

test("builds a Linux AppImage", () => {
  assert.deepEqual(buildFastBundleArgs("linux"), [
    "tauri",
    "build",
    "--bundles",
    "appimage",
    ...expectedSuffix,
  ]);
});

test("rejects unsupported platforms", () => {
  assert.throws(
    () => buildFastBundleArgs("freebsd"),
    /Unsupported platform: freebsd/,
  );
});
