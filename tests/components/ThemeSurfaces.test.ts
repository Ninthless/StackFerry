import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  fs.readFileSync(path.resolve(__dirname, "..", "..", ...segments), "utf8");

const themeCss = readSource("src", "index.css");
const auditedSurfaces = [
  readSource("src", "features", "usage", "UsageScriptModal.tsx"),
  readSource("src", "features", "proxy", "AutoFailoverConfigPanel.tsx"),
  readSource("src", "features", "usage", "RequestDetailPanel.tsx"),
  readSource("src", "features", "usage", "ModelStatsTable.tsx"),
  readSource("src", "features", "usage", "ProviderStatsTable.tsx"),
  readSource("src", "features", "usage", "RequestLogTable.tsx"),
].join("\n");

describe("theme surfaces", () => {
  it("defines a light sidebar palette separately from the dark palette", () => {
    expect(themeCss).toContain("--sidebar: 0 0% 97%");
    expect(themeCss).toContain("--sidebar-foreground: 0 0% 13%");
    expect(themeCss).toContain("--sidebar-active: 0 0% 90%");
    expect(themeCss).toContain("--sidebar: 0 0% 3%");
    expect(themeCss).toContain("--sidebar-foreground: 0 0% 88%");
  });

  it("uses semantic colors on surfaces shared by both themes", () => {
    expect(auditedSurfaces).not.toContain("border-white/10");
    expect(auditedSurfaces).not.toContain("bg-black/20");
    expect(auditedSurfaces).not.toContain("bg-gray-100");
    expect(auditedSurfaces).toContain("border-border");
    expect(auditedSurfaces).toContain("bg-muted");
  });
});
