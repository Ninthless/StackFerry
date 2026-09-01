import { useMemo, useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import JsonEditor from "@/shared/editor/JsonEditor";
import { Button } from "@/shared/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { useDarkMode } from "@/shared/hooks/useDarkMode";
import {
  fetchModelsForConfig,
  showFetchModelsError,
  type FetchedModel,
} from "@/platform/tauri/api/model-fetch";
import { cn } from "@/lib/utils";
import type {
  PiModelConfig,
  PiProviderApi,
  PiProviderConfig,
} from "@/shared/contracts";
import {
  piProviderPresets,
  withPiDefaultHeaders,
} from "@/features/providers/config/piProviderPresets";

import type { ProviderFormProps, ProviderFormValues } from "./ProviderForm";
import { ProviderPresetSelector } from "./ProviderPresetSelector";
import {
  ProviderFormSection,
  providerFormClassName,
} from "./ProviderFormLayout";

const PI_APIS: Array<{ value: PiProviderApi; label: string }> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-codex-responses", label: "OpenAI Codex Responses" },
  { value: "azure-openai-responses", label: "Azure OpenAI Responses" },
  { value: "openai-completions", label: "OpenAI Chat Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
  { value: "google-vertex", label: "Google Vertex AI" },
  { value: "bedrock-converse-stream", label: "Amazon Bedrock Converse" },
  { value: "mistral-conversations", label: "Mistral Conversations" },
  { value: "pi-messages", label: "Pi Messages" },
  { value: "openrouter-images", label: "OpenRouter Images" },
];

type PiModelDraft = {
  key: string;
  id: string;
  name: string;
  reasoning: boolean;
  imageInput: boolean;
  contextWindow: string;
  maxTokens: string;
  extra: Record<string, unknown>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createModelDraft = (model?: PiModelConfig): PiModelDraft => {
  const source: Record<string, unknown> = model ? { ...model } : {};
  delete source.id;
  delete source.name;
  delete source.reasoning;
  delete source.input;
  delete source.contextWindow;
  delete source.maxTokens;
  return {
    key: crypto.randomUUID(),
    id: model?.id ?? "",
    name: model?.name ?? "",
    reasoning: model?.reasoning === true,
    imageInput: model?.input?.includes("image") === true,
    contextWindow: model?.contextWindow ? String(model.contextWindow) : "",
    maxTokens: model?.maxTokens ? String(model.maxTokens) : "",
    extra: source,
  };
};

const parseObjectEditor = (value: string, label: string) => {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value);
  if (!isObject(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
};

const positiveInteger = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export function PiProviderForm({
  providerId,
  submitLabel,
  onSubmit,
  onCancel,
  onSubmittingChange,
  initialData,
  showButtons = true,
}: ProviderFormProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const initialConfig = useMemo<PiProviderConfig>(() => {
    const value = initialData?.settingsConfig;
    return isObject(value)
      ? (value as unknown as PiProviderConfig)
      : {
          baseUrl: "",
          api: "openai-responses",
          models: [],
        };
  }, [initialData?.settingsConfig]);
  const [name, setName] = useState(initialData?.name ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl ?? "");
  const [providerKey, setProviderKey] = useState(
    providerId ??
      (typeof initialConfig.providerKey === "string"
        ? initialConfig.providerKey
        : ""),
  );
  const [api, setApi] = useState<PiProviderApi>(
    PI_APIS.some((option) => option.value === initialConfig.api)
      ? initialConfig.api
      : "openai-responses",
  );
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(
    typeof initialConfig.apiKey === "string" ? initialConfig.apiKey : "",
  );
  const [authHeader, setAuthHeader] = useState(
    initialConfig.authHeader !== false,
  );
  const [models, setModels] = useState<PiModelDraft[]>(() => {
    const configured = Array.isArray(initialConfig.models)
      ? initialConfig.models.map((model) => createModelDraft(model))
      : [];
    return configured.length > 0 ? configured : [createModelDraft()];
  });
  const [expandedModelKeys, setExpandedModelKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [defaultModel, setDefaultModel] = useState(
    initialConfig.defaultModel ?? initialConfig.models?.[0]?.id ?? "",
  );
  const [headers, setHeaders] = useState(() =>
    JSON.stringify(withPiDefaultHeaders(initialConfig.headers), null, 2),
  );
  const [compat, setCompat] = useState(() =>
    JSON.stringify(initialConfig.compat ?? {}, null, 2),
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    initialData ? null : "custom",
  );
  const [selectedCategory, setSelectedCategory] = useState(
    initialData?.category ?? "custom",
  );
  const [icon, setIcon] = useState(initialData?.icon ?? "");
  const [iconColor, setIconColor] = useState(initialData?.iconColor ?? "");
  const presetEntries = useMemo(
    () =>
      piProviderPresets.map((preset, index) => ({
        id: `pi-${index}`,
        preset,
      })),
    [],
  );
  const presetCategoryLabels = useMemo(
    () => ({
      official: t("providerPreset.official"),
      cn_official: t("providerPreset.cnOfficial"),
      cloud_provider: t("providerPreset.cloudProvider"),
      aggregator: t("providerPreset.aggregator"),
      third_party: t("providerPreset.thirdParty"),
      custom: t("providerPreset.custom"),
    }),
    [t],
  );

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === "custom") {
      setSelectedCategory("custom");
      return;
    }
    const entry = presetEntries.find((item) => item.id === presetId);
    if (!entry) return;
    const preset = entry.preset;
    const config = preset.settingsConfig;
    setName(preset.name);
    setProviderKey(preset.providerKey);
    setWebsiteUrl(preset.websiteUrl);
    setApi(config.api);
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey ?? "");
    setAuthHeader(config.authHeader !== false);
    setModels(config.models.map((model) => createModelDraft(model)));
    setDefaultModel(config.defaultModel ?? config.models[0]?.id ?? "");
    setExpandedModelKeys(new Set());
    setFetchedModels([]);
    setModelPickerOpen(false);
    setHeaders(JSON.stringify(config.headers ?? {}, null, 2));
    setCompat(JSON.stringify(config.compat ?? {}, null, 2));
    setSelectedCategory(preset.category ?? "custom");
    setIcon(preset.icon ?? "");
    setIconColor(preset.iconColor ?? "");
  };

  const updateModel = (key: string, patch: Partial<PiModelDraft>) => {
    setModels((current) =>
      current.map((model) =>
        model.key === key ? { ...model, ...patch } : model,
      ),
    );
  };

  const updateModelId = (key: string, previousId: string, nextId: string) => {
    updateModel(key, { id: nextId });
    setDefaultModel((current) =>
      current === previousId.trim() ? nextId.trim() : current,
    );
  };

  const removeModel = (key: string) => {
    const removed = models.find((model) => model.key === key);
    const remaining = models.filter((model) => model.key !== key);
    setModels(remaining);
    setExpandedModelKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (removed && defaultModel === removed.id.trim()) {
      setDefaultModel(
        remaining.find((model) => model.id.trim())?.id.trim() ?? "",
      );
    }
  };

  const addFetchedModel = (fetchedModel: FetchedModel) => {
    const normalizedId = fetchedModel.id.trim();
    if (!normalizedId) return;
    setModels((current) => {
      if (current.some((model) => model.id.trim() === normalizedId)) {
        return current;
      }
      const imported = createModelDraft({
        id: normalizedId,
      });
      if (current.length === 1 && !current[0].id.trim()) {
        return [imported];
      }
      return [...current, imported];
    });
    setDefaultModel((current) => current || normalizedId);
  };

  const handleFetchModels = async () => {
    const normalizedBaseUrl = baseUrl.trim();
    const normalizedApiKey = apiKey.trim();
    if (!normalizedBaseUrl || (authHeader && !normalizedApiKey)) {
      showFetchModelsError(null, t, {
        hasApiKey: !authHeader || Boolean(normalizedApiKey),
        hasBaseUrl: Boolean(normalizedBaseUrl),
      });
      return;
    }
    setIsFetchingModels(true);
    try {
      const fetched = await fetchModelsForConfig(
        normalizedBaseUrl,
        normalizedApiKey,
        false,
        undefined,
        undefined,
        authHeader,
      );
      setFetchedModels(fetched);
      if (fetched.length === 0) {
        setModelPickerOpen(false);
        toast.info(t("providerForm.fetchModelsEmpty"));
        return;
      }
      setModelPickerOpen(true);
      toast.success(
        t("providerForm.fetchModelsSuccess", { count: fetched.length }),
      );
    } catch (error) {
      setModelPickerOpen(false);
      showFetchModelsError(error, t);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const configuredModelIds = useMemo(
    () => new Set(models.map((model) => model.id.trim()).filter(Boolean)),
    [models],
  );
  const effectiveDefaultModel =
    defaultModel.trim() ||
    models.find((model) => model.id.trim())?.id.trim() ||
    "";
  const selectedDefaultModel = useMemo(
    () => models.find((model) => model.id.trim() === effectiveDefaultModel),
    [effectiveDefaultModel, models],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedKey = providerKey.trim();
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    if (!normalizedName) {
      toast.error(t("pi.form.nameRequired"));
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalizedKey)) {
      toast.error(t("pi.form.providerKeyInvalid"));
      return;
    }
    const usesManagedOAuth =
      typeof initialConfig.oauth === "string" && initialConfig.oauth.trim();
    const usesExternalCredentials = [
      "openai-codex-responses",
      "google-vertex",
      "bedrock-converse-stream",
    ].includes(api);
    if (!apiKey.trim() && !usesManagedOAuth && !usesExternalCredentials) {
      toast.error(t("pi.form.apiKeyRequired"));
      return;
    }
    try {
      const url = new URL(normalizedBaseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("protocol");
      }
    } catch {
      toast.error(t("pi.form.baseUrlInvalid"));
      return;
    }
    const normalizedIds = models.map((model) => model.id.trim());
    if (normalizedIds.some((id) => !id)) {
      toast.error(t("pi.form.modelIdRequired"));
      return;
    }
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      toast.error(t("pi.form.modelIdDuplicate"));
      return;
    }
    const normalizedDefault = defaultModel.trim() || normalizedIds[0];
    if (!normalizedIds.includes(normalizedDefault)) {
      toast.error(t("pi.form.defaultModelInvalid"));
      return;
    }

    let parsedHeaders: Record<string, unknown>;
    let parsedCompat: Record<string, unknown>;
    try {
      parsedHeaders = parseObjectEditor(headers, "headers");
      parsedCompat = parseObjectEditor(compat, "compat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return;
    }

    const normalizedModels: PiModelConfig[] = [];
    for (const model of models) {
      const contextWindow = positiveInteger(model.contextWindow);
      const maxTokens = positiveInteger(model.maxTokens);
      if (contextWindow === null || maxTokens === null) {
        toast.error(t("pi.form.tokenLimitInvalid"));
        return;
      }
      const normalized: PiModelConfig = {
        ...model.extra,
        id: model.id.trim(),
        reasoning: model.reasoning,
        input: model.imageInput ? ["text", "image"] : ["text"],
      };
      if (model.name.trim()) normalized.name = model.name.trim();
      else delete normalized.name;
      if (contextWindow) normalized.contextWindow = contextWindow;
      else delete normalized.contextWindow;
      if (maxTokens) normalized.maxTokens = maxTokens;
      else delete normalized.maxTokens;
      normalizedModels.push(normalized);
    }

    const config: PiProviderConfig = {
      ...initialConfig,
      baseUrl: normalizedBaseUrl,
      api,
      apiKey: apiKey.trim(),
      authHeader,
      defaultModel: normalizedDefault,
      models: normalizedModels,
    };
    if (!apiKey.trim()) delete config.apiKey;
    delete config.providerKey;
    config.headers = withPiDefaultHeaders(
      parsedHeaders as Record<string, string>,
    );
    if (Object.keys(parsedCompat).length > 0) config.compat = parsedCompat;
    else delete config.compat;

    const values: ProviderFormValues = {
      name: normalizedName,
      notes: notes.trim(),
      websiteUrl: websiteUrl.trim(),
      settingsConfig: JSON.stringify(config),
      icon: initialData?.icon,
      iconColor,
      providerKey: normalizedKey,
      presetId: selectedPresetId ?? undefined,
      presetCategory: selectedCategory,
    };
    values.icon = icon;
    onSubmittingChange?.(true);
    try {
      await onSubmit(values);
    } finally {
      onSubmittingChange?.(false);
    }
  };

  return (
    <form
      id="provider-form"
      onSubmit={handleSubmit}
      className={providerFormClassName}
    >
      {!initialData && (
        <ProviderPresetSelector
          selectedPresetId={selectedPresetId}
          presetEntries={presetEntries}
          presetCategoryLabels={presetCategoryLabels}
          onPresetChange={handlePresetChange}
          category={selectedCategory}
        />
      )}

      <ProviderFormSection
        title={t("providerForm.identityTitle", {
          defaultValue: "Provider identity",
        })}
        contentClassName="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="pi-name">{t("provider.name")}</Label>
          <Input
            id="pi-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pi-provider-key">{t("pi.form.providerKey")}</Label>
          <Input
            id="pi-provider-key"
            value={providerKey}
            onChange={(event) => setProviderKey(event.target.value)}
            disabled={Boolean(providerId)}
            spellCheck={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pi-website">{t("provider.websiteUrl")}</Label>
          <Input
            id="pi-website"
            type="url"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pi-notes">{t("provider.notes")}</Label>
          <Input
            id="pi-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </ProviderFormSection>

      <ProviderFormSection
        title={t("pi.form.connection")}
        description={t("pi.form.connectionDescription")}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pi-api">{t("pi.form.api")}</Label>
            <Select
              value={api}
              onValueChange={(value) => setApi(value as PiProviderApi)}
            >
              <SelectTrigger id="pi-api">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PI_APIS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("pi.form.apiDescription")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-base-url">{t("pi.form.baseUrl")}</Label>
            <Input
              id="pi-base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("pi.form.baseUrlDescription")}
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="pi-api-key">{t("pi.form.apiKey")}</Label>
            <Input
              id="pi-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("pi.form.credentialStorageHint")}
            </p>
          </div>
          <div className="flex items-center justify-between border-y border-border py-3 md:col-span-2">
            <Label htmlFor="pi-auth-header">{t("pi.form.authHeader")}</Label>
            <Switch
              id="pi-auth-header"
              checked={authHeader}
              onCheckedChange={setAuthHeader}
            />
          </div>
        </div>
      </ProviderFormSection>

      <ProviderFormSection
        title={t("pi.form.models")}
        description={t("pi.form.modelsDescription")}
        className="border-b-0"
        actions={
          <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
            <Popover
              open={modelPickerOpen}
              onOpenChange={(open) => {
                if (!open) setModelPickerOpen(false);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFetchModels}
                  disabled={isFetchingModels}
                  className="gap-1.5"
                >
                  {isFetchingModels ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {t("providerForm.fetchModels")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(360px,90vw)] p-0">
                <Command>
                  <CommandInput placeholder={t("pi.form.searchModels")} />
                  <CommandList>
                    <CommandEmpty>{t("pi.form.noFetchedModels")}</CommandEmpty>
                    <CommandGroup>
                      {fetchedModels.map((fetchedModel) => {
                        const configured = configuredModelIds.has(
                          fetchedModel.id.trim(),
                        );
                        return (
                          <CommandItem
                            key={fetchedModel.id}
                            value={`${fetchedModel.id} ${fetchedModel.ownedBy ?? ""}`}
                            disabled={configured}
                            onSelect={() => addFetchedModel(fetchedModel)}
                          >
                            <Check
                              className={cn(
                                "h-4 w-4",
                                configured ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {fetchedModel.id}
                            </span>
                            {fetchedModel.ownedBy && (
                              <span className="max-w-24 truncate text-xs text-muted-foreground">
                                {fetchedModel.ownedBy}
                              </span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setModels((current) => [...current, createModelDraft()])
              }
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("pi.form.addModel")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {models.map((model, index) => (
            <Collapsible
              key={model.key}
              open={expandedModelKeys.has(model.key)}
              onOpenChange={(open) =>
                setExpandedModelKeys((current) => {
                  const next = new Set(current);
                  if (open) next.add(model.key);
                  else next.delete(model.key);
                  return next;
                })
              }
              className="rounded-md border border-border-default bg-card"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-0.5 h-8 w-8"
                    aria-label={t("pi.form.modelCapabilities", {
                      number: index + 1,
                    })}
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expandedModelKeys.has(model.key) && "rotate-90",
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`pi-model-id-${model.key}`}>
                    {t("pi.form.modelId")}
                  </Label>
                  <Input
                    id={`pi-model-id-${model.key}`}
                    value={model.id}
                    onChange={(event) =>
                      updateModelId(model.key, model.id, event.target.value)
                    }
                    spellCheck={false}
                  />
                </div>
                <div className="col-start-2 min-w-0 space-y-1.5 md:col-start-auto">
                  <Label htmlFor={`pi-model-name-${model.key}`}>
                    {t("pi.form.modelName")}
                  </Label>
                  <Input
                    id={`pi-model-name-${model.key}`}
                    value={model.name}
                    onChange={(event) =>
                      updateModel(model.key, { name: event.target.value })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeModel(model.key)}
                  disabled={models.length === 1}
                  aria-label={t("pi.form.removeModel")}
                  className="mb-0.5 h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <CollapsibleContent className="border-t border-border-default px-3 py-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`pi-context-${model.key}`}>
                      {t("pi.form.contextWindow")}
                    </Label>
                    <Input
                      id={`pi-context-${model.key}`}
                      inputMode="numeric"
                      value={model.contextWindow}
                      onChange={(event) =>
                        updateModel(model.key, {
                          contextWindow: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pi-max-tokens-${model.key}`}>
                      {t("pi.form.maxTokens")}
                    </Label>
                    <Input
                      id={`pi-max-tokens-${model.key}`}
                      inputMode="numeric"
                      value={model.maxTokens}
                      onChange={(event) =>
                        updateModel(model.key, {
                          maxTokens: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border-default bg-muted/20 px-3 py-2.5">
                    <Label htmlFor={`pi-reasoning-${model.key}`}>
                      {t("pi.form.reasoning")}
                    </Label>
                    <Switch
                      id={`pi-reasoning-${model.key}`}
                      checked={model.reasoning}
                      onCheckedChange={(checked) =>
                        updateModel(model.key, { reasoning: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border-default bg-muted/20 px-3 py-2.5">
                    <Label htmlFor={`pi-image-${model.key}`}>
                      {t("pi.form.imageInput")}
                    </Label>
                    <Switch
                      id={`pi-image-${model.key}`}
                      checked={model.imageInput}
                      onCheckedChange={(checked) =>
                        updateModel(model.key, { imageInput: checked })
                      }
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="pi-default-model">{t("pi.form.defaultModel")}</Label>
          <Select value={effectiveDefaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger id="pi-default-model">
              <SelectValue>
                {selectedDefaultModel?.name.trim() ||
                  selectedDefaultModel?.id.trim()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {models
                .filter((model) => model.id.trim())
                .map((model) => (
                  <SelectItem key={model.key} value={model.id.trim()}>
                    {model.name.trim() || model.id.trim()}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </ProviderFormSection>

      <Accordion
        type="single"
        collapsible
        className="rounded-md border border-border-default bg-card px-5 sm:px-6"
      >
        <AccordionItem value="advanced" className="border-b-0">
          <AccordionTrigger className="text-sm">
            {t("pi.form.advanced")}
          </AccordionTrigger>
          <AccordionContent className="space-y-5">
            <div className="space-y-2">
              <Label>{t("pi.form.headers")}</Label>
              <JsonEditor
                value={headers}
                onChange={setHeaders}
                darkMode={darkMode}
                rows={7}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("pi.form.compat")}</Label>
              <JsonEditor
                value={compat}
                onChange={setCompat}
                darkMode={darkMode}
                rows={7}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {showButtons && (
        <div className="flex justify-end gap-2 border-t border-border pt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{submitLabel}</Button>
        </div>
      )}
    </form>
  );
}
