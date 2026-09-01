import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RepoManagerPanel } from "@/features/skills/RepoManagerPanel";
import type { DiscoverableSkill, SkillRepo } from "@/platform/tauri/api/skills";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "skills.repo.skillCount" ? `skill-count:${options?.count}` : key,
  }),
}));

const repo: SkillRepo = {
  owner: "owner-a",
  name: "repo-a",
  branch: "",
  enabled: true,
};

const skill: DiscoverableSkill = {
  key: "repo-skill:owner-a:repo-a",
  name: "Repo Skill",
  description: "",
  directory: "repo-skill",
  repoOwner: "owner-a",
  repoName: "repo-a",
  repoBranch: "main",
};

describe("RepoManagerPanel", () => {
  it("matches skill counts by the exact branch and labels an empty branch as default", () => {
    render(
      <RepoManagerPanel
        repos={[repo]}
        skills={[skill]}
        onAdd={vi.fn()}
        isAdding={false}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("skill-count:0")).toBeInTheDocument();
    expect(
      screen.getByText("skills.repo.branch: skills.repo.defaultBranch"),
    ).toBeInTheDocument();
  });
});
