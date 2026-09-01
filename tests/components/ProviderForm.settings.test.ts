import { describe, expect, it } from "vitest";
import { serializeGeminiSettingsForSave } from "@/features/providers/forms/ProviderForm";

describe("ProviderForm settings serialization", () => {
  it("serializes the current Gemini API key", () => {
    const settings = JSON.parse(
      serializeGeminiSettingsForSave(
        { GEMINI_API_KEY: "new-key" },
        '{"theme":"dark"}',
      ),
    );

    expect(settings).toEqual({
      env: { GEMINI_API_KEY: "new-key" },
      config: { theme: "dark" },
    });
  });

  it("rejects invalid and non-object Gemini config JSON", () => {
    expect(() => serializeGeminiSettingsForSave({}, "{")).toThrow();
    expect(() => serializeGeminiSettingsForSave({}, "[]")).toThrow(
      "Config must be a JSON object",
    );
  });
});
