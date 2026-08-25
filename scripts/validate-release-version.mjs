import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJsonVersion(relativePath) {
  const path = join(projectRoot, relativePath);
  const document = JSON.parse(readFileSync(path, "utf8"));
  if (typeof document.version !== "string") {
    fail(`${relativePath} does not contain a string version`);
  }
  return document.version;
}

function readCargoLockVersion() {
  const relativePath = "src-tauri/Cargo.lock";
  const content = readFileSync(join(projectRoot, relativePath), "utf8");
  const packages = content.split(/\r?\n\[\[package\]\]\r?\n/);
  for (const packageBlock of packages) {
    const name = packageBlock.match(/^name = "([^"]+)"$/m)?.[1];
    if (name !== "stackferry") {
      continue;
    }
    const version = packageBlock.match(/^version = "([^"]+)"$/m)?.[1];
    if (!version) {
      fail(`${relativePath} StackFerry package does not contain a version`);
    }
    return version;
  }
  fail(`${relativePath} does not contain the StackFerry package`);
}

if (!tag?.startsWith("v")) {
  fail(`Release tag must start with v, received ${tag ?? "no tag"}`);
}

const releaseVersion = tag.slice(1);
if (!semverPattern.test(releaseVersion)) {
  fail(`Release tag ${tag} is not a valid SemVer tag`);
}

const cargoManifest = join(projectRoot, "src-tauri", "Cargo.toml");
const cargoMetadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--format-version",
      "1",
      "--no-deps",
      "--manifest-path",
      cargoManifest,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  ),
);
const cargoPackage = cargoMetadata.packages.find(
  (candidate) => resolve(candidate.manifest_path) === resolve(cargoManifest),
);

if (!cargoPackage) {
  fail("Cargo metadata did not contain the StackFerry package");
}

const versions = {
  "package.json": readJsonVersion("package.json"),
  "src-tauri/tauri.conf.json": readJsonVersion("src-tauri/tauri.conf.json"),
  "src-tauri/Cargo.toml": cargoPackage.version,
  "src-tauri/Cargo.lock": readCargoLockVersion(),
};
const mismatches = Object.entries(versions).filter(
  ([, version]) => version !== releaseVersion,
);

if (mismatches.length > 0) {
  const details = mismatches
    .map(([source, version]) => `  ${source}: ${version}`)
    .join("\n");
  fail(`Release tag ${tag} does not match project versions:\n${details}`);
}

console.log(
  `Release version ${releaseVersion} is consistent across the project`,
);
