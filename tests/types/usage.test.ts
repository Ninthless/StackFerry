import { describe, expect, it } from "vitest";
import { getFreshInputTokens, KNOWN_APP_TYPES } from "@/types/usage";

describe("Pi usage semantics", () => {
  it("surfaces Pi in application filters", () => {
    expect(KNOWN_APP_TYPES).toContain("pi");
  });

  it("normalizes fresh and total Pi protocols per request", () => {
    const base = {
      appType: "pi",
      inputTokens: 100,
      cacheReadTokens: 30,
      cacheCreationTokens: 10,
    };

    expect(getFreshInputTokens({ ...base, inputTokenSemantics: 2 })).toBe(100);
    expect(getFreshInputTokens({ ...base, inputTokenSemantics: 1 })).toBe(60);
    expect(getFreshInputTokens({ ...base, inputTokenSemantics: 0 })).toBe(100);
  });
});
