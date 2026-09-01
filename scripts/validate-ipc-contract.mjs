import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const inventoryPath = join(projectRoot, "scripts", "ipc-inventory.json");

function walk(directory, extensions) {
  const paths = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      paths.push(...walk(path, extensions));
    } else if (extensions.has(extname(path))) {
      paths.push(path);
    }
  }
  return paths;
}

function commandDeclarations() {
  const sourceDir = join(projectRoot, "src-tauri", "src");
  const declarations = new Map();
  const pattern =
    /#\[tauri::command(?:\([^\]]*\))?\]\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/g;
  for (const path of walk(sourceDir, new Set([".rs"]))) {
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(pattern)) {
      declarations.set(match[1], relative(projectRoot, path));
    }
  }
  return declarations;
}

function registeredCommands() {
  const sourceRoot = join(projectRoot, "src-tauri", "src");
  const registryPaths = walk(sourceRoot, new Set([".rs"]));
  let block;
  for (const path of registryPaths) {
    const content = readFileSync(path, "utf8");
    block =
      content.match(
        /\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/,
      )?.[1] ??
      content.match(
        /tauri::generate_handler!\[([\s\S]*?)\]/,
      )?.[1];
    if (block) {
      break;
    }
  }
  if (!block) {
    throw new Error("Unable to locate the Tauri generate_handler registry");
  }
  return new Set(
    [
      ...block.matchAll(
        /(?:commands::(?:[A-Za-z0-9_]+::)*)?([A-Za-z][A-Za-z0-9_]*)\s*,/g,
      ),
    ].map((match) => match[1]),
  );
}

function frontendInvocations() {
  const srcDir = join(projectRoot, "src");
  const invocations = new Map();
  const pattern = /\binvoke(?:<[^>]+>)?\(\s*["']([^"']+)["']/g;
  for (const path of walk(srcDir, new Set([".ts", ".tsx"]))) {
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(pattern)) {
      const paths = invocations.get(match[1]) ?? [];
      paths.push(relative(projectRoot, path));
      invocations.set(match[1], paths);
    }
  }
  return invocations;
}

export function validateIpcContract() {
  const declarations = commandDeclarations();
  const registrations = registeredCommands();
  const invocations = frontendInvocations();
  const unregistered = [...declarations.keys()].filter(
    (command) => !registrations.has(command),
  );
  const pluginCommands = new Set(["plugin:app|version"]);
  const missingBackend = [...invocations.keys()].filter(
    (command) => !pluginCommands.has(command) && !registrations.has(command),
  );
  if (unregistered.length || missingBackend.length) {
    const lines = [];
    for (const command of unregistered) {
      lines.push(
        `Unregistered Tauri command ${command} (${declarations.get(command)})`,
      );
    }
    for (const command of missingBackend) {
      lines.push(
        `Frontend invoke has no registered backend command ${command} (${invocations.get(command).join(", ")})`,
      );
    }
    throw new Error(lines.join("\n"));
  }
  const inventory = {
    declarations: [...declarations.keys()].sort(),
    registrations: [...registrations].sort(),
    frontendInvocations: [...invocations.keys()].sort(),
  };
  const expected = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const changes = [];
  for (const key of Object.keys(inventory)) {
    const expectedValues = new Set(expected[key] ?? []);
    const actualValues = new Set(inventory[key]);
    for (const value of actualValues) {
      if (!expectedValues.has(value)) {
        changes.push(`${key} added ${value}`);
      }
    }
    for (const value of expectedValues) {
      if (!actualValues.has(value)) {
        changes.push(`${key} removed ${value}`);
      }
    }
  }
  if (changes.length > 0) {
    throw new Error(
      `IPC inventory changed:\n${changes.join("\n")}\nRun \`pnpm ipc:update\` only for an intentional, reviewed IPC contract change.`,
    );
  }
  return inventory;
}

export function writeIpcInventory() {
  const declarations = commandDeclarations();
  const registrations = registeredCommands();
  const invocations = frontendInvocations();
  const inventory = {
    declarations: [...declarations.keys()].sort(),
    registrations: [...registrations].sort(),
    frontendInvocations: [...invocations.keys()].sort(),
  };
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const update = process.argv.includes("--write");
  const result = update ? writeIpcInventory() : validateIpcContract();
  console.log(
    `IPC contract ${update ? "updated" : "valid"}: ${result.declarations.length} declarations, ${result.registrations.length} registrations, ${result.frontendInvocations.length} frontend invocations`,
  );
}
