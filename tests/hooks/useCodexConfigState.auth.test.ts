import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  parseCodexAuthObject,
  useCodexConfigState,
} from "@/components/providers/forms/hooks/useCodexConfigState";

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

describe("useCodexConfigState", () => {
  it("uses a manually edited TOML bearer token as the canonical saved API key", () => {
    const initialData = {
      settingsConfig: {
        auth: {
          OPENAI_API_KEY: "old-key",
        },
        config:
          'model_provider = "custom"\n[model_providers.custom]\nexperimental_bearer_token = "old-key"\n',
      },
    };
    const { result } = renderHook(() =>
      useCodexConfigState({
        initialData,
      }),
    );

    act(() => {
      result.current.handleCodexConfigChange(
        'model_provider = "custom"\n[model_providers.custom]\nexperimental_bearer_token = "new-key"\n',
      );
    });

    expect(JSON.parse(result.current.codexAuth).OPENAI_API_KEY).toBe("new-key");
    expect(result.current.codexApiKey).toBe("new-key");
  });
});
