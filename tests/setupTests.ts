import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ELECTRON_MIGRATE_DISMISSED_KEY } from "@/lib/electronMigrate";
import { server } from "./msw/server";
import { resetProviderState } from "./msw/state";
import "./msw/tauriMocks";

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "warn" });
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    resources: {
      zh: { translation: {} },
      en: { translation: {} },
    },
    interpolation: {
      escapeValue: false,
    },
  });
});

beforeEach(() => {
  // The migrate dialog is a top-layer modal. Leave it dismissed unless a test
  // explicitly clears this key, or App integration queries cannot see the shell.
  window.localStorage.setItem(ELECTRON_MIGRATE_DISMISSED_KEY, "1");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetProviderState();
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});
