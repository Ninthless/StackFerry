import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

function validateInputs({ tag, repository, publishedAt }) {
  if (!/^v[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
  if (!/^[0-9A-Za-z_.-]+\/[0-9A-Za-z_.-]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new Error(`Invalid publication date: ${publishedAt}`);
  }
}

function releaseAssets(tag) {
  return [
    {
      file: `StackFerry-${tag}-macOS.tar.gz`,
      platforms: [
        "darwin-x86_64-app",
        "darwin-x86_64",
        "darwin-aarch64-app",
        "darwin-aarch64",
      ],
    },
    {
      file: `StackFerry-${tag}-Windows.msi`,
      platforms: ["windows-x86_64-msi", "windows-x86_64"],
    },
    {
      file: `StackFerry-${tag}-Windows-arm64.msi`,
      platforms: ["windows-aarch64-msi", "windows-aarch64"],
    },
    {
      file: `StackFerry-${tag}-Linux-x86_64.AppImage`,
      platforms: ["linux-x86_64-appimage", "linux-x86_64"],
    },
    {
      file: `StackFerry-${tag}-Linux-x86_64.deb`,
      platforms: ["linux-x86_64-deb"],
    },
    {
      file: `StackFerry-${tag}-Linux-x86_64.rpm`,
      platforms: ["linux-x86_64-rpm"],
    },
    {
      file: `StackFerry-${tag}-Linux-arm64.AppImage`,
      platforms: ["linux-aarch64-appimage", "linux-aarch64"],
    },
    {
      file: `StackFerry-${tag}-Linux-arm64.deb`,
      platforms: ["linux-aarch64-deb"],
    },
    {
      file: `StackFerry-${tag}-Linux-arm64.rpm`,
      platforms: ["linux-aarch64-rpm"],
    },
  ];
}

async function readSignedAsset(assetsDir, file) {
  const artifactPath = path.join(assetsDir, file);
  const signaturePath = `${artifactPath}.sig`;

  try {
    await readFile(artifactPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Missing updater artifact: ${file}`);
    }
    throw error;
  }

  let signature;
  try {
    signature = (await readFile(signaturePath, "utf8")).trim();
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Missing updater signature: ${file}.sig`);
    }
    throw error;
  }

  if (!signature) {
    throw new Error(`Updater signature is empty: ${file}.sig`);
  }
  return signature;
}

export async function generateUpdaterManifest({
  assetsDir,
  tag,
  repository,
  publishedAt,
  notes = `StackFerry ${tag} release. See the GitHub Release page for the bilingual notes.`,
}) {
  validateInputs({ tag, repository, publishedAt });

  const platforms = {};
  const baseUrl = `https://github.com/${repository}/releases/download/${tag}`;
  for (const asset of releaseAssets(tag)) {
    const signature = await readSignedAsset(assetsDir, asset.file);
    const entry = {
      signature,
      url: `${baseUrl}/${asset.file}`,
    };
    for (const platform of asset.platforms) {
      platforms[platform] = entry;
    }
  }

  return {
    version: tag.slice(1),
    notes,
    pub_date: publishedAt,
    platforms,
  };
}

export async function writeUpdaterManifest(options) {
  const manifest = await generateUpdaterManifest(options);
  const outputPath = path.join(options.assetsDir, "latest.json");
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "assets-dir": { type: "string" },
      tag: { type: "string" },
      repository: { type: "string" },
      "published-at": { type: "string" },
    },
  });

  for (const key of ["assets-dir", "tag", "repository", "published-at"]) {
    if (!values[key]) {
      throw new Error(`Missing required option: --${key}`);
    }
  }

  const outputPath = await writeUpdaterManifest({
    assetsDir: values["assets-dir"],
    tag: values.tag,
    repository: values.repository,
    publishedAt: values["published-at"],
  });
  console.log(`Updater manifest written to ${outputPath}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
