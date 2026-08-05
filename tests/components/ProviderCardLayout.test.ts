import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PROVIDER_CARD_TSX = path.resolve(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "providers",
  "ProviderCard.tsx",
);
const USAGE_FOOTER_TSX = path.resolve(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "UsageFooter.tsx",
);

describe("ProviderCard layout", () => {
  const source = fs.readFileSync(PROVIDER_CARD_TSX, "utf8");

  it("lets website links use available card width before truncating", () => {
    expect(source).not.toContain("max-w-[280px]");
    expect(source).toContain("flex min-w-0 flex-1 items-center gap-2");
    expect(source).toContain("min-w-0 flex-1 space-y-1");
    expect(source).toContain(
      "inline-flex max-w-full items-center overflow-hidden text-left text-sm",
    );
  });

  it("adapts its action layout to the card width", () => {
    expect(source).toContain("provider-card group");
    expect(source).toContain("provider-card-body");
    expect(source).toContain("provider-card-controls");
    expect(source).not.toContain("2xl:flex-row");
    expect(source).not.toContain("2xl:border-t-0");
  });

  it("uses semantic monochrome status styles", () => {
    expect(source).toContain('t("provider.currentlyUsing")');
    expect(source).toContain('t("provider.inConfig")');
    expect(source).not.toContain("bg-slate-");
    expect(source).not.toContain("text-gray-");
  });

  it("owns one usage query and passes its state to the footer", () => {
    const usageFooterSource = fs.readFileSync(USAGE_FOOTER_TSX, "utf8");

    expect(source.match(/useUsageQuery\(/g)).toHaveLength(1);
    expect(usageFooterSource).not.toContain("useUsageQuery");
    expect(source).toContain("lastQueriedAt={usageLastQueriedAt}");
    expect(source).toContain("onRefresh={refetchUsage}");
  });
});
