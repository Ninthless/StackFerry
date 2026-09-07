import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { AlignLeft } from "lucide-react"
import type {
  ClaudeAuthScheme,
  ClaudePreset,
  ClaudeProviderDraft,
  ClaudeProviderListItem,
  ProviderKind,
} from "@shared/types"
import { isClaudeAuthScheme } from "@shared/claude-presets"
import { formatClaudeOverlayJson } from "@shared/claude-session"
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
  const [authScheme, setAuthScheme] = useState<ClaudeAuthScheme>("bearer")
  const [apiKey, setApiKey] = useState("")
  const [effortLevel, setEffortLevel] = useState("")
  const [contextWindow, setContextWindow] = useState("")
  const [autoCompact, setAutoCompact] = useState("")
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
  const requiresApiKey = kind === "custom" && (!displayedEditing || !displayedEditing.hasApiKey)

  useEffect(() => {
    if (!open) return
    setError("")
    setApiKey("")
    if (editing) {
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setBaseUrl(editing.baseUrl)
      setModel(editing.model)
      setAuthScheme(editing.authScheme)
      setEffortLevel(editing.effortLevel)
      setContextWindow(editing.contextWindow)
      setAutoCompact(editing.autoCompact)
      setOverlayJson(editing.overlayJson)
      return
    }
    const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
    setPresetId(initial?.id ?? "custom")
    setName(initial?.name ?? "")
    setBaseUrl(initial?.baseUrl ?? "")
    setModel(initial?.model ?? "")
    setAuthScheme(initial?.authScheme ?? "bearer")
    setEffortLevel("")
    setContextWindow("")
    setAutoCompact("")
    setOverlayJson("")
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || displayedEditing) return
    setName(preset.name)
    setBaseUrl(preset.baseUrl)
    setModel(preset.model)
    setAuthScheme(preset.authScheme)
    setEffortLevel("")
    setContextWindow("")
    setAutoCompact("")
    setOverlayJson("")
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
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name,
        kind,
        baseUrl: kind === "custom" ? baseUrl : undefined,
        model: kind === "custom" ? model : undefined,
        authScheme: kind === "custom" ? authScheme : undefined,
        apiKey: apiKey.trim() ? apiKey : undefined,
        effortLevel: kind === "custom" ? effortLevel : undefined,
        contextWindow: kind === "custom" ? contextWindow : undefined,
        autoCompact: kind === "custom" ? autoCompact : undefined,
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
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
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
              <Field>
                <FieldLabel htmlFor={`${formId}-name`}>{m.field_name()}</FieldLabel>
                <Input
                  id={`${formId}-name`}
                  name="name"
                  required
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              {kind === "custom" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-base-url`}>{m.claude_field_base_url()}</FieldLabel>
                    <Input
                      id={`${formId}-base-url`}
                      name="baseUrl"
                      type="url"
                      required
                      autoComplete="url"
                      inputMode="url"
                      placeholder="https://llm-gateway.example.com"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                    />
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
                  <Field>
                    <FieldLabel htmlFor={`${formId}-api-key`}>{m.field_api_key()}</FieldLabel>
                    <Input
                      id={`${formId}-api-key`}
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      required={requiresApiKey}
                      value={apiKey}
                      placeholder={displayedEditing?.hasApiKey ? m.api_key_keep_placeholder() : ""}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                  </Field>
                  <ClaudeModelField
                    formId={formId}
                    open={open}
                    baseUrl={baseUrl}
                    apiKey={apiKey}
                    authScheme={authScheme}
                    providerId={displayedEditing?.id}
                    model={model}
                    onModelChange={setModel}
                    onError={setError}
                  />
                  <ClaudeSessionFields
                    formId={formId}
                    effortLevel={effortLevel}
                    contextWindow={contextWindow}
                    autoCompact={autoCompact}
                    onEffortChange={setEffortLevel}
                    onContextChange={(next, compact) => {
                      setContextWindow(next)
                      if (compact !== undefined) setAutoCompact(compact)
                    }}
                    onAutoCompactChange={setAutoCompact}
                  />
                  <Field data-invalid={error ? true : undefined}>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor={`${formId}-overlay`}>{m.claude_field_overlay()}</FieldLabel>
                      <Button type="button" variant="outline" size="sm" onClick={handleFormatOverlay}>
                        <AlignLeft data-icon="inline-start" />
                        {m.action_format()}
                      </Button>
                    </Field>
                    <JsonEditor
                      id={`${formId}-overlay`}
                      value={overlayJson}
                      invalid={Boolean(error)}
                      onChange={setOverlayJson}
                    />
                    <FieldDescription>{m.claude_field_overlay_description()}</FieldDescription>
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
