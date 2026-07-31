import { describe, expect, it } from "vitest";
import { parseCodexAuthObject } from "@/components/providers/forms/hooks/useCodexConfigState";

describe("parseCodexAuthObject", () => {
  it("accepts empty and object auth configurations", () => {
    expect(parseCodexAuthObject("")).toEqual({});
    expect(parseCodexAuthObject('{"OPENAI_API_KEY":"sk-test"}')).toEqual({
      OPENAI_API_KEY: "sk-test",
    });
  });

  it("rejects invalid JSON and non-object values", () => {
    expect(() => parseCodexAuthObject("{")).toThrow();
    expect(() => parseCodexAuthObject("[]")).toThrow(
      "Auth JSON must be an object",
    );
    expect(() => parseCodexAuthObject('"sk-test"')).toThrow(
      "Auth JSON must be an object",
    );
  });
});
