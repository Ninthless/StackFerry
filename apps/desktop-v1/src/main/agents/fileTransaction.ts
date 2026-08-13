import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  AdapterChangePlan,
  AdapterContext,
  AppliedChange,
  PlannedFileChange,
  ProjectTrust,
} from "./types";

export function hashSource(source: string | Buffer): string {
  return createHash("sha256").update(source).digest("hex");
}

export async function createProjectTrust(
  projectRoot: string,
): Promise<ProjectTrust> {
  const canonicalRoot = await realpath(projectRoot);
  return {
    projectRoot: path.resolve(projectRoot),
    canonicalRoot,
    grantedAt: new Date().toISOString(),
  };
}

export async function assertTrustedPath(
  targetPath: string,
  context: AdapterContext,
): Promise<void> {
  if (context.scope !== "project") {
    return;
  }
  if (!context.projectRoot || !context.trust) {
    throw new Error("Project configuration requires explicit trust");
  }
  const canonicalRoot = await realpath(context.projectRoot);
  if (
    path.resolve(context.trust.projectRoot) !== path.resolve(context.projectRoot) ||
    context.trust.canonicalRoot !== canonicalRoot
  ) {
    throw new Error("Project trust no longer matches the selected project");
  }
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(canonicalRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Project configuration path escapes the trusted project");
  }
  let current = canonicalRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const currentStat = await lstat(current).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      },
    );
    if (!currentStat) {
      break;
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error("Project configuration cannot contain a symbolic link");
    }
  }
}

export async function applyFilePlan(
  plan: AdapterChangePlan,
): Promise<AppliedChange> {
  const backups: AppliedChange["backups"] = [];
  try {
    for (const change of plan.changes) {
      const current = await readFile(change.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return Buffer.from("");
        }
        throw error;
      });
      if (hashSource(current) !== change.beforeHash) {
        throw new Error(`Configuration changed after preview: ${change.path}`);
      }
      const fileStat = await stat(change.path).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") {
            return null;
          }
          throw error;
        },
      );
      const backupPath = `${change.path}.stackferry-${randomUUID()}.bak`;
      const stagingPath = `${change.path}.stackferry-${randomUUID()}.tmp`;
      await mkdir(path.dirname(change.path), { recursive: true });
      if (fileStat) {
        await copyFile(change.path, backupPath);
      }
      backups.push({
        path: change.path,
        backupPath: fileStat ? backupPath : null,
      });
      await writeFile(stagingPath, change.after, {
        mode: fileStat?.mode ?? 0o600,
      });
      await rename(stagingPath, change.path);
    }
    return { plan, backups };
  } catch (error) {
    await rollbackFiles(backups);
    throw error;
  }
}

export async function verifyFilePlan(applied: AppliedChange): Promise<void> {
  for (const change of applied.plan.changes) {
    const current = await readFile(change.path);
    if (hashSource(current) !== hashSource(change.after)) {
      throw new Error(`Configuration verification failed: ${change.path}`);
    }
  }
}

export async function rollbackFilePlan(applied: AppliedChange): Promise<void> {
  await rollbackFiles(applied.backups);
}

export async function removeBackups(applied: AppliedChange): Promise<void> {
  await Promise.all(
    applied.backups.flatMap(({ backupPath }) =>
      backupPath ? [rm(backupPath)] : [],
    ),
  );
}

export function createPlan(
  agentId: AdapterChangePlan["agentId"],
  changes: PlannedFileChange[],
): AdapterChangePlan {
  return {
    agentId,
    createdAt: new Date().toISOString(),
    changes,
  };
}

async function rollbackFiles(
  backups: AppliedChange["backups"],
): Promise<void> {
  for (const { path: targetPath, backupPath } of [...backups].reverse()) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rm(targetPath, { force: true });
    if (backupPath) {
      await rename(backupPath, targetPath);
    }
  }
}
