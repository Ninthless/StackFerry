import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { settingsApi, type LogConfig } from "@/platform/tauri/api/settings";
import { Button } from "@/shared/ui/button";
import { ScrollArea } from "@/shared/ui/scroll-area";
import {
  Download,
  FolderOpen,
  RefreshCw,
  FileText,
  Loader2,
} from "lucide-react";
import type { ApplicationLogInfo } from "@/platform/tauri/api/settings";

const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"] as const;

export function LogConfigPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LogConfig>({
    enabled: true,
    level: "info",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [logInfo, setLogInfo] = useState<ApplicationLogInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadLogInfo = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setLogInfo(await settingsApi.getApplicationLogInfo());
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    settingsApi
      .getLogConfig()
      .then(setConfig)
      .catch((e) => console.error("Failed to load log config:", e))
      .finally(() => setIsLoading(false));
    void loadLogInfo();
  }, [loadLogInfo]);

  const handleChange = async (updates: Partial<LogConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await settingsApi.setLogConfig(newConfig);
    } catch (e) {
      console.error("Failed to save log config:", e);
      toast.error(String(e));
      setConfig(config);
    }
  };

  if (isLoading) return null;

  const formatBytes = (value: number) => {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  };

  const exportLogs = async () => {
    setIsExporting(true);
    try {
      const path = await settingsApi.exportApplicationLogs();
      if (path) {
        toast.success(t("settings.advanced.logConfig.exportSuccess", { path }));
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t("settings.advanced.logConfig.enabled")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.advanced.logConfig.enabledDescription")}
          </p>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(checked) => handleChange({ enabled: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t("settings.advanced.logConfig.level")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.advanced.logConfig.levelDescription")}
          </p>
        </div>
        <Select
          value={config.level}
          disabled={!config.enabled}
          onValueChange={(value) =>
            handleChange({ level: value as LogConfig["level"] })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOG_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {t(`settings.advanced.logConfig.levels.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 rounded-md bg-muted/50 p-4 text-xs">
        <p className="mb-2 font-medium text-muted-foreground">
          {t("settings.advanced.logConfig.levelHint")}
        </p>
        <div className="grid gap-1 text-muted-foreground">
          <p>
            <span className="font-mono text-foreground">error</span> -{" "}
            {t("settings.advanced.logConfig.levelDesc.error")}
          </p>
          <p>
            <span className="font-mono text-foreground">warn</span> -{" "}
            {t("settings.advanced.logConfig.levelDesc.warn")}
          </p>
          <p>
            <span className="font-mono text-foreground">info</span> -{" "}
            {t("settings.advanced.logConfig.levelDesc.info")}
          </p>
          <p>
            <span className="font-mono text-foreground">debug</span> -{" "}
            {t("settings.advanced.logConfig.levelDesc.debug")}
          </p>
          <p>
            <span className="font-mono text-foreground">trace</span> -{" "}
            {t("settings.advanced.logConfig.levelDesc.trace")}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <Label>{t("settings.advanced.logConfig.files")}</Label>
            <p
              className="truncate text-xs text-muted-foreground"
              title={logInfo?.directory}
            >
              {logInfo?.directory ||
                t("settings.advanced.logConfig.noLogFiles")}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadLogInfo()}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("common.refresh")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void settingsApi.openApplicationLogFolder()}
            >
              <FolderOpen className="h-4 w-4" />
              {t("settings.advanced.logConfig.openFolder")}
            </Button>
            <Button
              size="sm"
              onClick={() => void exportLogs()}
              disabled={isExporting || !logInfo?.files.length}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t("settings.advanced.logConfig.export")}
            </Button>
          </div>
        </div>

        {logInfo && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {t("settings.advanced.logConfig.fileCount", {
                count: logInfo.files.length,
              })}
            </span>
            <span>{formatBytes(logInfo.totalSize)}</span>
          </div>
        )}

        <ScrollArea className="h-56 rounded-md border border-border bg-background">
          <pre className="min-w-full whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-muted-foreground">
            {logInfo?.preview || t("settings.advanced.logConfig.emptyPreview")}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}
