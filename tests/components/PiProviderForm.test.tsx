import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PiProviderForm } from "@/features/providers/forms/PiProviderForm";
import { fetchModelsForConfig } from "@/platform/tauri/api/model-fetch";

vi.mock("@/platform/tauri/api/model-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("@/platform/tauri/api/model-fetch")
  >("@/platform/tauri/api/model-fetch");
  return {
    ...actual,
    fetchModelsForConfig: vi.fn(),
  };
});

vi.mock("@/shared/editor/JsonEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("PiProviderForm", () => {
  beforeEach(() => {
    vi.mocked(fetchModelsForConfig).mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("applies an Ollama preset and submits a complete Pi provider", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <PiProviderForm
        appId="pi"
        submitLabel="Add"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "providerPreset.showAll" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ollama" }));
    expect(
      screen.getByRole("combobox", { name: "pi.form.defaultModel" }),
    ).toHaveTextContent("Qwen 2.5 Coder 7B");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0];
    const config = JSON.parse(values.settingsConfig);
    expect(values.name).toBe("Ollama");
    expect(values.providerKey).toBe("ollama");
    expect(config.baseUrl).toBe("http://localhost:11434/v1");
    expect(config.api).toBe("openai-completions");
    expect(config.defaultModel).toBe("qwen2.5-coder:7b");
    expect(config.models).toHaveLength(2);
    expect(config.headers).toEqual({ "User-Agent": "StackFerry" });
  });

  it("submits Pi provider and model extensions without dropping them", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <PiProviderForm
        appId="pi"
        providerId="acme"
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: "Acme",
          settingsConfig: {
            baseUrl: "https://api.example.com/v1/",
            api: "openai-responses",
            apiKey: "secret",
            defaultModel: "model-a",
            providerExtension: "keep",
            headers: { "X-Tenant": "alpha" },
            models: [
              {
                id: "model-a",
                name: "Model A",
                reasoning: true,
                input: ["text", "image"],
                contextWindow: 128000,
                maxTokens: 32000,
                modelExtension: "keep",
              },
            ],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0];
    const config = JSON.parse(values.settingsConfig);
    expect(values.providerKey).toBe("acme");
    expect(config.baseUrl).toBe("https://api.example.com/v1");
    expect(config.providerExtension).toBe("keep");
    expect(config.headers).toEqual({
      "X-Tenant": "alpha",
      "User-Agent": "StackFerry",
    });
    expect(config.models[0].modelExtension).toBe("keep");
    expect(config.models[0].input).toEqual(["text", "image"]);
  });

  it("fetches and adds models without replacing configured entries", async () => {
    vi.mocked(fetchModelsForConfig).mockResolvedValue([
      { id: "model-a", ownedBy: "acme" },
      { id: "model-b", ownedBy: "acme" },
    ]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <PiProviderForm
        appId="pi"
        providerId="acme"
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: "Acme",
          settingsConfig: {
            baseUrl: "https://api.example.com/v1",
            api: "openai-responses",
            apiKey: "secret",
            defaultModel: "model-a",
            models: [
              {
                id: "model-a",
                reasoning: true,
                input: ["text", "image"],
              },
            ],
          },
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "providerForm.fetchModels" }),
    );
    fireEvent.click(await screen.findByText("model-b"));

    expect(screen.getByDisplayValue("model-b")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const config = JSON.parse(onSubmit.mock.calls[0][0].settingsConfig);
    expect(config.models.map((model: { id: string }) => model.id)).toEqual([
      "model-a",
      "model-b",
    ]);
    expect(config.models[0].reasoning).toBe(true);
    expect(config.models[0].input).toEqual(["text", "image"]);
  });

  it("fetches local models without authorization when auth headers are disabled", async () => {
    vi.mocked(fetchModelsForConfig).mockResolvedValue([
      { id: "local-model", ownedBy: null },
    ]);

    render(
      <PiProviderForm
        appId="pi"
        providerId="local"
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialData={{
          name: "Local",
          settingsConfig: {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "",
            authHeader: false,
            defaultModel: "placeholder",
            models: [{ id: "placeholder" }],
          },
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "providerForm.fetchModels" }),
    );

    await waitFor(() =>
      expect(fetchModelsForConfig).toHaveBeenCalledWith(
        "http://localhost:1234/v1",
        "",
        false,
        undefined,
        undefined,
        false,
      ),
    );
  });

  it("requires a credential placeholder before saving a keyless provider", () => {
    const onSubmit = vi.fn();

    render(
      <PiProviderForm
        appId="pi"
        providerId="local"
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        initialData={{
          name: "Local",
          settingsConfig: {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "",
            authHeader: false,
            defaultModel: "local-model",
            models: [{ id: "local-model" }],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
