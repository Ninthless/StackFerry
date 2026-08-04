import { createRef } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import UnifiedSkillsPanel, {
  type UnifiedSkillsPanelHandle,
} from "@/components/skills/UnifiedSkillsPanel";
import { skillsApi } from "@/lib/api";
import type { InstalledSkill, SkillBackupEntry } from "@/lib/api/skills";

const scanUnmanagedMock = vi.fn();
const toggleSkillAppMock = vi.fn();
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

vi.mock("@/hooks/useSkills", () => ({
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
        targetApp="claude"
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

  it("captures the target application before opening the ZIP dialog", async () => {
    let resolveFilePath: (path: string) => void = () => {};
    const filePathPromise = new Promise<string>((resolve) => {
      resolveFilePath = resolve;
    });
    const openDialogSpy = vi
      .spyOn(skillsApi, "openZipFileDialog")
      .mockReturnValue(filePathPromise);
    installFromZipMock.mockResolvedValue([makeInstalledSkill()]);

    const ref = createRef<UnifiedSkillsPanelHandle>();
    const { rerender } = render(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        targetApp="pi"
      />,
    );

    await act(async () => {
      ref.current?.openInstallFromZip();
    });

    rerender(
      <UnifiedSkillsPanel
        ref={ref}
        onOpenDiscovery={() => {}}
        targetApp="gemini"
      />,
    );

    await act(async () => {
      resolveFilePath("/tmp/skills.zip");
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
        targetApp="gemini"
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

    render(<UnifiedSkillsPanel onOpenDiscovery={() => {}} targetApp="pi" />);

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
});
