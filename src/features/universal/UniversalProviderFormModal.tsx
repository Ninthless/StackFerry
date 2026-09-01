import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { FullScreenPanel } from "@/shared/common/FullScreenPanel";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { ProviderIcon } from "@/shared/ui/ProviderIcon";
import type {
  UniversalProvider,
  UniversalProviderApps,
  UniversalProviderModels,
} from "@/shared/contracts";
import {
  universalProviderPresets,
  createUniversalProviderFromPreset,
  type UniversalProviderPreset,
} from "@/features/providers";
import { deepClone } from "@/shared/lib/deepClone";
import { APP_ICON_MAP, APP_IDS } from "@/shared/platform/appRegistry";
import type { AppId } from "@/platform/tauri/api";
import {
  ProviderFormSection,
  providerFormClassName,
  providerPanelContentClassName,
  providerPanelFooterClassName,
} from "@/features/providers";

const normalizeApps = (
  apps: Partial<UniversalProviderApps>,
): UniversalProviderApps => ({
  claude: apps.claude ?? false,
  "claude-desktop": apps["claude-desktop"] ?? false,
  codex: apps.codex ?? false,
  pi: apps.pi ?? false,
  gemini: apps.gemini ?? false,
  grokbuild: apps.grokbuild ?? false,
  opencode: apps.opencode ?? false,
  openclaw: apps.openclaw ?? false,
  hermes: apps.hermes ?? false,
});

const simpleModelApps: AppId[] = [
  "claude-desktop",
  "pi",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

type UniversalProviderField = "name" | "baseUrl" | "apiKey" | "apps";

type UniversalProviderErrors = Partial<Record<UniversalProviderField, string>>;

interface UniversalProviderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: UniversalProvider) => Promise<void> | void;
  onSaveAndSync?: (provider: UniversalProvider) => Promise<void> | void;
  editingProvider?: UniversalProvider | null;
  initialPreset?: UniversalProviderPreset | null;
}

