import { createHash } from "node:crypto";

export interface DatabaseMigration {
  version: number;
  sql: string;
  sha256: string;
}

const initialSchema = `
CREATE TABLE agents (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  installed INTEGER NOT NULL DEFAULT 0,
  version TEXT,
  config_path TEXT,
  health TEXT NOT NULL,
  inspected_at TEXT NOT NULL
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  ownership TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE operations (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX assets_kind_name_idx ON assets(kind, name);
CREATE INDEX deployments_agent_created_idx ON deployments(agent_id, created_at);
CREATE INDEX operations_created_idx ON operations(created_at);
`;

const routingLogs = `
CREATE TABLE request_logs (
  request_id TEXT PRIMARY KEY NOT NULL,
  request_model TEXT NOT NULL,
  final_model TEXT NOT NULL,
  final_target_id TEXT,
  duration_ms REAL NOT NULL,
  ttft_ms REAL,
  status_code INTEGER NOT NULL,
  error_message TEXT,
  attempts TEXT NOT NULL,
  usage TEXT NOT NULL,
  thinking_source TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX request_logs_created_idx ON request_logs(created_at);
`;

export const migrations: readonly DatabaseMigration[] = [
  {
    version: 1,
    sql: initialSchema,
    sha256: "764b71f64984c60f38a81a0598af4fea5f2b8a14f706f12aadb7b05664cfaa12",
  },
  {
    version: 2,
    sql: routingLogs,
    sha256: "07e7ff832dcaef9a53accb1c69595e9a4d385ee92a7f8e78813058f568237cad",
  },
];

export const currentDatabaseVersion =
  migrations.at(-1)?.version ?? 0;

export function verifyMigration(migration: DatabaseMigration): void {
  const actual = createHash("sha256").update(migration.sql).digest("hex");
  if (actual !== migration.sha256) {
    throw new Error(
      `Database migration ${migration.version} failed integrity check: ${actual}`,
    );
  }
}
