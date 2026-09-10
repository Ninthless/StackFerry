import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { AlignLeft } from "lucide-react"
import type { Preset, ProviderDraft, ProviderKind, ProviderListItem } from "@shared/types"
import {
  formatToml,
  isOverlayWireApi,
  overlayBaseUrl,
  overlayRequiresApiKey,
  overlayWireApi,
  withOverlayBaseUrl,
  withOverlayWireApi,
  type OverlayWireApi,
} from "@shared/provider-overlay"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field"
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
import { presetLabel } from "@/lib/preset-label"
import { HintLabel } from "@/features/settings/settings-hint"
import * as m from "@/paraglide/messages.js"
import { missingText, useEditorSubmit } from "./editor-validation"
import { TomlEditor } from "./toml-editor"
import { CodexSessionFields } from "./codex-session-fields"

type Props = {
  open: boolean
  presets: Preset[]
  editing: ProviderListItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: ProviderDraft) => Promise<void>
}

export function ProviderEditor({ open, presets, editing, onOpenChange, onSubmit }: Props) {
  const formId = useId()
  const [presetId, setPresetId] = useState("custom")
  const [name, setName] = useState("")
  const [tomlText, setTomlText] = useState("")
  const [models, setModels] = useState<string[]>([])
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const displayedEditingRef = useRef(editing)
  if (open) displayedEditingRef.current = editing
  const displayedEditing = displayedEditingRef.current

  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0]
  const presetItems = useMemo(
    () => presets.map((preset) => ({ label: presetLabel(preset.id, preset.name), value: preset.id })),
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
  const requiresApiKey = useMemo(() => {
    if (kind !== "custom") return false
    try {
      return overlayRequiresApiKey(tomlText)
    } catch {
      return false
    }
  }, [kind, tomlText])
  const apiKeyRequired = requiresApiKey && (!displayedEditing || !displayedEditing.hasApiKey)
  const liveBaseUrl = kind === "custom" ? overlayBaseUrl(tomlText) : ""
  const nameInvalid = submitted && missingText(name)
  const baseUrlInvalid = kind === "custom" && submitted && missingText(liveBaseUrl)
  const apiKeyInvalid = submitted && apiKeyRequired && missingText(apiKey)
  const wireApi = useMemo(() => wireApiFromToml(tomlText), [tomlText])

  useEffect(() => {
    if (!open) return
    setError("")
    setApiKey("")
    if (editing) {
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setTomlText(editing.tomlText)
      setModels(editing.models)
      return
    }
    const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
    setPresetId(initial?.id ?? "custom")
    setName(initial?.name ?? "")
    setTomlText(initial?.tomlText ?? "")
    setModels([])
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || displayedEditing) return
    setName(preset.name)
    setTomlText(preset.tomlText)
    setModels([])
  }

  function handleFormatToml(): void {
    try {
      setTomlText(formatToml(tomlText))
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
      (kind === "custom" && missingText(overlayBaseUrl(tomlText))) ||
      (apiKeyRequired && missingText(apiKey))
    ) {
      return
    }
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name,
        kind,
        tomlText: kind === "custom" ? tomlText : undefined,
        models: kind === "custom" ? models : undefined,
        apiKey: apiKey.trim() ? apiKey : undefined,
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
                  <Field data-invalid={baseUrlInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-base-url`} required>
                      Base URL
                    </FieldLabel>
                    <Input
                      id={`${formId}-base-url`}
                      name="baseUrl"
                      type="url"
                      aria-required
                      aria-invalid={baseUrlInvalid || undefined}
                      autoComplete="url"
                      inputMode="url"
                      placeholder="https://api.example.com/v1"
                      value={liveBaseUrl}
                      onChange={(event) => {
                        try {
                          setTomlText(withOverlayBaseUrl(tomlText, event.target.value))
                        } catch {
                          return
                        }
                      }}
                    />
                    {baseUrlInvalid ? <FieldError>{m.error_overlay_missing_base_url()}</FieldError> : null}
                  </Field>
                  <FieldSet>
                    <FieldLegend variant="label">{m.field_wire_api()}</FieldLegend>
                    <ToggleGroup
                      value={[wireApi]}
                      onValueChange={(value) => {
                        const next = value[0]
                        if (!isOverlayWireApi(next)) return
                        try {
                          setTomlText(withOverlayWireApi(tomlText, next))
                          setError("")
                        } catch {
                          return
                        }
                      }}
                      variant="outline"
                    >
                      <ToggleGroupItem value="responses">{m.field_wire_api_responses()}</ToggleGroupItem>
                      <ToggleGroupItem value="chat">{m.field_wire_api_chat()}</ToggleGroupItem>
                    </ToggleGroup>
                    <Field>
                      <FieldContent>
                        <FieldTitle>
                          {wireApi === "responses" ? m.field_wire_api_responses() : m.field_wire_api_chat()}
                        </FieldTitle>
                        <FieldDescription>
                          {wireApi === "responses"
                            ? m.field_wire_api_responses_description()
                            : m.field_wire_api_chat_description()}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldSet>
                  <Field data-invalid={apiKeyInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-api-key`} required={apiKeyRequired}>
                      {m.field_api_key()}
                    </FieldLabel>
                    <Input
                      id={`${formId}-api-key`}
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      aria-required={apiKeyRequired || undefined}
                      aria-invalid={apiKeyInvalid || undefined}
                      value={apiKey}
                      placeholder={displayedEditing?.hasApiKey ? m.api_key_keep_placeholder() : ""}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                    {apiKeyInvalid ? <FieldError>{m.error_api_key_required()}</FieldError> : null}
                  </Field>
                  <CodexSessionFields
                    formId={formId}
                    tomlText={tomlText}
                    apiKey={apiKey}
                    providerId={displayedEditing?.id}
                    models={models}
                    onTomlChange={setTomlText}
                    onModelsChange={setModels}
                    onError={setError}
                  />
                  <Field data-invalid={error ? true : undefined}>
                    <Field orientation="horizontal" className="justify-between">
                      <HintLabel htmlFor={`${formId}-toml`} hint={m.field_toml_description()}>
                        {m.field_toml()}
                      </HintLabel>
                      <Button type="button" variant="outline" size="sm" onClick={handleFormatToml}>
                        <AlignLeft data-icon="inline-start" />
                        {m.action_format()}
                      </Button>
                    </Field>
                    <TomlEditor
                      id={`${formId}-toml`}
                      value={tomlText}
                      invalid={Boolean(error)}
                      onChange={setTomlText}
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

function wireApiFromToml(text: string): OverlayWireApi {
  try {
    return overlayWireApi(text)
  } catch {
    return "responses"
  }
}
