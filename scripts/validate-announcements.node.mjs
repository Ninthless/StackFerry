import assert from "node:assert/strict";
import test from "node:test";
import { validateAnnouncements } from "./validate-announcements.mjs";

function fixture() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-12T00:00:00Z",
    announcements: [
      {
        id: "2026-08-test-release",
        category: "release",
        severity: "important",
        publishedAt: "2026-08-12T00:00:00Z",
        expiresAt: null,
        minAppVersion: "0.1.17",
        maxAppVersion: null,
        platforms: ["windows", "macos", "linux"],
        channels: ["stable"],
        relatedVersion: "0.1.18",
        locales: {
          zh: { title: "标题", summary: "摘要", body: "正文" },
          en: { title: "Title", summary: "Summary", body: "Body" },
        },
        actions: [
          {
            type: "external",
            url: "https://github.com/Ninthless/StackFerry",
            label: { zh: "查看", en: "View" },
          },
        ],
      },
    ],
  };
}

test("accepts a valid announcement manifest", () => {
  assert.equal(validateAnnouncements(fixture()).announcements.length, 1);
});

test("rejects duplicate announcement ids", () => {
  const document = fixture();
  document.announcements.push(structuredClone(document.announcements[0]));
  assert.throws(
    () => validateAnnouncements(document),
    /duplicate announcement id/,
  );
});

test("rejects unsafe action URLs and HTML bodies", () => {
  const unsafeUrl = fixture();
  unsafeUrl.announcements[0].actions[0].url = "http://example.com";
  assert.throws(() => validateAnnouncements(unsafeUrl), /must use HTTPS/);

  const unsafeBody = fixture();
  unsafeBody.announcements[0].locales.en.body = "<script>alert(1)</script>";
  assert.throws(
    () => validateAnnouncements(unsafeBody),
    /must not contain HTML/,
  );
});

test("rejects invalid version filters and missing required locales", () => {
  const invalidVersion = fixture();
  invalidVersion.announcements[0].minAppVersion = "latest";
  assert.throws(() => validateAnnouncements(invalidVersion), /valid SemVer/);

  const missingLocale = fixture();
  delete missingLocale.announcements[0].locales.zh;
  assert.throws(
    () => validateAnnouncements(missingLocale),
    /locales.zh is required/,
  );
});
