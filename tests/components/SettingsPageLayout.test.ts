import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "..",
    "..",
    "src",
    "features",
    "settings",
    "SettingsPage.tsx",
  ),
  "utf8",
);
const proxySource = fs.readFileSync(
  path.resolve(
    __dirname,
    "..",
    "..",
    "src",
    "features",
    "settings",
    "ProxyTabContent.tsx",
  ),
  "utf8",
);

describe("SettingsPage layout", () => {
  it("uses one scrollable horizontal settings navigation", () => {
    expect(source).toContain('layout="scrollable"');
    expect(source).toContain('t("settings.tabUsage")');
    expect(source).toContain("settings-tab-trigger");
    expect(source.match(/title=\{t\(/g)).toHaveLength(6);
    expect(source).not.toContain("grid-cols-6");
    expect(source).not.toContain("w-44 shrink-0 flex-col");
    expect(source).not.toContain("max-[1100px]:sr-only");
    expect(source).not.toMatch(/\bmax-\[(?:900|1000|1100)px\]:/);
  });

  it("aligns navigation, content, and save controls to one content width", () => {
    expect(source.match(/max-w-\[960px\]/g)).toHaveLength(3);
  });

  it("uses the shared equal layout for proxy subtabs", () => {
    expect(proxySource).toContain('<TabsList layout="equal"');
    expect(proxySource).not.toContain("grid-cols-3");
  });
});
