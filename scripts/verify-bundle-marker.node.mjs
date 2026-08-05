import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyBundleMarker } from "./verify-bundle-marker.mjs";

async function fixture(marker) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "stackferry-bundle-marker-"),
  );
  const binaryPath = path.join(directory, "stackferry");
  await writeFile(binaryPath, Buffer.from(`binary:${marker}:contents`));
  return { binaryPath, directory };
}

test("accepts a binary marked for the expected bundle type", async () => {
  const { binaryPath, directory } = await fixture(
    "__TAURI_BUNDLE_TYPE_VAR_DEB",
  );
  try {
    await verifyBundleMarker(binaryPath, "deb");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects the unknown marker left by an incompatible bundler", async () => {
  const { binaryPath, directory } = await fixture(
    "__TAURI_BUNDLE_TYPE_VAR_UNK",
  );
  try {
    await assert.rejects(
      verifyBundleMarker(binaryPath, "deb"),
      /not marked as deb: found unknown marker instead/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a marker for a different Linux package type", async () => {
  const { binaryPath, directory } = await fixture(
    "__TAURI_BUNDLE_TYPE_VAR_RPM",
  );
  try {
    await assert.rejects(
      verifyBundleMarker(binaryPath, "deb"),
      /not marked as deb: found rpm marker instead/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
