import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { AlignLeft } from "lucide-react"
import type { Preset, ProviderDraft, ProviderKind, ProviderListItem } from "@shared/types"
import {
  formatToml,
  overlayBaseUrl,
  overlayRequiresApiKey,
  withOverlayBaseUrl,
} from "@shared/provider-overlay"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
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
import { formatAppError } from "@/lib/format-app-error"
import { presetLabel } from "@/lib/preset-label"
import * as m from "@/paraglide/messages.js"
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
  const requiresApiKey = useMemo(() => {
    if (kind !== "custom") return false
    try {
      return overlayRequiresApiKey(tomlText)
    } catch {
      return false
    }
  }, [kind, tomlText])

  useEffect(() => {
    if (!open) return
    setError("")
    setApiKey("")
    if (editing) {
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setTomlText(editing.tomlText)
      return
    }
    const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
    setPresetId(initial?.id ?? "custom")
    setName(initial?.name ?? "")
    setTomlText(initial?.tomlText ?? "")
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || displayedEditing) return
    setName(preset.name)
    setTomlText(preset.tomlText)
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
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name,
        kind,
        tomlText: kind === "custom" ? tomlText : undefined,
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
                    <FieldLabel htmlFor={`${formId}-base-url`}>Base URL</FieldLabel>
                    <Input
                      id={`${formId}-base-url`}
                      name="baseUrl"
                      type="url"
                      required
                      autoComplete="url"
                      inputMode="url"
                      placeholder="https://api.example.com/v1"
                      value={overlayBaseUrl(tomlText)}
                      onChange={(event) => {
                        try {
                          setTomlText(withOverlayBaseUrl(tomlText, event.target.value))
                        } catch {
                          return
                        }
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-api-key`}>{m.field_api_key()}</FieldLabel>
                    <Input
                      id={`${formId}-api-key`}
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      required={requiresApiKey && (!displayedEditing || !displayedEditing.hasApiKey)}
                      value={apiKey}
                      placeholder={displayedEditing?.hasApiKey ? m.api_key_keep_placeholder() : ""}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                  </Field>
                  <CodexSessionFields
                    formId={formId}
                    tomlText={tomlText}
                    apiKey={apiKey}
                    providerId={displayedEditing?.id}
                    onTomlChange={setTomlText}
                    onError={setError}
                  />
                  <Field data-invalid={error ? true : undefined}>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor={`${formId}-toml`}>{m.field_toml()}</FieldLabel>
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
