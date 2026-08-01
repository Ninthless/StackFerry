import { useTranslation } from "react-i18next";
import { Edit2, Trash2, RefreshCw, Globe, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import type { UniversalProvider } from "@/types";
import { APP_ICON_MAP, APP_IDS } from "@/config/appConfig";

interface UniversalProviderCardProps {
  provider: UniversalProvider;
  onEdit: (provider: UniversalProvider) => void;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
  onDuplicate: (provider: UniversalProvider) => void;
}

export function UniversalProviderCard({
  provider,
  onEdit,
  onDelete,
  onSync,
  onDuplicate,
}: UniversalProviderCardProps) {
  const { t } = useTranslation();

  const enabledApps = APP_IDS.filter((appId) => provider.apps[appId]);

  return (
    <div className="group relative rounded-md border border-border-default bg-card p-4 transition-colors hover:border-foreground/25">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <ProviderIcon icon={provider.icon} name={provider.name} size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{provider.name}</h3>
            <p className="text-xs text-muted-foreground">
              {provider.providerType}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSync(provider.id)}
            title={t("universalProvider.sync", { defaultValue: "同步到应用" })}
            aria-label={t("universalProvider.sync", {
              defaultValue: "同步到应用",
            })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDuplicate(provider)}
            title={t("universalProvider.duplicate", { defaultValue: "复制" })}
            aria-label={t("universalProvider.duplicate", {
              defaultValue: "复制",
            })}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(provider)}
            title={t("common.edit", { defaultValue: "编辑" })}
            aria-label={t("common.edit", { defaultValue: "编辑" })}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(provider.id)}
            title={t("common.delete", { defaultValue: "删除" })}
            aria-label={t("common.delete", { defaultValue: "删除" })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {provider.baseUrl || "-"}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {enabledApps.map((appId) => (
            <span
              key={appId}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {APP_ICON_MAP[appId].icon}
              {t(`apps.${appId}`, {
                defaultValue: APP_ICON_MAP[appId].label,
              })}
            </span>
          ))}
          {enabledApps.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {t("universalProvider.noAppsEnabled", {
                defaultValue: "未启用任何应用",
              })}
            </span>
          )}
        </div>
      </div>

      {provider.notes && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
          {provider.notes}
        </p>
      )}
    </div>
  );
}
