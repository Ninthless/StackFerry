import { Download, Plus, Route } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AppId } from "@/lib/api/types";

interface ProviderEmptyStateProps {
  appId: AppId;
  onCreate?: () => void;
  onImport?: () => void;
}

export function ProviderEmptyState({
  appId,
  onCreate,
  onImport,
}: ProviderEmptyStateProps) {
  const { t } = useTranslation();
  const showSnippetHint =
    appId === "claude" || appId === "codex" || appId === "gemini";

  return (
    <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border bg-card/45 p-10 text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
        <Route className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{t("provider.noProviders")}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t("provider.noProvidersDescription")}
      </p>
      {showSnippetHint && (
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {t("provider.noProvidersDescriptionSnippet")}
        </p>
      )}
      <div className="mt-6 flex items-center gap-2">
        {onImport && (
          <Button variant="outline" onClick={onImport}>
            <Download className="h-4 w-4" />
            {appId === "claude-desktop"
              ? t("provider.importFromClaude", {
                  defaultValue: "将 Claude Code 中已有的供应商导入",
                })
              : t("provider.importCurrent")}
          </Button>
        )}
        {onCreate && (
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {t("provider.addProvider")}
          </Button>
        )}
      </div>
    </div>
  );
}
