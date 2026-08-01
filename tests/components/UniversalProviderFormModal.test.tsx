import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UniversalProviderFormModal } from "@/components/universal/UniversalProviderFormModal";
import { APP_ICON_MAP, APP_IDS } from "@/config/appConfig";

describe("UniversalProviderFormModal", () => {
  it("configures every supported application from one form", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <UniversalProviderFormModal isOpen onClose={vi.fn()} onSave={onSave} />,
    );

    for (const appId of APP_IDS) {
      expect(
        screen.getAllByText(APP_ICON_MAP[appId].label).length,
      ).toBeGreaterThan(0);
    }

    fireEvent.change(document.querySelector("#baseUrl") as HTMLInputElement, {
      target: { value: "https://gateway.example.com" },
    });
    fireEvent.change(document.querySelector("#apiKey") as HTMLInputElement, {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const provider = onSave.mock.calls[0][0];
    expect(provider.baseUrl).toBe("https://gateway.example.com");
    expect(provider.apps).toEqual(
      Object.fromEntries(APP_IDS.map((appId) => [appId, true])),
    );
    expect(Object.keys(provider.models)).toEqual(
      expect.arrayContaining(APP_IDS),
    );
  });

  it("shows field-level validation without disabling submit", async () => {
    const onSave = vi.fn();

    render(
      <UniversalProviderFormModal isOpen onClose={vi.fn()} onSave={onSave} />,
    );

    const submit = screen.getByRole("button", { name: "添加" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(await screen.findByText("API 地址不能为空。")).toBeInTheDocument();
    expect(await screen.findByText("API Key 不能为空。")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
