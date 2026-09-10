import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { AlignLeft } from "lucide-react"
import type {
  ClaudeAuthScheme,
  ClaudePreset,
  ClaudeProviderDraft,
  ClaudeProviderListItem,
  ProviderKind,
} from "@shared/types"
import { persistClaudeModels } from "@shared/claude-models"
import { isClaudeAuthScheme } from "@shared/claude-presets"
import {
  claudeOverlayFields,
  formatClaudeOverlayJson,
  hydrateClaudeOverlay,
  parseClaudeOverlayJson,
  withClaudeOverlayFields,
} from "@shared/claude-session"
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatAppError } from "@/lib/format-app-error"
import { claudePresetLabel } from "@/lib/preset-label"
import { HintLabel } from "@/features/settings/settings-hint"
import { missingText, nonHttpUrl, useEditorSubmit } from "@/features/providers/editor-validation"
import * as m from "@/paraglide/messages.js"
import { ClaudeModelField } from "./claude-model-field"
import { ClaudeSessionFields } from "./claude-session-fields"
import { JsonEditor } from "./json-editor"

type Props = {
  open: boolean
  presets: ClaudePreset[]
  editing: ClaudeProviderListItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: ClaudeProviderDraft) => Promise<void>
}

export function ClaudeProviderEditor({ open, presets, editing, onOpenChange, onSubmit }: Props) {
  const formId = useId()
  const [presetId, setPresetId] = useState("custom")
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [models, setModels] = useState<string[]>([])
  const [authScheme, setAuthScheme] = useState<ClaudeAuthScheme>("bearer")
  const [apiKey, setApiKey] = useState("")
  const [overlayJson, setOverlayJson] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const displayedEditingRef = useRef(editing)
  if (open) displayedEditingRef.current = editing
  const displayedEditing = displayedEditingRef.current

  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0]
  const presetItems = useMemo(
    () => presets.map((preset) => ({ label: claudePresetLabel(preset.id, preset.name), value: preset.id })),
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
  const overlayFields = claudeOverlayFields(overlayJson)
  const liveBaseUrl = overlayFields.baseUrl
  const liveModel = overlayFields.model
  const nameInvalid = submitted && missingText(name)
  const baseUrlMissing = kind === "custom" && submitted && missingText(liveBaseUrl)
  const baseUrlInvalid = kind === "custom" && submitted && !missingText(liveBaseUrl) && nonHttpUrl(liveBaseUrl)
  const apiKeyInvalid = submitted && requiresApiKey && missingText(apiKey)

  useEffect(() => {
    if (!open) return
    setError("")
    setApiKey("")
    if (editing) {
      const persisted = persistClaudeModels(editing.model, editing.models)
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setBaseUrl(editing.baseUrl)
      setModel(persisted.model)
      setModels(persisted.models)
      setAuthScheme(editing.authScheme)
      setOverlayJson(
        editing.kind === "custom"
          ? seedOverlay(editing.overlayJson, {
              baseUrl: editing.baseUrl,
              model: persisted.model,
              effortLevel: editing.effortLevel,
              permissionMode: editing.permissionMode,
              contextWindow: editing.contextWindow,
              autoCompact: editing.autoCompact,
            })
          : "",
      )
      return
    }
    const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
    setPresetId(initial?.id ?? "custom")
    const persisted = persistClaudeModels(initial?.model, undefined)
    setName(initial?.name ?? "")
    setBaseUrl(initial?.baseUrl ?? "")
    setModel(persisted.model)
    setModels(persisted.models)
    setAuthScheme(initial?.authScheme ?? "bearer")
    setOverlayJson(
      initial?.kind === "custom"
        ? seedOverlay("", {
            baseUrl: initial.baseUrl,
            model: persisted.model,
            effortLevel: "",
            permissionMode: "",
            contextWindow: "",
            autoCompact: "",
          })
        : "",
    )
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || displayedEditing) return
    const persisted = persistClaudeModels(preset.model, undefined)
    setName(preset.name)
    setBaseUrl(preset.baseUrl)
    setModel(persisted.model)
    setModels(persisted.models)
    setAuthScheme(preset.authScheme)
    setOverlayJson(
      preset.kind === "custom"
        ? seedOverlay("", {
            baseUrl: preset.baseUrl,
            model: persisted.model,
            effortLevel: "",
            permissionMode: "",
            contextWindow: "",
            autoCompact: "",
          })
        : "",
    )
  }

  function patchOverlay(patch: Parameters<typeof withClaudeOverlayFields>[1]): void {
    try {
      setOverlayJson(withClaudeOverlayFields(overlayJson, patch))
      setError("")
    } catch {
      return
    }
  }

  function handleFormatOverlay(): void {
    try {
      setOverlayJson(formatClaudeOverlayJson(overlayJson))
      setError("")
    } catch (formatError) {
      setError(formatAppError(formatError))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    markSubmitted()
    if (
      missingText(name) ||
      (kind === "custom" && (missingText(liveBaseUrl) || nonHttpUrl(liveBaseUrl))) ||
      (requiresApiKey && missingText(apiKey))
    ) {
      return
    }
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name,
        kind,
        baseUrl: kind === "custom" ? liveBaseUrl || baseUrl : undefined,
        model: kind === "custom" ? liveModel || model : undefined,
        models: kind === "custom" ? models : undefined,
        authScheme: kind === "custom" ? authScheme : undefined,
        apiKey: apiKey.trim() ? apiKey : undefined,
        effortLevel: kind === "custom" ? overlayFields.effortLevel : undefined,
        permissionMode: kind === "custom" ? overlayFields.permissionMode : undefined,
        contextWindow: kind === "custom" ? overlayFields.contextWindow : undefined,
        autoCompact: kind === "custom" ? overlayFields.autoCompact : undefined,
        overlayJson: kind === "custom" ? overlayJson : undefined,
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
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
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
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                {nameInvalid ? <FieldError>{m.error_provider_name_required()}</FieldError> : null}
              </Field>
              {kind === "custom" ? (
                <>
                  <Field data-invalid={baseUrlMissing || baseUrlInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-base-url`} required>
                      {m.claude_field_base_url()}
                    </FieldLabel>
                    <Input
                      id={`${formId}-base-url`}
                      name="baseUrl"
                      type="url"
                      aria-required
                      aria-invalid={baseUrlMissing || baseUrlInvalid || undefined}
                      autoComplete="url"
                      inputMode="url"
                      placeholder="https://llm-gateway.example.com"
                      value={liveBaseUrl}
                      onChange={(event) => {
                        setBaseUrl(event.target.value)
                        patchOverlay({ baseUrl: event.target.value })
                      }}
                    />
                    {baseUrlMissing ? <FieldError>{m.error_claude_base_url_required()}</FieldError> : null}
                    {baseUrlInvalid ? <FieldError>{m.error_claude_base_url_invalid()}</FieldError> : null}
                  </Field>
                  <FieldSet>
                    <FieldLegend variant="label">{m.claude_field_auth_scheme()}</FieldLegend>
                    <ToggleGroup
                      value={[authScheme]}
                      onValueChange={(value) => {
                        const next = value[0]
                        if (isClaudeAuthScheme(next)) setAuthScheme(next)
                      }}
                      variant="outline"
                    >
                      <ToggleGroupItem value="bearer">{m.claude_auth_bearer()}</ToggleGroupItem>
                      <ToggleGroupItem value="x-api-key">{m.claude_auth_x_api_key()}</ToggleGroupItem>
                    </ToggleGroup>
                    <Field>
                      <FieldContent>
                        <FieldTitle>
                          {authScheme === "bearer" ? m.claude_auth_bearer() : m.claude_auth_x_api_key()}
                        </FieldTitle>
                        <FieldDescription>
                          {authScheme === "bearer"
                            ? m.claude_auth_bearer_description()
                            : m.claude_auth_x_api_key_description()}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldSet>
                  <Field data-invalid={apiKeyInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-api-key`} required={requiresApiKey}>
                      {m.field_api_key()}
                    </FieldLabel>
                    <Input
                      id={`${formId}-api-key`}
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      aria-required={requiresApiKey || undefined}
                      aria-invalid={apiKeyInvalid || undefined}
                      value={apiKey}
                      placeholder={displayedEditing?.hasApiKey ? m.api_key_keep_placeholder() : ""}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                    {apiKeyInvalid ? <FieldError>{m.error_api_key_required()}</FieldError> : null}
                  </Field>
                  <ClaudeModelField
                    formId={formId}
                    open={open}
                    baseUrl={liveBaseUrl || baseUrl}
                    apiKey={apiKey}
                    authScheme={authScheme}
                    providerId={displayedEditing?.id}
                    model={liveModel}
                    models={models}
                    onModelChange={(next) => {
                      setModel(next)
                      patchOverlay({ model: next })
                    }}
                    onModelsChange={setModels}
                    onError={setError}
                  />
                  <ClaudeSessionFields
                    formId={formId}
                    overlayJson={overlayJson}
                    onOverlayChange={setOverlayJson}
                    onError={setError}
                  />
                  <Field data-invalid={error ? true : undefined}>
                    <Field orientation="horizontal" className="justify-between">
                      <HintLabel htmlFor={`${formId}-overlay`} hint={m.claude_field_overlay_description()}>
                        {m.claude_field_overlay()}
                      </HintLabel>
                      <Button type="button" variant="outline" size="sm" onClick={handleFormatOverlay}>
                        <AlignLeft data-icon="inline-start" />
                        {m.action_format()}
                      </Button>
                    </Field>
                    <JsonEditor
                      id={`${formId}-overlay`}
                      value={overlayJson}
                      invalid={Boolean(error)}
                      onChange={(next) => {
                        setOverlayJson(next)
                        try {
                          parseClaudeOverlayJson(next)
                        } catch {
                          return
                        }
                        const parsed = claudeOverlayFields(next)
                        setBaseUrl(parsed.baseUrl)
                        setModel(parsed.model)
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
  overlayJson: string,
  columns: Parameters<typeof hydrateClaudeOverlay>[1],
): string {
  try {
    return hydrateClaudeOverlay(overlayJson, columns)
  } catch {
    return overlayJson
  }
}
