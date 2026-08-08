import React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { AppId } from "@/lib/api/types";
import { APP_IDS, APP_ICON_MAP } from "@/config/appConfig";

interface AppCountBarProps {
  totalLabel: string;
  counts: Partial<Record<AppId, number>>;
  appIds?: AppId[];
  totalCount?: number;
  onToggleAll?: (app: AppId, enabled: boolean) => void | Promise<void>;
  pendingApp?: AppId | null;
}

export const AppCountBar: React.FC<AppCountBarProps> = ({
  totalLabel,
  counts,
  appIds = APP_IDS,
  totalCount,
  onToggleAll,
  pendingApp,
}) => {
  const { t } = useTranslation();
  const bulkEnabled = totalCount !== undefined && onToggleAll !== undefined;

  return (
    <div className="mb-4 flex flex-shrink-0 items-center justify-between gap-4 border-b border-border py-3">
      <Badge variant="outline" className="h-7 bg-background px-3">
        {totalLabel}
      </Badge>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {appIds.map((app) => {
          const count = counts[app] ?? 0;
          const allEnabled =
            bulkEnabled && totalCount > 0 && count === totalCount;
          const partiallyEnabled =
            bulkEnabled && count > 0 && count < (totalCount ?? 0);
          const actionLabel = allEnabled
            ? t("common.disableAllForApp", { app: APP_ICON_MAP[app].label })
            : t("common.enableAllForApp", { app: APP_ICON_MAP[app].label });

          return (
            <Badge
              key={app}
              variant="secondary"
              className={APP_ICON_MAP[app].badgeClass}
            >
              {bulkEnabled && (
                <Checkbox
                  checked={
                    allEnabled
                      ? true
                      : partiallyEnabled
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={() => void onToggleAll(app, !allEnabled)}
                  disabled={pendingApp !== undefined && pendingApp !== null}
                  aria-label={actionLabel}
                  title={actionLabel}
                  className="h-3.5 w-3.5"
                />
              )}
              <span className="opacity-75">{APP_ICON_MAP[app].label}:</span>
              <span className="font-bold ml-1">{count}</span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
};
