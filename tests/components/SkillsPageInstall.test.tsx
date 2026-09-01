import { createRef } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { toast } from "sonner";

import {
  SkillsPage,
  getSkillsPageHeaderActions,
  type SkillsPageHandle,
} from "@/features/skills/SkillsPage";
import type {
  DiscoverableSkill,
  SkillRepo,
  SkillsShDiscoverableSkill,
  SkillsShSearchResult,
} from "@/platform/tauri/api/skills";

const installMutateAsyncMock = vi.fn();
const addRepoMutateAsyncMock = vi.fn();
let discoverableSkillsMock: DiscoverableSkill[] = [];
let skillReposMock: SkillRepo[] = [];
const refetchDiscoverableMock = vi.fn();

// Stable cache so repeated renders see referentially-equal data.
// SkillsPage has `useEffect([skillsShResult, ...])` that calls setState — a
// fresh object every render would loop forever.
const searchCache = new Map<
  string,
  {
    data: SkillsShSearchResult | undefined;
    isLoading: boolean;
    isFetching: boolean;
    isPlaceholderData?: boolean;
  }
>();

const setSearchResult = (
  query: string,
  offset: number,
  result: SkillsShSearchResult | undefined,
  state: Partial<{
    isLoading: boolean;
    isFetching: boolean;
    isPlaceholderData: boolean;
  }> = {},
) => {
  searchCache.set(`${query}:${offset}`, {
    data: result,
    isLoading: false,
    isFetching: false,
    ...state,
  });
};

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/features/skills/model/useSkills", () => ({
  useDiscoverableSkills: () => ({
    data: { skills: discoverableSkillsMock, failures: [] },
    isLoading: false,
    isFetching: false,
    refetch: refetchDiscoverableMock,
  }),
  useInstalledSkills: () => ({
    data: [],
    isLoading: false,
  }),
  useInstallSkill: () => ({
    mutateAsync: installMutateAsyncMock,
    isPending: false,
  }),
  useSkillRepos: () => ({
    data: skillReposMock,
    refetch: vi.fn(),
  }),
  useAddSkillRepo: () => ({
    mutateAsync: addRepoMutateAsyncMock,
    isPending: false,
  }),
  useRemoveSkillRepo: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSearchSkillsSh: (query: string, _limit: number, offset: number) => {
    const cached = searchCache.get(`${query}:${offset}`);
    if (cached) return cached;
    return { data: undefined, isLoading: false, isFetching: false };
  },
}));

const makeSkillsShSkill = (
  overrides: Partial<SkillsShDiscoverableSkill> = {},
): SkillsShDiscoverableSkill => ({
  key: "agent-browser:owner-a:repo-a",
  name: "Agent Browser",
  directory: "agent-browser",
  repoOwner: "owner-a",
  repoName: "repo-a",
  repoBranch: "main",
  installs: 100,
  readmeUrl: "https://example.com/a",
  ...overrides,
});

const makeDiscoverableSkill = (
  overrides: Partial<DiscoverableSkill> = {},
): DiscoverableSkill => ({
  key: "repo-skill:owner-a:repo-a",
  name: "Repo Skill",
  description: "Skill from a configured repository",
  directory: "repo-skill",
  readmeUrl: "https://example.com/repo-skill",
  repoOwner: "owner-a",
  repoName: "repo-a",
  repoBranch: "main",
  ...overrides,
});

const makeSkillRepo = (overrides: Partial<SkillRepo> = {}): SkillRepo => ({
  owner: "owner-a",
  name: "repo-a",
  branch: "main",
  enabled: true,
  ...overrides,
});

