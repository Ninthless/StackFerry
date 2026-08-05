import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const bundleMarkers = {
  appimage: "__TAURI_BUNDLE_TYPE_VAR_APP",
  deb: "__TAURI_BUNDLE_TYPE_VAR_DEB",
  rpm: "__TAURI_BUNDLE_TYPE_VAR_RPM",
  unknown: "__TAURI_BUNDLE_TYPE_VAR_UNK",
};

export async function verifyBundleMarker(binaryPath, bundleType) {
  const expectedMarker = bundleMarkers[bundleType];
  if (!expectedMarker || bundleType === "unknown") {
    throw new Error(
      `Unsupported bundle type ${bundleType}; expected appimage, deb, or rpm`,
    );
  }

  const binary = await readFile(binaryPath);
  if (binary.includes(Buffer.from(expectedMarker))) {
    return;
  }

  const actualType = Object.entries(bundleMarkers).find(([, marker]) =>
    binary.includes(Buffer.from(marker)),
  )?.[0];
  const actualDescription = actualType
    ? `found ${actualType} marker instead`
    : "no Tauri bundle marker was found";

  throw new Error(
    `${binaryPath} is not marked as ${bundleType}: ${actualDescription}`,
  );
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const [, , binaryPath, bundleType] = process.argv;
  if (!binaryPath || !bundleType) {
    console.error(
      "Usage: node scripts/verify-bundle-marker.mjs <binary> <appimage|deb|rpm>",
    );
    process.exit(1);
  }

  try {
    await verifyBundleMarker(binaryPath, bundleType.toLowerCase());
    console.log(`${binaryPath} contains the ${bundleType} bundle marker`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
