import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  architectureInventory,
  fileSizeInventory,
  mergeBaselines,
  mergeFileSizeBaseline,
  validateArchitecture,
} from "./validate-architecture.mjs";

function fixture(files) {
  const projectRoot = mkdtempSync(join(tmpdir(), "stackferry-architecture-"));
  for (const [path, content] of Object.entries(files)) {
    const target = join(projectRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return projectRoot;
}

function emptyBaselines() {
  return {
    architectureBaseline: {},
    fileSizeBaseline: { limit: 800, allowlist: {} },
  };
}

test("detects frontend capability boundary violations", (context) => {
  const projectRoot = fixture({
    "src/shared/contracts/value.ts":
      'export { value } from "@/features/accounts/model/private";\n',
    "src/features/accounts/model/state.ts":
      'export { shell } from "@/app/shell/private";\n',
    "src/features/accounts/view.ts":
      'export { token } from "@/features/billing/model/private";\n',
    "src/features/accounts/query/index.ts":
      'import { useMemo } from "react";\nexport const query = useMemo;\n',
  });
  context.after(() => rmSync(projectRoot, { recursive: true, force: true }));

  const violations = architectureInventory(projectRoot).frontendImportViolations;

  assert.equal(
    violations[
      "shared-to-upper: shared/contracts/value.ts -> features/accounts/model/private"
    ],
    1,
  );
  assert.equal(
    violations[
      "features-to-app: features/accounts/model/state.ts -> app/shell/private"
    ],
    1,
  );
  assert.equal(
    violations[
      "cross-feature-deep-import: features/accounts/view.ts -> features/billing/model/private"
    ],
    1,
  );
  assert.equal(
    violations[
      "query-config-react: features/accounts/query/index.ts -> react"
    ],
    1,
  );
});

test("allows Tauri IPC only inside the platform adapter", (context) => {
  const projectRoot = fixture({
    "src/features/accounts/api.ts":
      'import { invoke } from "@tauri-apps/api/core";\ninvoke("load_accounts");\n',
    "src/platform/tauri/api/accounts.ts":
      'import { invoke } from "@tauri-apps/api/core";\ninvoke("load_accounts");\n',
  });
  context.after(() => rmSync(projectRoot, { recursive: true, force: true }));

  const violations = architectureInventory(projectRoot).frontendDirectIpc;

  assert.equal(
    violations["src/features/accounts/api.ts -> load_accounts"],
    1,
  );
  assert.equal(
    violations["src/features/accounts/api.ts -> @tauri-apps/api/core"],
    1,
  );
  assert.equal(Object.keys(violations).length, 2);
});

test("detects Rust capability direction violations", (context) => {
  const projectRoot = fixture({
    "src-tauri/src/proxy/server.rs": "use crate::commands::start;\n",
    "src-tauri/src/database/store.rs": "use crate::services::StoreService;\n",
    "src-tauri/src/infrastructure/cache.rs":
      "use crate::application::CacheService;\n",
    "src-tauri/src/domain/account.rs":
      "pub fn load(value: rusqlite::Value) -> tauri::Result<()> { keyring::Entry::new(\"a\", \"b\"); }\n",
  });
  context.after(() => rmSync(projectRoot, { recursive: true, force: true }));

  const violations = architectureInventory(projectRoot).rustBoundaryViolations;

  assert.equal(
    violations["proxy-to-interface: proxy/server.rs -> commands"],
    1,
  );
  assert.equal(
    violations[
      "persistence-to-application: database/store.rs -> services"
    ],
    1,
  );
  assert.equal(
    violations[
      "persistence-to-application: infrastructure/cache.rs -> application"
    ],
    1,
  );
  assert.equal(
    violations["domain-to-framework: domain/account.rs -> rusqlite"],
    1,
  );
  assert.equal(
    violations["domain-to-framework: domain/account.rs -> tauri"],
    1,
  );
  assert.equal(
    violations["domain-to-framework: domain/account.rs -> keyring"],
    1,
  );
});

test("rejects new oversized files and growth beyond an allowance", (context) => {
  const projectRoot = fixture({
    "src/features/accounts/large.ts": `${"export const value = 1;\n".repeat(801)}`,
  });
  context.after(() => rmSync(projectRoot, { recursive: true, force: true }));

  assert.equal(
    fileSizeInventory(projectRoot)["src/features/accounts/large.ts"],
    801,
  );
  assert.throws(
    () => validateArchitecture({ projectRoot, ...emptyBaselines() }),
    /fileSizeViolations: src\/features\/accounts\/large\.ts \(801 lines, limit 800\)/,
  );
  assert.doesNotThrow(() =>
    validateArchitecture({
      projectRoot,
      architectureBaseline: {},
      fileSizeBaseline: {
        limit: 800,
        allowlist: { "src/features/accounts/large.ts": 801 },
      },
    }),
  );
  assert.throws(
    () =>
      validateArchitecture({
        projectRoot,
        architectureBaseline: {},
        fileSizeBaseline: {
          limit: 800,
          allowlist: { "src/features/accounts/large.ts": 800 },
        },
      }),
    /baseline 800/,
  );
});

test("write merges new exceptions without deleting intentional baselines", () => {
  assert.deepEqual(
    mergeBaselines(
      { frontendDirectIpc: { "src/removed.ts -> legacy": 1 } },
      { frontendDirectIpc: { "src/new.ts -> current": 1 } },
    ),
    {
      frontendDirectIpc: {
        "src/removed.ts -> legacy": 1,
        "src/new.ts -> current": 1,
      },
    },
  );
  assert.deepEqual(
    mergeFileSizeBaseline(
      {
        limit: 800,
        allowlist: { "src/removed.ts": 900, "src/growing.ts": 850 },
      },
      { "src/growing.ts": 875, "src/new.ts": 801 },
    ),
    {
      limit: 800,
      allowlist: {
        "src/removed.ts": 900,
        "src/growing.ts": 875,
        "src/new.ts": 801,
      },
    },
  );
});
