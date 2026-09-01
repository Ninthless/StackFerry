import { createRef } from "react";
import {
  render,
  screen,
  waitFor,
  act,
  within,
  fireEvent,
} from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

import UnifiedSkillsPanel, {
  type UnifiedSkillsPanelHandle,
} from "@/features/skills/UnifiedSkillsPanel";
import { skillsApi } from "@/platform/tauri/api";
import type {
  InstalledSkill,
  SkillBackupEntry,
} from "@/platform/tauri/api/skills";
import en from "@/i18n/locales/en.json";
import ja from "@/i18n/locales/ja.json";
import zh from "@/i18n/locales/zh.json";
import zhTW from "@/i18n/locales/zh-TW.json";

const scanUnmanagedMock = vi.fn();
const toggleSkillAppMock = vi.fn();
const bulkToggleSkillAppMock = vi.fn();
const uninstallSkillMock = vi.fn();
const importSkillsMock = vi.fn();
const installFromZipMock = vi.fn();
const deleteSkillBackupMock = vi.fn();
const restoreSkillBackupMock = vi.fn();
const refetchSkillBackupsMock = vi.fn();
let installedSkillsMock: InstalledSkill[] = [];
let skillBackupsMock: SkillBackupEntry[] = [];

const makeInstalledSkill = (): InstalledSkill => ({
  id: "skill-1",
  name: "Installed Skill",
  directory: "installed-skill",
  repoOwner: "owner-a",
  repoName: "repo-a",
  apps: {
    claude: true,
    codex: false,
    pi: true,
    gemini: false,
    opencode: false,
    openclaw: false,
    hermes: false,
  },
  installedAt: 1,
  updatedAt: 1,
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/features/skills/model/useSkills", () => ({
  useInstalledSkills: () => ({
    data: installedSkillsMock,
    isLoading: false,
  }),
  useSkillBackups: () => ({
    data: skillBackupsMock,
    refetch: refetchSkillBackupsMock,
    isFetching: false,
  }),
  useDeleteSkillBackup: () => ({
    mutateAsync: deleteSkillBackupMock,
    isPending: false,
  }),
  useToggleSkillApp: () => ({
    mutateAsync: toggleSkillAppMock,
    isPending: false,
    variables: undefined,
  }),
  useBulkToggleSkillApp: () => ({
    mutateAsync: bulkToggleSkillAppMock,
    isPending: false,
    variables: undefined,
  }),
  useRestoreSkillBackup: () => ({
    mutateAsync: restoreSkillBackupMock,
    isPending: false,
  }),
  useUninstallSkill: () => ({
    mutateAsync: uninstallSkillMock,
  }),
  useScanUnmanagedSkills: () => ({
    data: [
      {
        directory: "shared-skill",
        name: "Shared Skill",
        description: "Imported from Grok Build",
        foundIn: ["grokbuild"],
        path: "/tmp/shared-skill",
      },
    ],
    refetch: scanUnmanagedMock,
  }),
  useImportSkillsFromApps: () => ({
    mutateAsync: importSkillsMock,
  }),
  useInstallSkillsFromZip: () => ({
    mutateAsync: installFromZipMock,
    isPending: false,
  }),
  useCheckSkillUpdates: () => ({
    data: [],
    refetch: vi.fn(),
    isFetching: false,
  }),
  useUpdateSkill: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("UnifiedSkillsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    scanUnmanagedMock.mockResolvedValue({
      data: [
        {
          directory: "shared-skill",
          name: "Shared Skill",
          description: "Imported from Grok Build",
          foundIn: ["grokbuild"],
          path: "/tmp/shared-skill",
        },
      ],
    });
    toggleSkillAppMock.mockReset();
    bulkToggleSkillAppMock.mockReset();
    bulkToggleSkillAppMock.mockResolvedValue({ succeeded: [], failed: [] });
    uninstallSkillMock.mockReset();
    importSkillsMock.mockReset();
    installFromZipMock.mockReset();
    deleteSkillBackupMock.mockReset();
    restoreSkillBackupMock.mockReset();
    refetchSkillBackupsMock.mockReset();
    refetchSkillBackupsMock.mockResolvedValue({ data: skillBackupsMock });
    installedSkillsMock = [];
    skillBackupsMock = [];
  });

  it("opens the import dialog without crashing when app toggles render", async () => {
    const ref = createRef<UnifiedSkillsPanelHandle>();

    render(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        availableApps={["claude"]}
      />,
    );

    await act(async () => {
      await ref.current?.openImport();
    });

    await waitFor(() => {
      expect(screen.getByText("skills.import")).toBeInTheDocument();
      expect(screen.getByText("Shared Skill")).toBeInTheDocument();
      expect(screen.getByText("/tmp/shared-skill")).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByText("skills.importSelected").click();
    });

    await waitFor(() => {
      expect(importSkillsMock).toHaveBeenCalledWith([
        {
          directory: "shared-skill",
          apps: expect.objectContaining({ grokbuild: true }),
        },
      ]);
    });
  });

  it("chooses the target application before opening the ZIP file dialog", async () => {
    const openDialogSpy = vi
      .spyOn(skillsApi, "openZipFileDialog")
      .mockResolvedValue("/tmp/skills.zip");
    installFromZipMock.mockResolvedValue([makeInstalledSkill()]);

    const ref = createRef<UnifiedSkillsPanelHandle>();
    render(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        availableApps={["pi"]}
      />,
    );

    await act(async () => {
      ref.current?.openInstallFromZip();
    });

    expect(openDialogSpy).not.toHaveBeenCalled();

    await act(async () => {
      within(screen.getByRole("dialog")).getByText("skills.install").click();
    });

    await waitFor(() => {
      expect(installFromZipMock).toHaveBeenCalledWith({
        filePath: "/tmp/skills.zip",
        currentApp: "pi",
      });
    });
    openDialogSpy.mockRestore();
  });

  it("restores a backup into the selected target application", async () => {
    const restoredSkill = makeInstalledSkill();
    skillBackupsMock = [
      {
        backupId: "backup-1",
        backupPath: "/tmp/backup-1",
        createdAt: 1,
        skill: restoredSkill,
      },
    ];
    restoreSkillBackupMock.mockResolvedValue(restoredSkill);

    const ref = createRef<UnifiedSkillsPanelHandle>();
    render(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        availableApps={["gemini"]}
      />,
    );

    await act(async () => {
      await ref.current?.openRestoreFromBackup();
    });
    await act(async () => {
      screen.getByText("skills.restoreFromBackup.restore").click();
    });

    expect(restoreSkillBackupMock).toHaveBeenCalledWith({
      backupId: "backup-1",
      currentApp: "gemini",
    });
  });

  it("toggles only the selected application matrix cell", async () => {
    installedSkillsMock = [makeInstalledSkill()];
    toggleSkillAppMock.mockResolvedValue(true);

    render(
      <UnifiedSkillsPanel onOpenDiscovery={() => {}} availableApps={["pi"]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Installed Skill/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Codex" })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: "Codex" }).click();

    await waitFor(() => {
      expect(toggleSkillAppMock).toHaveBeenCalledWith({
        id: "skill-1",
        app: "codex",
        enabled: true,
      });
    });
    expect(toggleSkillAppMock).toHaveBeenCalledTimes(1);
  });

  it("filters locally while bulk toggling the complete mixed list", async () => {
    const user = userEvent.setup();
    installedSkillsMock = [
      {
        ...makeInstalledSkill(),
        id: "enabled-id",
        name: "Visible Skill",
        apps: { ...makeInstalledSkill().apps, claude: true },
      },
      {
        ...makeInstalledSkill(),
        id: "disabled-id",
        name: "Hidden Skill",
        apps: { ...makeInstalledSkill().apps, claude: false },
      },
    ];
    bulkToggleSkillAppMock.mockResolvedValue({
      succeeded: ["disabled-id"],
      failed: [],
    });

    render(
      <UnifiedSkillsPanel
        onOpenDiscovery={() => {}}
        availableApps={["claude"]}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "skills.installedSearchAriaLabel",
      }),
      { target: { value: "Visible Skill" } },
    );

    expect(screen.getByText("Visible Skill")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Skill")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "skills.bulkAssignments" }),
    );
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: /Claude/ }),
    );

    await waitFor(() => {
      expect(bulkToggleSkillAppMock).toHaveBeenCalledWith({
        ids: ["disabled-id"],
        app: "claude",
        enabled: true,
      });
    });
  });

  it("includes the installed count and exposes responsive action groups", async () => {
    installedSkillsMock = [makeInstalledSkill()];

    const { container } = render(
      <UnifiedSkillsPanel onOpenDiscovery={() => {}} availableApps={["pi"]} />,
    );

    expect(
      screen.getByRole("button", { name: "skills.bulkAssignments" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".app-count-bar")).not.toBeInTheDocument();
    expect(container.querySelector(".management-summary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Installed Skill/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pi" })).toBeInTheDocument();
    });
    expect(
      container.querySelector(".installed-skill-detail-page"),
    ).toContainElement(screen.getByRole("button", { name: "Pi" }));
    for (const locale of [en, ja, zh, zhTW]) {
      expect(locale.skills.installedCount).toContain("{{count}}");
    }
  });
});
