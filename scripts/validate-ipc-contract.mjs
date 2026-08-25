import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

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
  const content = readFileSync(
    join(projectRoot, "src-tauri", "src", "lib.rs"),
    "utf8",
  );
  const block = content.match(
    /\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/,
  )?.[1];
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
  return {
    declarations: declarations.size,
    registrations: registrations.size,
    invocations: invocations.size,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = validateIpcContract();
  console.log(
    `IPC contract valid: ${result.declarations} declarations, ${result.registrations} registrations, ${result.invocations} frontend invocations`,
  );
}
