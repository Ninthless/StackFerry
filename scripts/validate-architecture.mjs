import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = join(root, "scripts", "architecture-baseline.json");
const fileSizeBaselinePath = join(
  root,
  "scripts",
  "file-size-baseline.json",
);
const sourceFileExtensions = new Set([".js", ".jsx", ".mjs", ".rs", ".ts", ".tsx"]);
const fileSizeLimit = 800;

function normalize(path) {
  return path.split(sep).join("/");
}

function walk(directory, extensions) {
  if (!existsSync(directory)) {
    return [];
  }
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

function count(items) {
  return Object.fromEntries(
    [
      ...items
        .reduce((entries, item) => {
          entries.set(item, (entries.get(item) ?? 0) + 1);
          return entries;
        }, new Map())
        .entries(),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function frontendTarget(source, specifier) {
  if (specifier.startsWith("@/")) {
    return specifier.slice(2);
  }
  if (specifier.startsWith(".")) {
    return normalize(resolve(dirname(source), specifier));
  }
  return null;
}

function frontendImportViolations(projectRoot) {
  const sourceRoot = join(projectRoot, "src");
  const violations = [];
  const importPattern =
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

  for (const path of walk(sourceRoot, new Set([".ts", ".tsx"]))) {
    const source = normalize(relative(sourceRoot, path));
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(importPattern)) {
      const target = frontendTarget(path, match[1]);
      if (!target) {
        continue;
      }
      const targetRelative = match[1].startsWith("@/")
        ? target
        : normalize(relative(sourceRoot, target));
      const sourceParts = source.split("/");
      const targetParts = targetRelative.split("/");
      if (
        sourceParts[0] === "shared" &&
        ["app", "features"].includes(targetParts[0])
      ) {
        violations.push(`shared-to-upper: ${source} -> ${targetRelative}`);
      }
      if (sourceParts[0] === "features" && targetParts[0] === "app") {
        violations.push(`features-to-app: ${source} -> ${targetRelative}`);
      }
      if (
        sourceParts[0] === "features" &&
        targetParts[0] === "features" &&
        sourceParts[1] !== targetParts[1] &&
        targetParts.length > 2
      ) {
        violations.push(
          `cross-feature-deep-import: ${source} -> ${targetRelative}`,
        );
      }
    }
    const isQueryOrConfig =
      /(^|\/)(query|config)(\/|$)/.test(source) ||
      /(^|\/)(queries|query|config)\.[^.]+$/.test(source);
    if (
      isQueryOrConfig &&
      /(?:from\s+|import\s*)["']react(?:\/[^"']*)?["']/.test(content)
    ) {
      violations.push(`query-config-react: ${source} -> react`);
    }
  }
  return count(violations);
}

function frontendDirectIpc(projectRoot) {
  const sourceRoot = join(projectRoot, "src");
  const violations = [];
  const invokePattern = /\binvoke(?:<[^>]+>)?\(\s*["']([^"']+)["']/g;
  const tauriImportPattern =
    /(?:from\s+|import\s*)["'](@tauri-apps\/(?:api|plugin-[^"']+)[^"']*)["']/g;

  for (const path of walk(sourceRoot, new Set([".ts", ".tsx"]))) {
    const source = normalize(relative(projectRoot, path));
    if (
      source.startsWith("src/platform/tauri/") ||
      /\.test\.tsx?$/.test(source)
    ) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(invokePattern)) {
      violations.push(`${source} -> ${match[1]}`);
    }
    for (const match of content.matchAll(tauriImportPattern)) {
      violations.push(`${source} -> ${match[1]}`);
    }
  }
  return count(violations);
}

function rustBoundaryViolations(projectRoot) {
  const rustRoot = join(projectRoot, "src-tauri", "src");
  const violations = [];
  const dependencyPattern = /\bcrate::([a-zA-Z0-9_]+)/g;
  const externalPattern = /\b(?:tauri|rusqlite|keyring)::/g;

  for (const path of walk(rustRoot, new Set([".rs"]))) {
    const source = normalize(relative(rustRoot, path));
    const sourceRoot = source.split("/")[0].replace(/\.rs$/, "");
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(dependencyPattern)) {
      const target = match[1];
      if (
        sourceRoot === "proxy" &&
        ["commands", "ipc"].includes(target)
      ) {
        violations.push(`proxy-to-interface: ${source} -> ${target}`);
      }
      if (
        ["database", "infrastructure"].includes(sourceRoot) &&
        ["services", "application"].includes(target)
      ) {
        violations.push(`persistence-to-application: ${source} -> ${target}`);
      }
    }
    if (sourceRoot === "domain") {
      for (const match of content.matchAll(externalPattern)) {
        violations.push(`domain-to-framework: ${source} -> ${match[0].slice(0, -2)}`);
      }
    }
  }
  return count(violations);
}

function effectiveLineCount(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
}

export function fileSizeInventory(projectRoot = root) {
  const oversized = {};
  for (const sourceRoot of [
    join(projectRoot, "src"),
    join(projectRoot, "src-tauri", "src"),
  ]) {
    for (const path of walk(sourceRoot, sourceFileExtensions)) {
      const lines = effectiveLineCount(path);
      if (lines > fileSizeLimit) {
        oversized[normalize(relative(projectRoot, path))] = lines;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(oversized).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export function architectureInventory(projectRoot = root) {
  return {
    frontendDirectIpc: frontendDirectIpc(projectRoot),
    frontendImportViolations: frontendImportViolations(projectRoot),
    rustBoundaryViolations: rustBoundaryViolations(projectRoot),
  };
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function mergeBaselines(expected, actual) {
  const merged = structuredClone(expected);
  for (const [group, entries] of Object.entries(actual)) {
    merged[group] ??= {};
    for (const [key, value] of Object.entries(entries)) {
      merged[group][key] = Math.max(merged[group][key] ?? 0, value);
    }
  }
  return merged;
}

export function mergeFileSizeBaseline(expected, actual) {
  const allowlist = { ...(expected.allowlist ?? {}) };
  for (const [path, lines] of Object.entries(actual)) {
    allowlist[path] = Math.max(allowlist[path] ?? 0, lines);
  }
  return { limit: fileSizeLimit, allowlist };
}

export function validateArchitecture({
  projectRoot = root,
  architectureBaseline = parseJson(baselinePath),
  fileSizeBaseline = parseJson(fileSizeBaselinePath),
} = {}) {
  const actual = architectureInventory(projectRoot);
  const regressions = [];
  for (const [group, entries] of Object.entries(actual)) {
    const expectedEntries = architectureBaseline[group] ?? {};
    for (const [violation, occurrences] of Object.entries(entries)) {
      const allowance = expectedEntries[violation] ?? 0;
      if (occurrences > allowance) {
        regressions.push(
          `${group}: ${violation} (${occurrences}, baseline ${allowance})`,
        );
      }
    }
  }
  const actualFileSizes = fileSizeInventory(projectRoot);
  for (const [path, lines] of Object.entries(actualFileSizes)) {
    const allowance = fileSizeBaseline.allowlist?.[path];
    if (allowance === undefined) {
      regressions.push(
        `fileSizeViolations: ${path} (${lines} lines, limit ${fileSizeLimit})`,
      );
    } else if (lines > allowance) {
      regressions.push(
        `fileSizeViolations: ${path} (${lines} lines, baseline ${allowance})`,
      );
    }
  }
  if (regressions.length > 0) {
    throw new Error(
      `Architecture boundary regressions detected:\n${regressions.join("\n")}\nRun \`pnpm architecture:update\` only for an intentional, reviewed boundary change.`,
    );
  }
  return { ...actual, fileSizeViolations: actualFileSizes };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const inventory = architectureInventory();
  const fileSizes = fileSizeInventory();
  if (process.argv.includes("--write")) {
    const architectureBaseline = mergeBaselines(
      parseJson(baselinePath),
      inventory,
    );
    const fileSizeBaseline = mergeFileSizeBaseline(
      existsSync(fileSizeBaselinePath)
        ? parseJson(fileSizeBaselinePath)
        : { limit: fileSizeLimit, allowlist: {} },
      fileSizes,
    );
    writeFileSync(
      baselinePath,
      `${JSON.stringify(architectureBaseline, null, 2)}\n`,
    );
    writeFileSync(
      fileSizeBaselinePath,
      `${JSON.stringify(fileSizeBaseline, null, 2)}\n`,
    );
    console.log("Updated architecture and file-size baselines additively");
  } else {
    validateArchitecture();
    const total = Object.values(inventory).reduce(
      (sum, group) =>
        sum +
        Object.values(group).reduce((groupSum, value) => groupSum + value, 0),
      0,
    );
    console.log(
      `Architecture boundaries valid: ${total} boundary and ${Object.keys(fileSizes).length} file-size exception(s)`,
    );
  }
}
