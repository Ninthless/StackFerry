import assert from "node:assert/strict";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateUpdaterManifest } from "./generate-updater-manifest.mjs";

const TAG = "v1.2.3";
const ASSETS = [
  `StackFerry-${TAG}-macOS.tar.gz`,
  `StackFerry-${TAG}-Windows.msi`,
  `StackFerry-${TAG}-Windows-arm64.msi`,
  `StackFerry-${TAG}-Linux-x86_64.AppImage`,
  `StackFerry-${TAG}-Linux-x86_64.deb`,
  `StackFerry-${TAG}-Linux-x86_64.rpm`,
  `StackFerry-${TAG}-Linux-arm64.AppImage`,
  `StackFerry-${TAG}-Linux-arm64.deb`,
  `StackFerry-${TAG}-Linux-arm64.rpm`,
];

async function fixture() {
  const assetsDir = await mkdtemp(
    path.join(os.tmpdir(), "stackferry-updater-"),
  );
  for (const file of ASSETS) {
    await writeFile(path.join(assetsDir, file), `artifact:${file}`);
    await writeFile(path.join(assetsDir, `${file}.sig`), `signature:${file}`);
  }
  return assetsDir;
}

const options = (assetsDir) => ({
  assetsDir,
  tag: TAG,
  repository: "Ninthless/StackFerry",
  publishedAt: "2026-08-04T00:00:00Z",
});

test("maps each installer type to its matching signed artifact", async () => {
  const assetsDir = await fixture();
  try {
    const manifest = await generateUpdaterManifest(options(assetsDir));

    assert.equal(manifest.version, "1.2.3");
    assert.equal(Object.keys(manifest.platforms).length, 16);
    assert.match(manifest.platforms["linux-x86_64-deb"].url, /x86_64\.deb$/);
    assert.match(manifest.platforms["linux-x86_64-rpm"].url, /x86_64\.rpm$/);
    assert.match(
      manifest.platforms["linux-aarch64-appimage"].url,
      /arm64\.AppImage$/,
    );
    assert.match(manifest.platforms["windows-aarch64-msi"].url, /arm64\.msi$/);
    assert.equal(
      manifest.platforms["linux-x86_64"].url,
      manifest.platforms["linux-x86_64-appimage"].url,
    );
    assert.equal(
      manifest.platforms["windows-x86_64"].url,
      manifest.platforms["windows-x86_64-msi"].url,
    );
    assert.equal(
      manifest.platforms["linux-x86_64-deb"].signature,
      `signature:StackFerry-${TAG}-Linux-x86_64.deb`,
    );
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("fails instead of publishing an installer without its signature", async () => {
  const assetsDir = await fixture();
  try {
    await unlink(
      path.join(assetsDir, `StackFerry-${TAG}-Linux-x86_64.deb.sig`),
    );
    await assert.rejects(
      generateUpdaterManifest(options(assetsDir)),
      /Missing updater signature: .*x86_64\.deb\.sig/,
    );
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("fails instead of publishing an incomplete platform matrix", async () => {
  const assetsDir = await fixture();
  try {
    await unlink(path.join(assetsDir, `StackFerry-${TAG}-Windows-arm64.msi`));
    await assert.rejects(
      generateUpdaterManifest(options(assetsDir)),
      /Missing updater artifact: .*Windows-arm64\.msi/,
    );
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});
