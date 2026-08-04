import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UsageScriptModal from "@/components/UsageScriptModal";
import type { Provider } from "@/types";

const apiMocks = vi.hoisted(() => ({
  testScript: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  usageApi: {
    testScript: apiMocks.testScript,
  },
  settingsApi: {
    save: apiMocks.saveSettings,
  },
  subscriptionApi: {},
}));

vi.mock("@/lib/query", () => ({
  useSettingsQuery: () => ({ data: { usageConfirmed: true } }),
}));

vi.mock("@/hooks/useDarkMode", () => ({
  useDarkMode: () => false,
}));

vi.mock("@/components/JsonEditor", () => ({
  default: () => <div data-testid="json-editor" />,
}));

vi.mock("@/components/common/FullScreenPanel", () => ({
  FullScreenPanel: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    isOpen ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

const scriptCode = `({
  request: { url: "{{baseUrl}}/quota", method: "GET", headers: {} },
  extractor: function () { return { remaining: 1 }; }
})`;

const piProvider: Provider = {
  id: "pi-provider",
  name: "Pi Provider",
  settingsConfig: {
    baseUrl: "https://pi.example/v1/",
    apiKey: "!read-from-keyring",
  },
  meta: {
    usage_script: {
      enabled: true,
      language: "javascript",
      code: scriptCode,
      timeout: 5,
      templateType: "custom",
    },
  },
};

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsageScriptModal
        provider={piProvider}
        appId="pi"
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("UsageScriptModal Pi credentials", () => {
  it("keeps provider references unresolved in the UI and delegates fallback resolution", async () => {
    apiMocks.testScript.mockResolvedValueOnce({
      success: true,
      data: [{ remaining: 1, unit: "request" }],
    });
    renderModal();

    expect(screen.getByText("https://pi.example/v1")).toBeInTheDocument();
    expect(screen.queryByText("!read-from-keyring")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "usageScript.testScript" }),
    );

    await waitFor(() => expect(apiMocks.testScript).toHaveBeenCalledOnce());
    expect(apiMocks.testScript).toHaveBeenCalledWith(
      "pi-provider",
      "pi",
      scriptCode,
      5,
      undefined,
      undefined,
      undefined,
      undefined,
      "custom",
    );
  });
});
