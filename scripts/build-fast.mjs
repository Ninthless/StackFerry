#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");

const bundleByPlatform = {
  win32: "msi",
  darwin: "dmg",
  linux: "appimage",
};

export function buildFastBundleArgs(platform) {
  const bundle = bundleByPlatform[platform];

  if (!bundle) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return [
    "tauri",
    "build",
    "--bundles",
    bundle,
    "--",
    "--profile",
    "fast-release",
  ];
}

export function runFastBundle(platform = process.platform, root = projectRoot) {
  const pnpm = platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpm, buildFastBundleArgs(platform), {
    cwd: root,
    stdio: "inherit",
  });

  child.once("error", (error) => {
    console.error(`[bundle:fast] Failed to start Tauri: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runFastBundle();
}
