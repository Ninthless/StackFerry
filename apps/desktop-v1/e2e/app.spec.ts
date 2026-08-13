import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

test("launches the secure shell and loads the MCP workspace", async () => {
  const application = await electron.launch({
    args: [path.resolve("out", "main", "index.js")],
    env: {
      ...process.env,
      STACKFERRY_TEST_HOME: path.resolve(".test-home"),
    },
  });
  try {
    const window = await application.firstWindow();
    await window.setViewportSize({ width: 760, height: 600 });
    await expect(
      window.getByRole("heading", { name: "本地 Agent 控制台" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(window.getByText("StackFerry 1.0", { exact: false })).toBeVisible({
      timeout: 10000,
    });
    await expect(window.getByText("v1.0.0")).toBeVisible();
    await expect(window.getByText("Agent 健康")).toBeVisible();
    expect(await window.evaluate(() => globalThis.location.protocol)).toBe(
      "stackferry:",
    );
    expect(
      await window.evaluate(() => ({
        require: "require" in window,
        process: "process" in window,
      })),
    ).toEqual({ require: false, process: false });
  } finally {
    await application.close();
  }
});

test("navigates the control plane without overlapping at minimum size", async () => {
  const application = await electron.launch({
    args: [path.resolve("out", "main", "index.js")],
    env: {
      ...process.env,
      STACKFERRY_TEST_HOME: path.resolve(".test-home"),
    },
  });
  try {
    const window = await application.firstWindow();
    await window.setViewportSize({ width: 760, height: 600 });
    await window.getByRole("button", { name: "切换导航" }).click();
    await window.getByText("Prompts", { exact: true }).click();
    await expect(window.getByRole("heading", { name: "Prompts" })).toBeVisible();
    await window.getByRole("button", { name: "切换导航" }).click();
    await window.getByText("Provider 路由", { exact: true }).click();
    await expect(
      window.getByRole("heading", { name: "Provider 路由" }),
    ).toBeVisible();
    await window.getByRole("button", { name: "切换导航" }).click();
    await window.getByText("系统", { exact: true }).click();
    await expect(window.getByRole("heading", { name: "系统" })).toBeVisible();
    const overflow = await window.evaluate(() => ({
      horizontal:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      vertical:
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight,
    }));
    expect(overflow).toEqual({ horizontal: false, vertical: false });
  } finally {
    await application.close();
  }
});
