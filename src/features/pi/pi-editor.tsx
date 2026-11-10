import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { PI_APIS, isPiApi, type PiApi, type PiPreset, type PiProviderDraft, type PiProviderListItem } from "@shared/types"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatAppError } from "@/lib/format-app-error"
import { piPresetLabel } from "@/lib/preset-label"
import { ApiKeyInput } from "@/features/providers/api-key-input"
import { missingText, nonHttpUrl, useEditorSubmit } from "@/features/providers/editor-validation"
import * as m from "@/paraglide/messages.js"
import { PiModelField } from "./pi-model-field"
import { PiSessionFields } from "./pi-session-fields"

type Props = {
  open: boolean
  presets: PiPreset[]
  editing: PiProviderListItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: PiProviderDraft) => Promise<void>
}

function apiLabel(api: PiApi): string {
  if (api === "openai-responses") return m.pi_api_responses()
  if (api === "anthropic-messages") return m.pi_api_messages()
  return m.pi_api_completions()
}

function invalidContext(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && !/^[1-9]\d*$/.test(trimmed)
}

export function PiProviderEditor({ open, presets = [], editing, onOpenChange, onSubmit }: Props) {
  const formId = useId()
  const { submitted, markSubmitted } = useEditorSubmit(open)
  const [presetId, setPresetId] = useState("custom")
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [api, setApi] = useState<PiApi>("openai-completions")
  const [apiKey, setApiKey] = useState("")
  const [thinkingLevel, setThinkingLevel] = useState("")
  const [contextWindow, setContextWindow] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const displayedEditingRef = useRef(editing)
  if (open) displayedEditingRef.current = editing
  const displayedEditing = displayedEditingRef.current
  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0]
  const presetItems = useMemo(
    () => presets.map((preset) => ({ label: piPresetLabel(preset.id, preset.name), value: preset.id })),
    [presets],
  )
  const official = (displayedEditing?.kind ?? selectedPreset?.kind ?? "custom") === "official"
  const nameInvalid = submitted && missingText(name)
  const urlInvalid = submitted && !official && (missingText(baseUrl) || nonHttpUrl(baseUrl))
  const modelInvalid = submitted && !official && missingText(model)
  const keyInvalid = submitted && !official && !displayedEditing?.hasApiKey && missingText(apiKey)
  const contextInvalid = submitted && !official && invalidContext(contextWindow)

  useEffect(() => {
    if (!open) return
    setError("")
    setApiKey("")
    if (editing) {
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setBaseUrl(editing.baseUrl)
      setModel(editing.model)
      setApi(editing.api)
      setThinkingLevel(editing.thinkingLevel)
      setContextWindow(editing.contextWindow)
      if (editing.kind === "custom" && window.stackferry) {
        void window.stackferry.readPiProviderApiKey(editing.id).then(setApiKey).catch(() => setApiKey(""))
      }
      return
    }
    const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
    setPresetId(initial?.id ?? "custom")
    setName(initial?.name ?? "")
    setBaseUrl(initial?.baseUrl ?? "")
    setModel(initial?.model ?? "")
    setApi(initial?.api ?? "openai-completions")
    setThinkingLevel("")
    setContextWindow("")
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || displayedEditing) return
    setName(preset.name)
    setBaseUrl(preset.baseUrl)
    setModel(preset.model)
    setApi(preset.api)
    setThinkingLevel("")
    setContextWindow("")
    setApiKey("")
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    markSubmitted()
    if (missingText(name)) return
    if (
      !official &&
      (missingText(baseUrl) || nonHttpUrl(baseUrl) || missingText(model) || (!displayedEditing?.hasApiKey && missingText(apiKey)) || invalidContext(contextWindow))
    ) {
      return
    }
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name: name.trim(),
        kind: official ? "official" : "custom",
        baseUrl: official ? undefined : baseUrl.trim(),
        model: official ? undefined : model.trim(),
        api: official ? undefined : api,
        apiKey: official ? undefined : apiKey.trim(),
        thinkingLevel: official ? undefined : thinkingLevel,
        contextWindow: official ? undefined : contextWindow.trim(),
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
        <SheetHeader>
          <SheetTitle>{displayedEditing ? m.pi_edit_title() : m.pi_add_title()}</SheetTitle>
        </SheetHeader>
        <form id={formId} className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void handleSubmit(event)}>
          <ScrollArea className="min-h-0 flex-1">
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
                    <SelectContent>
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
                <FieldLabel htmlFor={`${formId}-name`}>{m.field_name()}</FieldLabel>
                <Input id={`${formId}-name`} value={name} onChange={(event) => setName(event.target.value)} />
                {nameInvalid ? <FieldError>{m.error_provider_name_required()}</FieldError> : null}
              </Field>
              {official ? null : (
                <>
                  <Field data-invalid={urlInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-url`}>{m.pi_field_base_url()}</FieldLabel>
                    <Input id={`${formId}-url`} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                    {urlInvalid ? <FieldError>{m.error_models_invalid_url()}</FieldError> : null}
                  </Field>
                  <Field>
                    <FieldLabel>{m.pi_field_api()}</FieldLabel>
                    <Select
                      value={api}
                      onValueChange={(value) => {
                        if (isPiApi(value)) setApi(value)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {PI_APIS.map((item) => (
                            <SelectItem key={item} value={item}>
                              {apiLabel(item)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field data-invalid={keyInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-key`}>{m.field_api_key()}</FieldLabel>
                    <ApiKeyInput
                      id={`${formId}-key`}
                      value={apiKey}
                      placeholder={displayedEditing?.hasApiKey ? m.api_key_keep_placeholder() : ""}
                      onValueChange={setApiKey}
                    />
                    {keyInvalid ? <FieldError>{m.error_api_key_required()}</FieldError> : null}
                  </Field>
                  <PiModelField
                    formId={formId}
                    open={open}
                    baseUrl={baseUrl}
                    api={api}
                    apiKey={apiKey}
                    providerId={displayedEditing?.id}
                    model={model}
                    invalid={modelInvalid}
                    onModelChange={setModel}
                    onError={setError}
                  />
                  <PiSessionFields
                    formId={formId}
                    thinkingLevel={thinkingLevel}
                    contextWindow={contextWindow}
                    contextInvalid={contextInvalid}
                    onThinkingLevel={setThinkingLevel}
                    onContextWindow={setContextWindow}
                  />
                </>
              )}
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </ScrollArea>
          <SheetFooter>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? m.action_saving() : m.action_save()}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
