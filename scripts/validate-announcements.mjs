import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "announcements", "announcements.json");
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const idPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;
const platforms = new Set(["windows", "macos", "linux"]);
const channels = new Set(["stable", "prerelease"]);
const categories = new Set(["release", "maintenance", "security", "service"]);
const severities = new Set(["info", "important", "critical"]);
const actionTypes = new Set(["update", "external"]);

function fail(message) {
  throw new Error(message);
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value;
}

function text(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    fail(`${field} exceeds ${maxLength} characters`);
  }
}

function timestamp(value, field, nullable = false) {
  if (nullable && value === null) return;
  text(value, field, 64);
  if (!Number.isFinite(Date.parse(value))) {
    fail(`${field} must be an RFC 3339 timestamp`);
  }
}

function version(value, field) {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !semverPattern.test(value)) {
    fail(`${field} must be a valid SemVer`);
  }
}

function uniqueEnumList(value, field, allowed) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${field} must be a non-empty array`);
  }
  if (new Set(value).size !== value.length) {
    fail(`${field} must contain unique values`);
  }
  for (const item of value) {
    if (!allowed.has(item)) fail(`${field} contains unsupported value ${item}`);
  }
}

export function validateAnnouncements(document, byteLength = 0) {
  object(document, "document");
  if (byteLength > 262_144) fail("announcement manifest exceeds 256 KiB");
  if (document.schemaVersion !== 1) fail("schemaVersion must be 1");
  timestamp(document.generatedAt, "generatedAt");
  if (!Array.isArray(document.announcements)) {
    fail("announcements must be an array");
  }
  if (document.announcements.length > 50) {
    fail("announcements must not contain more than 50 entries");
  }

  const ids = new Set();
  for (const [index, value] of document.announcements.entries()) {
    const prefix = `announcements[${index}]`;
    const announcement = object(value, prefix);
    text(announcement.id, `${prefix}.id`, 80);
    if (!idPattern.test(announcement.id)) fail(`${prefix}.id is invalid`);
    if (ids.has(announcement.id))
      fail(`duplicate announcement id ${announcement.id}`);
    ids.add(announcement.id);
    if (!categories.has(announcement.category)) {
      fail(`${prefix}.category is invalid`);
    }
    if (!severities.has(announcement.severity)) {
      fail(`${prefix}.severity is invalid`);
    }
    timestamp(announcement.publishedAt, `${prefix}.publishedAt`);
    timestamp(announcement.expiresAt, `${prefix}.expiresAt`, true);
    version(announcement.minAppVersion, `${prefix}.minAppVersion`);
    version(announcement.maxAppVersion, `${prefix}.maxAppVersion`);
    version(announcement.relatedVersion, `${prefix}.relatedVersion`);
    uniqueEnumList(announcement.platforms, `${prefix}.platforms`, platforms);
    uniqueEnumList(announcement.channels, `${prefix}.channels`, channels);

    const locales = object(announcement.locales, `${prefix}.locales`);
    for (const required of ["zh", "en"]) {
      if (!locales[required]) fail(`${prefix}.locales.${required} is required`);
    }
    for (const [locale, localizedValue] of Object.entries(locales)) {
      const localized = object(localizedValue, `${prefix}.locales.${locale}`);
      text(localized.title, `${prefix}.locales.${locale}.title`, 120);
      text(localized.summary, `${prefix}.locales.${locale}.summary`, 280);
      text(localized.body, `${prefix}.locales.${locale}.body`, 16_384);
      if (/<\/?[a-z][^>]*>/i.test(localized.body)) {
        fail(`${prefix}.locales.${locale}.body must not contain HTML`);
      }
    }

    const actions = announcement.actions ?? [];
    if (!Array.isArray(actions) || actions.length > 3) {
      fail(`${prefix}.actions must contain at most 3 entries`);
    }
    for (const [actionIndex, actionValue] of actions.entries()) {
      const actionPrefix = `${prefix}.actions[${actionIndex}]`;
      const action = object(actionValue, actionPrefix);
      if (!actionTypes.has(action.type))
        fail(`${actionPrefix}.type is invalid`);
      if (action.type === "external") {
        text(action.url, `${actionPrefix}.url`, 2_048);
        if (!action.url.startsWith("https://")) {
          fail(`${actionPrefix}.url must use HTTPS`);
        }
      } else if (action.url !== undefined) {
        fail(`${actionPrefix}.url is not allowed for update actions`);
      }
      const labels = object(action.label, `${actionPrefix}.label`);
      if (Object.keys(labels).length === 0) {
        fail(`${actionPrefix}.label must not be empty`);
      }
      for (const [locale, label] of Object.entries(labels)) {
        text(label, `${actionPrefix}.label.${locale}`, 80);
      }
    }
  }

  return document;
}

async function main() {
  const source = await readFile(manifestPath);
  const document = JSON.parse(source.toString("utf8"));
  validateAnnouncements(document, source.byteLength);
  console.log(`Validated ${document.announcements.length} announcement(s)`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
