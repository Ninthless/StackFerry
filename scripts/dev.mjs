#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");

export function buildDevEnvironment(root, baseEnvironment = process.env) {
  const devRoot = join(root, ".stackferry-dev");
  const devHome = join(devRoot, "home");

  return {
    devRoot,
    devHome,
    environment: {
      ...baseEnvironment,
      STACKFERRY_TEST_HOME: devHome,
      CLAUDE_CONFIG_DIR: join(devHome, ".claude"),
      CODEX_HOME: join(devHome, ".codex"),
      CODEX_SQLITE_HOME: join(devHome, ".codex"),
      HERMES_HOME: join(devHome, ".hermes"),
      PI_CODING_AGENT_DIR: join(devHome, ".pi", "agent"),
      PI_CODING_AGENT_SESSION_DIR: join(devHome, ".pi", "agent", "sessions"),
      OPENCODE_DB: join(devHome, ".local", "share", "opencode", "opencode.db"),
      XDG_CONFIG_HOME: join(devHome, ".config"),
      XDG_DATA_HOME: join(devHome, ".local", "share"),
      XDG_CACHE_HOME: join(devHome, ".cache"),
    },
  };
}

export function runDev(root = projectRoot, baseEnvironment = process.env) {
  const { devHome, environment } = buildDevEnvironment(root, baseEnvironment);
  mkdirSync(devHome, { recursive: true });
  console.log(`[dev] Isolated data directory: ${devHome}`);

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    pnpm,
    ["tauri", "dev", "--config", "src-tauri/tauri.dev.conf.json"],
    {
      cwd: root,
      env: environment,
      stdio: "inherit",
    },
  );

  child.once("error", (error) => {
    console.error(`[dev] Failed to start Tauri: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runDev();
}
