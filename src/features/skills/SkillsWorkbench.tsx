import React, { useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/platform/tauri/api/types";
import UnifiedSkillsPanel, {
  type UnifiedSkillsPanelHandle,
  type InstalledSkillsPageState,
} from "./UnifiedSkillsPanel";
import {
  SkillsPage,
  type SkillsPageHandle,
  type SkillsPageSource,
} from "./SkillsPage";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

export type SkillsWorkbenchTab = "installed" | "discover";

interface SkillsWorkbenchProps {
  initialTab: SkillsWorkbenchTab;
  availableApps: readonly AppId[];
  onSourceChange?: (source: SkillsPageSource) => void;
  requestedMode?: InstalledSkillsPageState["mode"];
  onPageStateChange?: (state: InstalledSkillsPageState) => void;
}

export interface SkillsWorkbenchHandle {
  openDiscovery: () => void;
  openImport: () => void;
  openInstallFromZip: () => void;
  openRestoreFromBackup: () => void;
  checkUpdates: () => void;
  refresh: () => void;
  openRepoManager: () => void;
}

const SkillsWorkbench = React.forwardRef<
  SkillsWorkbenchHandle,
  SkillsWorkbenchProps
>(
  (
    {
      initialTab,
      availableApps,
      onSourceChange,
      requestedMode,
      onPageStateChange,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [tab, setTab] = useState<SkillsWorkbenchTab>(initialTab);
    const installedRef = useRef<UnifiedSkillsPanelHandle>(null);
    const discoveryRef = useRef<SkillsPageHandle>(null);

    useImperativeHandle(ref, () => ({
      openDiscovery: () => setTab("discover"),
      openImport: () => installedRef.current?.openImport(),
      openInstallFromZip: () => installedRef.current?.openInstallFromZip(),
      openRestoreFromBackup: () =>
        installedRef.current?.openRestoreFromBackup(),
      checkUpdates: () => installedRef.current?.checkUpdates(),
      refresh: () => discoveryRef.current?.refresh(),
      openRepoManager: () => discoveryRef.current?.openRepoManager(),
    }));

    const tabs = (
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SkillsWorkbenchTab)}
      >
        <TabsList
          layout="compact"
          className="rounded-md border border-border bg-muted/40 p-0.5"
        >
          <TabsTrigger value="installed" className="h-7 min-w-24 px-2 py-1">
            {t("skills.tabs.installed")}
          </TabsTrigger>
          <TabsTrigger value="discover" className="h-7 min-w-24 px-2 py-1">
            {t("skills.tabs.discover")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );

    if (tab === "discover") {
      return (
        <SkillsPage
          ref={discoveryRef}
          availableApps={availableApps}
          onSourceChange={onSourceChange}
          workbenchTabs={tabs}
        />
      );
    }

    return (
      <UnifiedSkillsPanel
        ref={installedRef}
        onOpenDiscovery={() => setTab("discover")}
        availableApps={availableApps}
        workbenchTabs={tabs}
        requestedMode={requestedMode}
        onPageStateChange={onPageStateChange}
      />
    );
  },
);

SkillsWorkbench.displayName = "SkillsWorkbench";

export default SkillsWorkbench;
