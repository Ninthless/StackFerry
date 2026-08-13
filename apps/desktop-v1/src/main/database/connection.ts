import Database from "better-sqlite3";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import {
  currentDatabaseVersion,
  migrations,
  verifyMigration,
} from "./migrations";

export interface DatabaseOptions {
  backupDirectory?: string;
}

export class DatabaseConnection {
  readonly database: Database.Database;
  private readonly databasePath: string;
  private readonly backupDirectory: string;

  constructor(databasePath: string, options: DatabaseOptions = {}) {
    this.databasePath = databasePath;
    this.backupDirectory =
      options.backupDirectory ?? path.join(path.dirname(databasePath), "backups");
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.applyMigrations();
  }

  backup(): string | null {
    if (this.databasePath === ":memory:" || !existsSync(this.databasePath)) {
      return null;
    }
    mkdirSync(this.backupDirectory, { recursive: true });
    const backupPath = path.join(
      this.backupDirectory,
      `stackferry-${new Date().toISOString().replaceAll(":", "-")}.db`,
    );
    this.database.pragma("wal_checkpoint(TRUNCATE)");
    copyFileSync(this.databasePath, backupPath);
    return backupPath;
  }

  close(): void {
    this.database.close();
  }

  private applyMigrations(): void {
    const current = this.database.pragma("user_version", { simple: true }) as number;
    if (current > currentDatabaseVersion) {
      throw new Error(
        `Database version ${current} is newer than supported version ${currentDatabaseVersion}`,
      );
    }
    for (const migration of migrations) {
      if (migration.version <= current) {
        continue;
      }
      verifyMigration(migration);
      const transaction = this.database.transaction(() => {
        this.database.exec(migration.sql);
        this.database.pragma(`user_version = ${migration.version}`);
      });
      transaction();
    }
  }
}

export function restoreDatabaseBackup(
  databasePath: string,
  backupPath: string,
): void {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    const result = backup.pragma("integrity_check", { simple: true });
    if (result !== "ok") {
      throw new Error(`Backup failed integrity check: ${String(result)}`);
    }
  } finally {
    backup.close();
  }
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const stagingPath = `${databasePath}.restore`;
  copyFileSync(backupPath, stagingPath);
  rmSync(databasePath, { force: true });
  renameSync(stagingPath, databasePath);
}
