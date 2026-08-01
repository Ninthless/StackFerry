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
const commitLines = runGit(["log", "--format=%H%x09%h%x09%s%x09%an", range])
  .split("\n")
  .filter(Boolean);

const commits = commitLines.map((line) => {
  const [sha, shortSha, subject, author] = line.split("\t");
  return { sha, shortSha, subject, author, githubLogin: "" };
});

const githubAuthorsBySha = new Map();
if (previousTag) {
  try {
    const output = execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        `repos/${repository}/compare/${previousTag}...${currentRef}`,
        "--jq",
        '.commits[] | [.sha, (.author.login // "")] | @tsv',
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const line of output.split("\n").filter(Boolean)) {
      const [sha, login] = line.split("\t");
      if (sha && login) githubAuthorsBySha.set(sha, login);
    }
  } catch {
    githubAuthorsBySha.clear();
  }
}

for (const commit of commits) {
  commit.githubLogin = githubAuthorsBySha.get(commit.sha) ?? "";
}

const contributorEntries = [];
const contributorKeys = new Set();
for (const commit of commits) {
  const value = commit.githubLogin || commit.author;
  const key = value.toLocaleLowerCase();
  if (!value || contributorKeys.has(key)) continue;
  contributorKeys.add(key);
  contributorEntries.push({
    value,
    isGithubLogin: Boolean(commit.githubLogin),
  });
}

const formatCommit = ({ sha, shortSha, subject, author, githubLogin }) => {
  const commitLink = `https://github.com/${repository}/commit/${sha}`;
  const authorLabel = githubLogin ? `@${githubLogin}` : author;
  return `- ${subject}（[${shortSha}](${commitLink})） ${authorLabel}`;
};

const commitLinesForRelease =
  commits.length > 0
    ? commits.map(formatCommit)
    : ["- No commits found for this release."];
const contributorLines =
  contributorEntries.length > 0
    ? contributorEntries.map(({ value, isGithubLogin }) =>
        isGithubLogin ? `- @${value}` : `- ${value}`,
      )
    : ["- None listed"];
const body = readFileSync(notesPath, "utf8").trim();
const changelogAssetName = `StackFerry-${currentRef}-changelog.md`;
const changelogUrl = `https://github.com/${repository}/releases/download/${currentRef}/${changelogAssetName}`;
const fullCommitSection = `### Commits\n\n${commitLinesForRelease.join("\n")}`;
const fullContributorSection = `### Contributors\n\n${contributorLines.join("\n")}`;
const completeBody = `${body}\n\n${fullCommitSection}\n\n${fullContributorSection}`;

if (changelogPath) writeFileSync(changelogPath, `${completeBody}\n`);

const maxBodyLength = 60000;
const visibleCommitLines = [];
const visibleContributorLines = [...contributorLines];

const buildReleaseBody = (commitLines, contributors) => {
  const omittedCommitCount = commitLinesForRelease.length - commitLines.length;
  const omittedContributorCount = contributorLines.length - contributors.length;
  const commitSection = `### Commits\n\n${commitLines.join("\n")}${
    omittedCommitCount > 0
      ? `\n\n_${omittedCommitCount} additional commits are included in the complete changelog attachment: [${changelogAssetName}](${changelogUrl})._`
      : ""
  }`;
  const contributorSection = `### Contributors\n\n${contributors.join("\n")}${
    omittedContributorCount > 0
      ? `\n\n_${omittedContributorCount} additional contributors are included in the complete changelog attachment: [${changelogAssetName}](${changelogUrl})._`
      : ""
  }`;
  return `${body}\n\n${commitSection}\n\n${contributorSection}\n`;
};

for (const line of commitLinesForRelease) {
  visibleCommitLines.push(line);
}

while (
  buildReleaseBody(visibleCommitLines, visibleContributorLines).length >
    maxBodyLength &&
  visibleCommitLines.length > 0
) {
  visibleCommitLines.pop();
}

while (
  buildReleaseBody(visibleCommitLines, visibleContributorLines).length >
    maxBodyLength &&
  visibleContributorLines.length > 1
) {
  visibleContributorLines.pop();
}

process.stdout.write(
  buildReleaseBody(visibleCommitLines, visibleContributorLines),
);
