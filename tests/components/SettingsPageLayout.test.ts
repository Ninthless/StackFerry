import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "..",
    "..",
    "src",
    "components",
    "settings",
    "SettingsPage.tsx",
  ),
  "utf8",
);

describe("SettingsPage layout", () => {
  it("uses one horizontal settings navigation", () => {
    expect(source).toContain("grid-cols-6");
    expect(source).toContain('t("settings.tabUsage")');
    expect(source).not.toContain("w-44 shrink-0 flex-col");
    expect(source).not.toContain("max-[1100px]:sr-only");
  });

  it("aligns navigation, content, and save controls to one content width", () => {
    expect(source.match(/max-w-\[960px\]/g)).toHaveLength(3);
  });
});
