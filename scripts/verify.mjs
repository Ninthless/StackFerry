import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cargoManifest = join(root, "src-tauri", "Cargo.toml");
const scopeNames = new Set(["frontend", "rust", "announcements", "all"]);
const scopeArgument = process.argv.find((argument) =>
  argument.startsWith("--scope="),
);
const requestedScope = scopeArgument?.slice(8) ?? "all";
const full =
  process.argv.includes("--full") ||
  scopeArgument === "--scope=rust" ||
  scopeArgument === "--scope=all";

if (!scopeNames.has(requestedScope)) {
  throw new Error(`Unsupported verification scope: ${requestedScope}`);
}

const node = process.execPath;
const pnpm = "pnpm";
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";

function run(label, command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    console.log(`\n==> ${label}`);
    const windowsPnpm = process.platform === "win32" && command === pnpm;
    const executable = windowsPnpm ? process.env.ComSpec : command;
    const executableArgs = windowsPnpm
      ? ["/d", "/s", "/c", ["pnpm", ...args].join(" ")]
      : args;
    const child = spawn(executable, executableArgs, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(
          new Error(
            `${label} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
          ),
        );
      }
    });
  });
}

const frontendChecks = [
  ["Architecture boundaries", node, ["scripts/validate-architecture.mjs"]],
  ["IPC inventory contract", node, ["scripts/validate-ipc-contract.mjs"]],
  [
    "Node script tests",
    node,
    [
      "--test",
      "scripts/dev.node.mjs",
      "scripts/generate-updater-manifest.node.mjs",
      "scripts/build-fast.node.mjs",
      "scripts/verify-bundle-marker.node.mjs",
      "scripts/validate-architecture.node.mjs",
      "scripts/validate-announcements.node.mjs",
      "scripts/validate-ipc-contract.node.mjs",
    ],
  ],
  ["Announcement contract", node, ["scripts/validate-announcements.mjs"]],
  ["TypeScript", pnpm, ["typecheck"]],
  ["Frontend formatting", pnpm, ["format:check"]],
  [
    "Vitest",
    pnpm,
    ["exec", "vitest", "run", "--maxWorkers=1", "--minWorkers=1"],
  ],
  ["Renderer build", pnpm, ["build:renderer"]],
];

const rustChecks = [
  [
    "Rust formatting",
    cargo,
    ["fmt", "--manifest-path", cargoManifest, "--all", "--", "--check"],
  ],
  [
    "Rust clippy",
    cargo,
    [
      "clippy",
      "--locked",
      "--all-targets",
      "--manifest-path",
      cargoManifest,
      "--",
      "-D",
      "warnings",
    ],
  ],
  ["Rust tests", cargo, ["test", "--locked", "--manifest-path", cargoManifest]],
];

async function main() {
  if (requestedScope === "announcements") {
    await run("Announcement contract", node, [
      "scripts/validate-announcements.mjs",
    ]);
    await run("Announcement tests", node, [
      "--test",
      "scripts/validate-announcements.node.mjs",
    ]);
  } else if (requestedScope !== "rust") {
    for (const check of frontendChecks) {
      await run(...check);
    }
  }
  if (requestedScope === "rust" || (requestedScope === "all" && full)) {
    mkdirSync(join(root, "dist"), { recursive: true });
    for (const check of rustChecks) {
      await run(...check);
    }
  }
  console.log(
    `\nVerification passed: ${requestedScope}${full ? " full" : " standard"}`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
