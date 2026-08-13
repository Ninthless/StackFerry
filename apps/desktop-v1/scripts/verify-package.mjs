import { access } from "node:fs/promises";
import path from "node:path";

const platformDirectory = {
  win32: "win-unpacked",
  darwin: "mac",
  linux: "linux-unpacked",
}[process.platform];

if (!platformDirectory) {
  throw new Error(`Unsupported package verification platform: ${process.platform}`);
}

const releaseDirectory = path.resolve("release", platformDirectory);
const required = [
  releaseDirectory,
  path.join(releaseDirectory, "resources", "app.asar"),
];

for (const target of required) {
  await access(target);
}

console.info(`Verified packaged application at ${releaseDirectory}`);