export function UniversalProviderFormModal({
  isOpen,
  onClose,
  onSave,
  onSaveAndSync,
  editingProvider,
  initialPreset,
}: UniversalProviderFormModalProps) {
  const { t } = useTranslation();
  const isEditMode = !!editingProvider;

  // 表单状态
  const [selectedPreset, setSelectedPreset] =
    useState<UniversalProviderPreset | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<UniversalProviderErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [apps, setApps] = useState<UniversalProviderApps>(() =>
    normalizeApps(universalProviderPresets[0].defaultApps),
  );

  // 模型配置
  const [models, setModels] = useState<UniversalProviderModels>({});

  // 保存并同步确认弹窗
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [pendingProvider, setPendingProvider] =
    useState<UniversalProvider | null>(null);

  // 初始化表单
  useEffect(() => {
    if (editingProvider) {
      // 编辑模式：加载现有数据
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl);
      setApiKey(editingProvider.apiKey);
      setWebsiteUrl(editingProvider.websiteUrl || "");
      setNotes(editingProvider.notes || "");
      setApps(normalizeApps(editingProvider.apps));
      setModels(editingProvider.models || {});

      // 尝试匹配预设
      const preset = universalProviderPresets.find(
        (p) => p.providerType === editingProvider.providerType,
      );
      setSelectedPreset(preset || null);
    } else {
      // 新建模式：使用传入的预设或默认选择第一个预设
      const defaultPreset = initialPreset || universalProviderPresets[0];
      setSelectedPreset(defaultPreset);
      setName(defaultPreset.name);
      setBaseUrl("");
      setApiKey("");
      setWebsiteUrl(defaultPreset.websiteUrl || "");
      setNotes("");
      setApps(normalizeApps(defaultPreset.defaultApps));
      setModels(deepClone(defaultPreset.defaultModels));
    }
    setErrors({});
    setIsSubmitting(false);
  }, [editingProvider, initialPreset, isOpen]);

  // 选择预设
  const handlePresetSelect = useCallback(
    (preset: UniversalProviderPreset) => {
      setSelectedPreset(preset);
      if (!isEditMode) {
        setName(preset.name);
        setApps(normalizeApps(preset.defaultApps));
        setModels(deepClone(preset.defaultModels));
      }
    },
    [isEditMode],
  );

  // 更新模型配置
  const updateModel = useCallback(
    (app: keyof UniversalProviderModels, field: string, value: string) => {
      setModels((prev) => ({
        ...prev,
        [app]: {
          ...(prev[app] || {}),
          [field]: value,
        },
      }));
    },
    [],
  );

  const updateApp = useCallback((app: AppId, enabled: boolean) => {
    setApps((current) => ({ ...current, [app]: enabled }));
    setErrors((current) => ({ ...current, apps: undefined }));
  }, []);

  const validateForm = useCallback(() => {
    const nextErrors: UniversalProviderErrors = {};
    if (!name.trim()) {
      nextErrors.name = t("universalProvider.nameRequired", {
        defaultValue: "供应商名称不能为空。",
      });
    }
    if (!baseUrl.trim()) {
      nextErrors.baseUrl = t("universalProvider.baseUrlRequired", {
        defaultValue: "API 地址不能为空。",
      });
    } else {
      try {
        const url = new URL(baseUrl.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          nextErrors.baseUrl = t("universalProvider.baseUrlInvalid", {
            defaultValue: "API 地址必须使用 HTTP 或 HTTPS。",
          });
        }
      } catch {
        nextErrors.baseUrl = t("universalProvider.baseUrlInvalid", {
          defaultValue: "API 地址必须使用 HTTP 或 HTTPS。",
        });
      }
    }
    if (!apiKey.trim()) {
      nextErrors.apiKey = t("universalProvider.apiKeyRequired", {
        defaultValue: "API Key 不能为空。",
      });
    }
    if (!APP_IDS.some((appId) => apps[appId])) {
      nextErrors.apps = t("universalProvider.appsRequired", {
        defaultValue: "请至少启用一个应用。",
      });
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [apiKey, apps, baseUrl, name, t]);

  const buildProvider = useCallback((): UniversalProvider | null => {
    if (!validateForm()) {
      return null;
    }

    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const baseProvider = editingProvider
      ? editingProvider
      : createUniversalProviderFromPreset(
          selectedPreset || universalProviderPresets[0],
          crypto.randomUUID(),
          normalizedBaseUrl,
          apiKey.trim(),
          name.trim(),
        );

    return {
      ...baseProvider,
      name: name.trim(),
      baseUrl: normalizedBaseUrl,
      apiKey: apiKey.trim(),
      websiteUrl: websiteUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      apps,
      models,
    };
  }, [
    validateForm,
    editingProvider,
    name,
    baseUrl,
    apiKey,
    websiteUrl,
    notes,
    apps,
    models,
    selectedPreset,
  ]);

  const handleSubmit = useCallback(async () => {
    const provider = buildProvider();
    if (!provider) return;

    setIsSubmitting(true);
    try {
      await onSave(provider);
      onClose();
    } catch {
      return;
    } finally {
      setIsSubmitting(false);
    }
  }, [buildProvider, onClose, onSave]);

  const handleSaveAndSyncClick = useCallback(() => {
    const provider = buildProvider();
    if (!provider || !onSaveAndSync) return;

    setPendingProvider(provider);
    setSyncConfirmOpen(true);
  }, [buildProvider, onSaveAndSync]);

  const confirmSaveAndSync = useCallback(async () => {
    if (!pendingProvider || !onSaveAndSync) return;

    setSyncConfirmOpen(false);
    setPendingProvider(null);
    setIsSubmitting(true);
    try {
      await onSaveAndSync(pendingProvider);
      onClose();
    } catch {
      return;
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingProvider, onSaveAndSync, onClose]);

  const footer = (
    <>
      <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
        {t("common.cancel", { defaultValue: "取消" })}
      </Button>
      {isEditMode && onSaveAndSync ? (
        <Button onClick={handleSaveAndSyncClick} disabled={isSubmitting}>
          <RefreshCw
            className={`mr-1.5 h-4 w-4 ${isSubmitting ? "animate-spin" : ""}`}
          />
          {t("universalProvider.saveAndSync", { defaultValue: "保存并同步" })}
        </Button>
      ) : (
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {t("common.add", { defaultValue: "添加" })}
        </Button>
      )}
    </>
  );

  return (
    <FullScreenPanel
      isOpen={isOpen}
      title={
        isEditMode
          ? t("universalProvider.edit", { defaultValue: "编辑统一供应商" })
          : t("universalProvider.add", { defaultValue: "添加统一供应商" })
      }
      onClose={onClose}
      footer={footer}
      contentClassName={providerPanelContentClassName}
      footerClassName={providerPanelFooterClassName}
    >
      <div className={providerFormClassName}>
        {!isEditMode && (
          <ProviderFormSection
            title={t("universalProvider.selectPreset", {
              defaultValue: "Select preset",
            })}
          >
            <div className="flex flex-wrap gap-2">
              {universalProviderPresets.map((preset) => (
                <button
                  key={preset.providerType}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    selectedPreset?.providerType === preset.providerType
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-default bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <ProviderIcon
                    icon={preset.icon}
                    name={preset.name}
                    size={16}
                  />
                  {preset.name}
                </button>
              ))}
            </div>
            {selectedPreset?.description && (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {selectedPreset.description}
              </p>
            )}
          </ProviderFormSection>
        )}

        <ProviderFormSection
          title={t("providerForm.identityTitle", {
            defaultValue: "Provider identity",
          })}
          contentClassName="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="name">
              {t("universalProvider.name", { defaultValue: "名称" })}
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
              placeholder={t("universalProvider.namePlaceholder", {
                defaultValue: "例如：我的 NewAPI",
              })}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">
              {t("universalProvider.baseUrl", { defaultValue: "API 地址" })}
            </Label>
            <Input
              id="baseUrl"
              type="url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setErrors((current) => ({ ...current, baseUrl: undefined }));
              }}
              aria-invalid={Boolean(errors.baseUrl)}
              aria-describedby={errors.baseUrl ? "base-url-error" : undefined}
              placeholder="https://api.example.com"
              spellCheck={false}
            />
            {errors.baseUrl && (
              <p id="base-url-error" className="text-xs text-destructive">
                {errors.baseUrl}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {t("universalProvider.apiKey", { defaultValue: "API Key" })}
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setErrors((current) => ({ ...current, apiKey: undefined }));
                }}
                aria-invalid={Boolean(errors.apiKey)}
                aria-describedby={errors.apiKey ? "api-key-error" : undefined}
                placeholder="sk-…"
                className="pr-10"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={
                  showApiKey
                    ? t("apiKeyInput.hide", { defaultValue: "Hide API Key" })
                    : t("apiKeyInput.show", { defaultValue: "Show API Key" })
                }
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errors.apiKey && (
              <p id="api-key-error" className="text-xs text-destructive">
                {errors.apiKey}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="websiteUrl">
              {t("universalProvider.websiteUrl", { defaultValue: "官网地址" })}
            </Label>
            <Input
              id="websiteUrl"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder={t("universalProvider.websiteUrlPlaceholder", {
                defaultValue: "https://example.com（可选，用于在列表中显示）",
              })}
              spellCheck={false}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              {t("universalProvider.notes", { defaultValue: "备注" })}
            </Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("universalProvider.notesPlaceholder", {
                defaultValue: "可选：添加备注信息",
              })}
            />
          </div>
        </ProviderFormSection>

        <ProviderFormSection
          title={t("universalProvider.enabledApps", {
            defaultValue: "Enabled apps",
          })}
          description={t("universalProvider.enabledAppsHint", {
            defaultValue: "Choose where this provider should be generated.",
          })}
        >
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border-default bg-border-default sm:grid-cols-2 lg:grid-cols-3">
            {APP_IDS.map((appId) => (
              <label
                key={appId}
                className="flex min-h-12 cursor-pointer items-center gap-3 bg-background px-3 py-2.5"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border-default bg-muted/40">
                  {APP_ICON_MAP[appId].icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t(`apps.${appId}`, {
                    defaultValue: APP_ICON_MAP[appId].label,
                  })}
                </span>
                <Switch
                  checked={apps[appId]}
                  onCheckedChange={(checked) => updateApp(appId, checked)}
                  aria-label={t(`apps.${appId}`, {
                    defaultValue: APP_ICON_MAP[appId].label,
                  })}
                />
              </label>
            ))}
          </div>
          {errors.apps && (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {errors.apps}
            </p>
          )}
        </ProviderFormSection>

        <ProviderFormSection
          title={t("universalProvider.modelConfig", {
            defaultValue: "Model configuration",
          })}
          contentClassName="divide-y divide-border-default py-0"
        >
          {apps.claude && (
            <div className="space-y-3 py-5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2 font-medium">
                {APP_ICON_MAP.claude.icon}
                {APP_ICON_MAP.claude.label}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="universal-claude-model" className="text-xs">
                    {t("universalProvider.model", { defaultValue: "主模型" })}
                  </Label>
                  <Input
                    id="universal-claude-model"
                    value={models.claude?.model || ""}
                    onChange={(e) =>
                      updateModel("claude", "model", e.target.value)
                    }
                    placeholder="claude-sonnet-5"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="universal-claude-haiku" className="text-xs">
                    Haiku
                  </Label>
                  <Input
                    id="universal-claude-haiku"
                    value={models.claude?.haikuModel || ""}
                    onChange={(e) =>
                      updateModel("claude", "haikuModel", e.target.value)
                    }
                    placeholder="claude-haiku-4-5-20251001"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="universal-claude-sonnet" className="text-xs">
                    Sonnet
                  </Label>
                  <Input
                    id="universal-claude-sonnet"
                    value={models.claude?.sonnetModel || ""}
                    onChange={(e) =>
                      updateModel("claude", "sonnetModel", e.target.value)
                    }
                    placeholder="claude-sonnet-5"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="universal-claude-opus" className="text-xs">
                    Opus
                  </Label>
                  <Input
                    id="universal-claude-opus"
                    value={models.claude?.opusModel || ""}
                    onChange={(e) =>
                      updateModel("claude", "opusModel", e.target.value)
                    }
                    placeholder="claude-opus-5"
                  />
                </div>
              </div>
            </div>
          )}

          {apps.codex && (
            <div className="space-y-3 py-5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2 font-medium">
                {APP_ICON_MAP.codex.icon}
                {APP_ICON_MAP.codex.label}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="universal-codex-model" className="text-xs">
                    {t("universalProvider.model", { defaultValue: "模型" })}
                  </Label>
                  <Input
                    id="universal-codex-model"
                    value={models.codex?.model || ""}
                    onChange={(e) =>
                      updateModel("codex", "model", e.target.value)
                    }
                    placeholder="gpt-5.6-sol"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="universal-codex-reasoning"
                    className="text-xs"
                  >
                    Reasoning Effort
                  </Label>
                  <Input
                    id="universal-codex-reasoning"
                    value={models.codex?.reasoningEffort || ""}
                    onChange={(e) =>
                      updateModel("codex", "reasoningEffort", e.target.value)
                    }
                    placeholder="high"
                  />
                </div>
              </div>
            </div>
          )}

          {apps.gemini && (
            <div className="space-y-3 py-5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2 font-medium">
                {APP_ICON_MAP.gemini.icon}
                {APP_ICON_MAP.gemini.label}
              </div>
              <div className="space-y-1">
                <Label htmlFor="universal-gemini-model" className="text-xs">
                  {t("universalProvider.model", { defaultValue: "模型" })}
                </Label>
                <Input
                  id="universal-gemini-model"
                  value={models.gemini?.model || ""}
                  onChange={(e) =>
                    updateModel("gemini", "model", e.target.value)
                  }
                  placeholder="gemini-3.6-flash"
                />
              </div>
            </div>
          )}

          {simpleModelApps.map((appId) => {
            if (!apps[appId]) return null;
            const modelConfig = models[appId] as { model?: string } | undefined;
            return (
              <div key={appId} className="space-y-3 py-5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 font-medium">
                  {APP_ICON_MAP[appId].icon}
                  {APP_ICON_MAP[appId].label}
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`universal-${appId}-model`}
                    className="text-xs"
                  >
                    {t("universalProvider.model", { defaultValue: "Model" })}
                  </Label>
                  <Input
                    id={`universal-${appId}-model`}
                    value={modelConfig?.model || ""}
                    onChange={(event) =>
                      updateModel(appId, "model", event.target.value)
                    }
                    placeholder={
                      appId === "claude-desktop"
                        ? "claude-sonnet-5"
                        : "gpt-5.6-sol"
                    }
                  />
                </div>
              </div>
            );
          })}
        </ProviderFormSection>
      </div>

      <ConfirmDialog
        isOpen={syncConfirmOpen}
        title={t("universalProvider.syncConfirmTitle", {
          defaultValue: "同步统一供应商",
        })}
        message={t("universalProvider.syncConfirmDescription", {
          defaultValue: `同步 "${name}" 将会更新所有已启用应用中的关联供应商配置。确定要继续吗？`,
          name: name,
        })}
        confirmText={t("universalProvider.saveAndSync", {
          defaultValue: "保存并同步",
        })}
        onConfirm={confirmSaveAndSync}
        onCancel={() => {
          setSyncConfirmOpen(false);
          setPendingProvider(null);
        }}
      />
    </FullScreenPanel>
  );
}
