import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { AlignLeft } from "lucide-react"
import type { GrokApiBackend, GrokPreset, GrokProviderDraft, GrokProviderListItem, ProviderKind } from "@shared/types"
import { isGrokApiBackend } from "@shared/grok-presets"
import {
  formatGrokOverlayToml,
  grokOverlayIdentity,
  hydrateGrokOverlay,
  parseGrokOverlayToml,
  withGrokOverlayIdentity,
  type GrokOverlayIdentity,
} from "@shared/grok-session"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatAppError } from "@/lib/format-app-error"
import { grokPresetLabel } from "@/lib/preset-label"
import { HintLabel } from "@/features/settings/settings-hint"
import { missingText, nonHttpUrl, useEditorSubmit } from "@/features/providers/editor-validation"
import { ApiKeyInput } from "@/features/providers/api-key-input"
import * as m from "@/paraglide/messages.js"
import { TomlEditor } from "@/features/providers/toml-editor"
import { GrokModelField } from "./grok-model-field"
import { GrokImageFields } from "./grok-image-fields"
import { GrokSessionFields } from "./grok-session-fields"

type Props = {
  open: boolean
  presets: GrokPreset[]
  editing: GrokProviderListItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: GrokProviderDraft) => Promise<void>
}

export function GrokProviderEditor({ open, presets, editing, onOpenChange, onSubmit }: Props) {
  const formId = useId()
  const [presetId, setPresetId] = useState("custom")
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [apiBackend, setApiBackend] = useState<GrokApiBackend>("responses")
  const [apiKey, setApiKey] = useState("")
  const [imageModel, setImageModel] = useState("")
  const [videoModel, setVideoModel] = useState("")
  const [imageBaseUrl, setImageBaseUrl] = useState("")
  const [imageApiKey, setImageApiKey] = useState("")
  const [catalogModels, setCatalogModels] = useState<string[]>([])
  const [overlayToml, setOverlayToml] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const displayedEditingRef = useRef(editing)
  if (open) displayedEditingRef.current = editing
  const displayedEditing = displayedEditingRef.current

  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0]
  const presetItems = useMemo(
    () => presets.map((preset) => ({ label: grokPresetLabel(preset.id, preset.name), value: preset.id })),
    [presets],
  )
  const kind: ProviderKind = displayedEditing?.kind ?? selectedPreset?.kind ?? "custom"
  const rewriteLive = Boolean(displayedEditing?.enabled)
  const submitLabel = rewriteLive
    ? pending
      ? m.provider_enabling()
      : m.provider_enable()
    : pending
      ? m.action_saving()
      : m.action_save()
  const { submitted, markSubmitted } = useEditorSubmit(open)
  const requiresApiKey = kind === "custom" && (!displayedEditing || !displayedEditing.hasApiKey)
  const identity = grokOverlayIdentity(overlayToml)
  const liveName = kind === "custom" ? identity.name : name
  const liveBaseUrl = identity.baseUrl
  const liveModel = identity.model
  const liveBackend = isGrokApiBackend(identity.apiBackend) ? identity.apiBackend : apiBackend
  const nameInvalid = submitted && missingText(liveName)
  const baseUrlMissing = kind === "custom" && submitted && missingText(liveBaseUrl)
  const baseUrlInvalid = kind === "custom" && submitted && !missingText(liveBaseUrl) && nonHttpUrl(liveBaseUrl)
  const apiKeyInvalid = submitted && requiresApiKey && missingText(apiKey)
  const imageBaseUrlInvalid = submitted && !missingText(imageBaseUrl) && nonHttpUrl(imageBaseUrl)

  useEffect(() => {
    let cancelled = false
    if (!open) return () => { cancelled = true }
    setError("")
    setApiKey("")
    setImageApiKey("")
    if (editing) {
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setBaseUrl(editing.baseUrl)
      setModel(editing.model)
      setApiBackend(editing.apiBackend)
      setImageModel(editing.imageModel)
      setVideoModel(editing.videoModel)
      setImageBaseUrl(editing.imageBaseUrl)
      setOverlayToml(
        editing.kind === "custom"
          ? seedOverlay(editing.overlayToml, {
              name: editing.name,
              model: editing.model,
              baseUrl: editing.baseUrl,
              apiBackend: editing.apiBackend,
              effortLevel: editing.effortLevel,
              permissionMode: editing.permissionMode,
              contextWindow: editing.contextWindow,
              autoCompact: editing.autoCompact,
            })
          : "",
      )
    } else {
      const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
      setPresetId(initial?.id ?? "custom")
      setName(initial?.name ?? "")
      setBaseUrl(initial?.baseUrl ?? "")
      setModel(initial?.model ?? "")
      setApiBackend(initial?.apiBackend ?? "responses")
      setImageModel("")
      setVideoModel("")
      setImageBaseUrl("")
      setOverlayToml(
        initial?.kind === "custom"
          ? seedOverlay("", {
              name: initial.name,
              model: initial.model,
              baseUrl: initial.baseUrl,
              apiBackend: initial.apiBackend,
              effortLevel: "",
              permissionMode: "",
              contextWindow: "",
              autoCompact: "",
            })
          : "",
      )
    }
    if ((editing?.hasApiKey || editing?.hasImageApiKey) && window.stackferry) {
      void window.stackferry.readGrokProviderApiKeys(editing.id).then((keys) => {
        if (cancelled) return
        setApiKey(keys.apiKey)
        setImageApiKey(keys.imageApiKey)
      }).catch((loadError) => {
        if (!cancelled) setError(formatAppError(loadError))
      })
    }
    return () => {
      cancelled = true
    }
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || displayedEditing) return
    setName(preset.name)
    setBaseUrl(preset.baseUrl)
    setModel(preset.model)
    setApiBackend(preset.apiBackend)
    setImageModel("")
    setVideoModel("")
    setImageBaseUrl("")
    setImageApiKey("")
    setOverlayToml(
      preset.kind === "custom"
        ? seedOverlay("", {
            name: preset.name,
            model: preset.model,
            baseUrl: preset.baseUrl,
            apiBackend: preset.apiBackend,
            effortLevel: "",
            permissionMode: "",
            contextWindow: "",
            autoCompact: "",
          })
        : "",
    )
  }

  function patchIdentity(patch: Partial<GrokOverlayIdentity>): void {
    try {
      setOverlayToml(withGrokOverlayIdentity(overlayToml, patch))
      setError("")
    } catch {
      return
    }
  }

  function handleFormatOverlay(): void {
    try {
      setOverlayToml(formatGrokOverlayToml(overlayToml))
      setError("")
    } catch (formatError) {
      setError(formatAppError(formatError))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    markSubmitted()
    if (
      missingText(liveName) ||
      (kind === "custom" && (missingText(liveBaseUrl) || nonHttpUrl(liveBaseUrl))) ||
      (requiresApiKey && missingText(apiKey)) ||
      (!missingText(imageBaseUrl) && nonHttpUrl(imageBaseUrl))
    ) {
      return
    }
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name: liveName || name,
        kind,
        baseUrl: kind === "custom" ? liveBaseUrl || baseUrl : undefined,
        model: kind === "custom" ? liveModel || model : undefined,
        apiBackend: kind === "custom" ? liveBackend : undefined,
        apiKey: apiKey.trim() ? apiKey : undefined,
        imageModel: kind === "custom" ? imageModel : undefined,
        imageBaseUrl: kind === "custom" ? imageBaseUrl : undefined,
        imageApiKey: kind === "custom" && imageApiKey.trim() ? imageApiKey : undefined,
        videoModel: kind === "custom" ? videoModel : undefined,
        overlayToml: kind === "custom" ? overlayToml : undefined,
        presetId: editing ? undefined : presetId,
      })
    } catch (submitError) {
      setError(formatAppError(submitError))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={handleSubmit}>
          <SheetHeader>
            <SheetTitle>{displayedEditing ? m.editor_edit_title() : m.editor_add_title()}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <FieldGroup className="px-4 pb-4">
              {!displayedEditing ? (
                <Field>
                  <FieldLabel htmlFor={`${formId}-preset`}>{m.field_preset()}</FieldLabel>
                  <Select
                    items={presetItems}
                    value={presetId}
                    onValueChange={(value) => {
                      if (typeof value === "string") applyPreset(value)
                    }}
                  >
                    <SelectTrigger id={`${formId}-preset`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} side="bottom">
                      <SelectGroup>
                        {presetItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor={`${formId}-name`} required>
                  {m.field_name()}
                </FieldLabel>
                <Input
                  id={`${formId}-name`}
                  name="name"
                  aria-required
                  aria-invalid={nameInvalid || undefined}
                  autoComplete="off"
                  value={liveName}
                  onChange={(event) => {
                    const next = event.target.value
                    setName(next)
                    if (kind === "custom") patchIdentity({ name: next })
                  }}
                />
                {nameInvalid ? <FieldError>{m.error_provider_name_required()}</FieldError> : null}
              </Field>
              {kind === "custom" ? (
                <>
                  <Field data-invalid={baseUrlMissing || baseUrlInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-base-url`} required>
                      {m.grok_field_base_url()}
                    </FieldLabel>
                    <Input
                      id={`${formId}-base-url`}
                      name="baseUrl"
                      type="url"
                      aria-required
                      aria-invalid={baseUrlMissing || baseUrlInvalid || undefined}
                      autoComplete="url"
                      inputMode="url"
                      placeholder="https://api.example.com/v1"
                      value={liveBaseUrl}
                      onChange={(event) => {
                        setBaseUrl(event.target.value)
                        patchIdentity({ baseUrl: event.target.value })
                      }}
                    />
                    {baseUrlMissing ? <FieldError>{m.error_grok_base_url_required()}</FieldError> : null}
                    {baseUrlInvalid ? <FieldError>{m.error_grok_base_url_invalid()}</FieldError> : null}
                  </Field>
                  <FieldSet>
                    <FieldLegend variant="label">{m.grok_field_api_backend()}</FieldLegend>
                    <ToggleGroup
                      value={[liveBackend]}
                      onValueChange={(value) => {
                        const next = value[0]
                        if (!isGrokApiBackend(next)) return
                        setApiBackend(next)
                        patchIdentity({ apiBackend: next })
                      }}
                      variant="outline"
                    >
                      <ToggleGroupItem value="responses">{m.grok_backend_responses()}</ToggleGroupItem>
                      <ToggleGroupItem value="chat_completions">{m.grok_backend_chat()}</ToggleGroupItem>
                    </ToggleGroup>
                    <Field>
                      <FieldContent>
                        <FieldTitle>
                          {liveBackend === "responses" ? m.grok_backend_responses() : m.grok_backend_chat()}
                        </FieldTitle>
                        <FieldDescription>
                          {liveBackend === "responses"
                            ? m.grok_backend_responses_description()
                            : m.grok_backend_chat_description()}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldSet>
                  <Field data-invalid={apiKeyInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-api-key`} required={requiresApiKey}>
                      {m.field_api_key()}
                    </FieldLabel>
                    <ApiKeyInput
                      key={displayedEditing?.id ?? "create"}
                      id={`${formId}-api-key`}
                      name="apiKey"
                      aria-required={requiresApiKey || undefined}
                      aria-invalid={apiKeyInvalid || undefined}
                      value={apiKey}
                      placeholder={displayedEditing?.hasApiKey ? m.api_key_keep_placeholder() : ""}
                      onValueChange={setApiKey}
                    />
                    {apiKeyInvalid ? <FieldError>{m.error_api_key_required()}</FieldError> : null}
                  </Field>
                  <GrokModelField
                    formId={formId}
                    open={open}
                    baseUrl={liveBaseUrl}
                    apiKey={apiKey}
                    providerId={displayedEditing?.id}
                    model={liveModel}
                    onModelChange={(next) => {
                      setModel(next)
                      patchIdentity({ model: next })
                    }}
                    onModelsChange={setCatalogModels}
                    onError={setError}
                  />
                  <GrokImageFields
                    key={displayedEditing?.id ?? "create"}
                    formId={formId}
                    catalogModels={catalogModels}
                    imageModel={imageModel}
                    videoModel={videoModel}
                    imageBaseUrl={imageBaseUrl}
                    imageApiKey={imageApiKey}
                    hasImageApiKey={Boolean(displayedEditing?.hasImageApiKey)}
                    imageBaseUrlInvalid={imageBaseUrlInvalid}
                    onImageModelChange={setImageModel}
                    onVideoModelChange={setVideoModel}
                    onImageBaseUrlChange={setImageBaseUrl}
                    onImageApiKeyChange={setImageApiKey}
                  />
                  <GrokSessionFields
                    formId={formId}
                    overlayToml={overlayToml}
                    onOverlayChange={setOverlayToml}
                    onError={setError}
                  />
                  <Field data-invalid={error ? true : undefined}>
                    <Field orientation="horizontal" className="justify-between">
                      <HintLabel htmlFor={`${formId}-overlay`} hint={m.grok_field_overlay_description()}>
                        {m.grok_field_overlay()}
                      </HintLabel>
                      <Button type="button" variant="outline" size="sm" onClick={handleFormatOverlay}>
                        <AlignLeft data-icon="inline-start" />
                        {m.action_format()}
                      </Button>
                    </Field>
                    <TomlEditor
                      id={`${formId}-overlay`}
                      value={overlayToml}
                      invalid={Boolean(error)}
                      onChange={(next) => {
                        setOverlayToml(next)
                        try {
                          parseGrokOverlayToml(next)
                        } catch {
                          return
                        }
                        const parsed = grokOverlayIdentity(next)
                        setName(parsed.name)
                        setBaseUrl(parsed.baseUrl)
                        setModel(parsed.model)
                        if (isGrokApiBackend(parsed.apiBackend)) setApiBackend(parsed.apiBackend)
                      }}
                    />
                  </Field>
                </>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </ScrollArea>
          <SheetFooter>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {m.action_cancel()}
              </Button>
              <Button type="submit" disabled={pending}>
                {submitLabel}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function seedOverlay(
  overlayToml: string,
  columns: Parameters<typeof hydrateGrokOverlay>[1],
): string {
  try {
    return hydrateGrokOverlay(overlayToml, columns)
  } catch {
    return overlayToml
  }
}