describe("SkillsPage - skills.sh install (regression)", () => {
  beforeEach(() => {
    installMutateAsyncMock.mockReset();
    installMutateAsyncMock.mockResolvedValue({});
    addRepoMutateAsyncMock.mockReset();
    discoverableSkillsMock = [];
    skillReposMock = [];
    refetchDiscoverableMock.mockReset();
    searchCache.clear();
  });

  it("installs the second skill when two results share the same directory", async () => {
    const first = makeSkillsShSkill({
      key: "agent-browser:owner-a:repo-a",
      name: "Agent Browser A",
      repoOwner: "owner-a",
      repoName: "repo-a",
    });
    const second = makeSkillsShSkill({
      key: "agent-browser:owner-b:repo-b",
      name: "Agent Browser B",
      repoOwner: "owner-b",
      repoName: "repo-b",
    });

    setSearchResult("agent", 0, {
      skills: [first, second],
      totalCount: 2,
      query: "agent",
    });

    const ref = createRef<SkillsPageHandle>();
    render(<SkillsPage ref={ref} availableApps={["pi"]} />);

    const user = userEvent.setup();

    // Switch to skills.sh source
    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));

    // Type a query and submit
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "agent");
    await user.click(screen.getByRole("button", { name: "skills.search" }));

    // Wait for both cards to render
    await waitFor(() => {
      expect(screen.getByText("Agent Browser A")).toBeInTheDocument();
      expect(screen.getByText("Agent Browser B")).toBeInTheDocument();
    });

    // Click install on the SECOND card (Agent Browser B)
    const secondCard = screen
      .getByText("Agent Browser B")
      .closest("[data-skill-key]");
    expect(secondCard).not.toBeNull();
    const installButton = secondCard!.querySelector(
      "button:last-of-type",
    ) as HTMLButtonElement;
    expect(installButton).not.toBeNull();
    await user.click(installButton);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "skills.install",
      }),
    );

    // Verify the SECOND skill was passed to the install mutation, not the first
    await waitFor(() => {
      expect(installMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    const callArgs = installMutateAsyncMock.mock.calls[0][0];
    expect(callArgs.skill.repoOwner).toBe("owner-b");
    expect(callArgs.skill.repoName).toBe("repo-b");
    expect(callArgs.skill.name).toBe("Agent Browser B");
    expect(callArgs.currentApp).toBe("pi");
  });

  it("installs a repository skill into the selected target application", async () => {
    discoverableSkillsMock = [makeDiscoverableSkill()];
    skillReposMock = [makeSkillRepo()];

    render(<SkillsPage availableApps={["codex"]} />);

    const card = screen.getByText("Repo Skill").closest("[data-skill-key]");
    expect(card).not.toBeNull();

    const installButton = card!.querySelector(
      "button:last-of-type",
    ) as HTMLButtonElement;
    const user = userEvent.setup();
    await user.click(installButton);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "skills.install",
      }),
    );

    await waitFor(() => {
      expect(installMutateAsyncMock).toHaveBeenCalledWith({
        skill: expect.objectContaining({ key: "repo-skill:owner-a:repo-a" }),
        currentApp: "codex",
      });
    });
  });

  it("keeps skills.sh results when submitting the same query again", async () => {
    const figmaSkill = makeSkillsShSkill({
      key: "figma-use:figma:mcp-server-guide",
      name: "figma-use",
      directory: "figma-use",
      repoOwner: "figma",
      repoName: "mcp-server-guide",
    });

    setSearchResult("figma", 0, {
      skills: [figmaSkill],
      totalCount: 1,
      query: "figma",
    });

    render(<SkillsPage availableApps={["claude"]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "figma");

    const searchButton = screen.getByRole("button", {
      name: "skills.search",
    });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("figma-use")).toBeInTheDocument();
    });

    await user.click(searchButton);

    expect(screen.getByText("figma-use")).toBeInTheDocument();
  });

  it("shows the skills.sh loading state while a new query is fetching", async () => {
    const figmaSkill = makeSkillsShSkill({
      key: "figma-use:figma:mcp-server-guide",
      name: "figma-use",
      directory: "figma-use",
      repoOwner: "figma",
      repoName: "mcp-server-guide",
    });

    setSearchResult("figma", 0, {
      skills: [figmaSkill],
      totalCount: 1,
      query: "figma",
    });
    setSearchResult("react", 0, undefined, { isFetching: true });

    render(<SkillsPage availableApps={["claude"]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));
    const input = screen.getByPlaceholderText(
      "skills.skillssh.searchPlaceholder",
    );
    await user.type(input, "figma");

    const searchButton = screen.getByRole("button", {
      name: "skills.search",
    });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("figma-use")).toBeInTheDocument();
    });

    await user.clear(input);
    await user.type(input, "react");
    await user.click(searchButton);

    expect(screen.getByText("skills.skillssh.loading")).toBeInTheDocument();
  });

  it("reports the effective skills.sh source to parent chrome", async () => {
    const onSourceChange = vi.fn();

    render(
      <SkillsPage availableApps={["claude"]} onSourceChange={onSourceChange} />,
    );

    await waitFor(() => {
      expect(onSourceChange).toHaveBeenCalledWith("skillssh");
    });
  });

  it("keeps the repository source when configured repositories return no discoverable skills", async () => {
    skillReposMock = [makeSkillRepo()];
    const onSourceChange = vi.fn();

    render(
      <SkillsPage availableApps={["claude"]} onSourceChange={onSourceChange} />,
    );

    await waitFor(() => {
      expect(onSourceChange).toHaveBeenCalledWith("repos");
    });
    expect(
      screen.getByPlaceholderText("skills.searchPlaceholder"),
    ).toBeVisible();
  });

  it("can switch back to repository results after discoverable skills refresh", async () => {
    const onSourceChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <SkillsPage availableApps={["claude"]} onSourceChange={onSourceChange} />,
    );

    await waitFor(() => {
      expect(onSourceChange).toHaveBeenCalledWith("skillssh");
    });

    await user.click(screen.getByRole("button", { name: /skills\.sh/i }));

    discoverableSkillsMock = [makeDiscoverableSkill()];
    skillReposMock = [makeSkillRepo()];
    rerender(
      <SkillsPage availableApps={["claude"]} onSourceChange={onSourceChange} />,
    );

    await user.click(
      screen.getByRole("button", { name: "skills.searchSource.repos" }),
    );

    expect(screen.getByText("Repo Skill")).toBeInTheDocument();
    expect(onSourceChange).toHaveBeenCalledWith("repos");
  });

  it("formats add repository errors for the toast and form", async () => {
    const structuredError = JSON.stringify({
      code: "INVALID_REPO_REF",
      context: { owner: "owner-a", name: "repo-a" },
      suggestion: "checkRepoUrl",
    });
    addRepoMutateAsyncMock.mockRejectedValue(new Error(structuredError));
    skillReposMock = [makeSkillRepo()];

    render(<SkillsPage availableApps={["claude"]} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "skills.addRepo" }));
    await user.type(
      screen.getByPlaceholderText("skills.repo.urlPlaceholder"),
      "owner-a/repo-a",
    );
    await user.click(screen.getByRole("button", { name: "skills.repo.add" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("skills.repo.addFailed", {
        description:
          "skills.error.invalidRepoRef\n\nskills.error.suggestion.checkRepoUrl",
      });
    });
    expect(
      screen.getByText(
        "skills.error.invalidRepoRef skills.error.suggestion.checkRepoUrl",
      ),
    ).toBeInTheDocument();
  });

  it("exposes repository-only header actions for the parent chrome", () => {
    expect(
      getSkillsPageHeaderActions("repos").map((action) => action.key),
    ).toEqual(["refresh-repos", "manage-repos"]);
    expect(
      getSkillsPageHeaderActions("skillssh").map((action) => action.key),
    ).toEqual(["manage-repos"]);
  });

  it("keeps repository management available inside the discover page", async () => {
    skillReposMock = [makeSkillRepo()];
    discoverableSkillsMock = [makeDiscoverableSkill()];

    render(<SkillsPage availableApps={["claude"]} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", {
        name: /skills\.repoManager/,
      }),
    );

    expect(
      screen.getByRole("heading", { name: "skills.repo.title" }),
    ).toBeInTheDocument();
  });

  it("renders discoverable skills as large resource cards", () => {
    skillReposMock = [makeSkillRepo()];
    discoverableSkillsMock = [makeDiscoverableSkill()];

    const { container } = render(<SkillsPage availableApps={["claude"]} />);

    const card = container.querySelector("[data-skill-key]");
    expect(card).toHaveClass("skill-discovery-card", "min-h-[180px]");
    expect(card).toHaveTextContent("owner-a/repo-a");
    expect(card).toHaveTextContent("Skill from a configured repository");
  });

  it("uses container layout hooks without viewport breakpoint classes", () => {
    discoverableSkillsMock = [makeDiscoverableSkill()];
    skillReposMock = [makeSkillRepo()];

    const { container } = render(<SkillsPage availableApps={["claude"]} />);

    expect(
      container.querySelector(".skills-discovery-toolbar"),
    ).not.toHaveClass("md:flex-row", "md:items-center");
    expect(container.querySelector(".skills-discovery-grid")).toHaveClass(
      "grid-cols-1",
    );
    expect(container.querySelector(".skills-discovery-grid")).not.toHaveClass(
      "md:grid-cols-2",
      "lg:grid-cols-3",
    );
  });
});
