import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import ja from "@/i18n/locales/ja.json";
import zhTW from "@/i18n/locales/zh-TW.json";
import zh from "@/i18n/locales/zh.json";

const locales = { en, ja, "zh-TW": zhTW, zh };

describe("shell translations", () => {
  it.each(Object.entries(locales))(
    "%s defines the complete shell vocabulary",
    (_name, locale) => {
      expect(Object.keys(locale.shell).sort()).toEqual([
        "applications",
        "directMode",
        "navigation",
        "routeWorkbench",
        "routingActive",
        "switchApplication",
        "workspace",
      ]);
      expect(locale.provider.title).toBeTruthy();
      expect(locale.provider.moreActions).toBeTruthy();
      expect(locale.settings.description).toBeTruthy();
      expect(locale.settings.tabUsage).toBeTruthy();
    },
  );
});
