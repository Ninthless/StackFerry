import { copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = join(root, "scripts", "hooks", "pre-push");
const destination = join(root, ".git", "hooks", "pre-push");

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
chmodSync(destination, 0o755);
console.log("Installed .git/hooks/pre-push");
