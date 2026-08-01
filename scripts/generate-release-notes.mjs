import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const currentRef = process.env.GITHUB_REF_NAME;
const repository = process.env.GITHUB_REPOSITORY ?? "Ninthless/StackFerry";
const notesPath = process.env.RELEASE_NOTES_PATH ?? "RELEASE.md";
const changelogPath = process.env.RELEASE_CHANGELOG_PATH;

if (!currentRef) {
  throw new Error("GITHUB_REF_NAME is required");
}

const runGit = (args, options = {}) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    ...options,
  }).trim();

const tags = runGit([
  "for-each-ref",
  "--sort=-creatordate",
  "--format=%(refname:strip=2)",
  "refs/tags",
])
  .split("\n")
  .filter((tag) => tag.startsWith("v"));

const previousTag = tags.find((tag) => {
  if (tag === currentRef) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", tag, currentRef], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
});

const range = previousTag ? `${previousTag}..${currentRef}` : currentRef;
const commitLines = runGit([
  "log",
  "--reverse",
  "--format=%H%x09%h%x09%s%x09%an",
  range,
])
  .split("\n")
  .filter(Boolean);

const commits = commitLines.map((line) => {
  const [sha, shortSha, subject, author] = line.split("\t");
  return { sha, shortSha, subject, author };
});

const contributors = new Map();
for (const commit of commits) {
  if (!contributors.has(commit.author))
    contributors.set(commit.author, commit.author);
}

let githubContributors = [];
if (previousTag) {
  try {
    const output = execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        `repos/${repository}/compare/${previousTag}...${currentRef}`,
        "--jq",
        ".commits[] | select(.author.login != null) | .author.login",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    githubContributors = [...new Set(output.split("\n").filter(Boolean))];
  } catch {
    githubContributors = [];
  }
}

const body = readFileSync(notesPath, "utf8").trim();
const downloadSection = `## Downloads

- **macOS**: \`StackFerry-${currentRef}-macOS.dmg\` or \`StackFerry-${currentRef}-macOS.zip\`
- **Windows (x86_64)**: \`StackFerry-${currentRef}-Windows.msi\` or \`StackFerry-${currentRef}-Windows-Portable.zip\`
- **Windows (ARM64)**: \`StackFerry-${currentRef}-Windows-arm64.msi\` or \`StackFerry-${currentRef}-Windows-arm64-Portable.zip\`
- **Linux (x86_64)**: \`StackFerry-${currentRef}-Linux-x86_64.AppImage\`, \`.deb\`, or \`.rpm\`
- **Linux (ARM64)**: \`StackFerry-${currentRef}-Linux-arm64.AppImage\`, \`.deb\`, or \`.rpm\`

macOS builds use Ad-hoc signing without Apple notarization. The first launch may require approval in System Settings. In-app updates continue to verify the StackFerry updater signature.`;

const commitLinesForRelease =
  commits.length > 0
    ? commits.map(
        ({ sha, shortSha, subject }) =>
          `- [\`${shortSha}\`](https://github.com/${repository}/commit/${sha}) ${subject}`,
      )
    : ["No commits found for this release."];

const contributorNames =
  githubContributors.length > 0
    ? githubContributors.map((login) => `@${login}`)
    : [...contributors.keys()];
const contributorSection = `## Contributors

${contributorNames.length > 0 ? contributorNames.map((name) => `- ${name}`).join("\n") : "- None listed"}`;
const changelogAssetName = `StackFerry-${currentRef}-changelog.md`;
const changelogUrl = `https://github.com/${repository}/releases/download/${currentRef}/${changelogAssetName}`;
const fullCommitSection = `## Changes since ${previousTag ?? "the beginning"}\n\n${commitLinesForRelease.join("\n")}`;
const fullChangelog = `${body}\n\n${downloadSection}\n\n${fullCommitSection}\n\n${contributorSection}\n`;
if (changelogPath) writeFileSync(changelogPath, fullChangelog);

const maxBodyLength = 60000;
const fixedBody = `${body}\n\n${downloadSection}\n\n## Complete changelog\n\n[Download the complete commit changelog](${changelogUrl}).\n\n${contributorSection}`;
const availableCommitLength = maxBodyLength - fixedBody.length - 120;
const visibleCommitLines = [];
let visibleCommitLength = 0;
for (const line of commitLinesForRelease) {
  if (visibleCommitLength + line.length + 1 > availableCommitLength) break;
  visibleCommitLines.push(line);
  visibleCommitLength += line.length + 1;
}
const omittedCommitCount =
  commitLinesForRelease.length - visibleCommitLines.length;
const visibleCommitSection = `## Changes since ${previousTag ?? "the beginning"}\n\n${visibleCommitLines.join("\n")}${omittedCommitCount > 0 ? `\n\n_${omittedCommitCount} additional commits are included in the complete changelog attachment._` : ""}`;

process.stdout.write(
  `${body}\n\n${downloadSection}\n\n${visibleCommitSection}\n\n## Complete changelog\n\n[Download the complete commit changelog](${changelogUrl}).\n\n${contributorSection}\n`,
);
