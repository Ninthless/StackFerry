import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
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

  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0]
  const presetItems = useMemo(
    () => presets.map((preset) => ({ label: preset.name, value: preset.id })),
    [presets],
  )
  const kind: ProviderKind = editing?.kind ?? selectedPreset?.kind ?? "custom"
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
    if (!preset || editing) return
    setName(preset.name)
    setTomlText(preset.tomlText)
  }

  function handleFormatToml(): void {
    try {
      setTomlText(formatToml(tomlText))
      setError("")
    } catch (formatError) {
      setError(formatError instanceof Error ? formatError.message : String(formatError))
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
      setError(submitError instanceof Error ? submitError.message : String(submitError))
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
            <SheetTitle>{editing ? "编辑供应商" : "添加供应商"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <FieldGroup className="px-4 pb-4">
              {!editing ? (
                <Field>
                  <FieldLabel htmlFor={`${formId}-preset`}>预设</FieldLabel>
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
                <FieldLabel htmlFor={`${formId}-name`}>名称</FieldLabel>
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
                    <FieldLabel htmlFor={`${formId}-api-key`}>API Key</FieldLabel>
                    <Input
                      id={`${formId}-api-key`}
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      required={requiresApiKey && (!editing || !editing.hasApiKey)}
                      value={apiKey}
                      placeholder={editing?.hasApiKey ? "不修改请留空" : ""}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                  </Field>
                  <CodexSessionFields
                    formId={formId}
                    tomlText={tomlText}
                    apiKey={apiKey}
                    providerId={editing?.id}
                    onTomlChange={setTomlText}
                    onError={setError}
                  />
                  <Field data-invalid={error ? true : undefined}>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor={`${formId}-toml`}>config.toml 覆盖片段</FieldLabel>
                      <Button type="button" variant="outline" size="sm" onClick={handleFormatToml}>
                        <AlignLeft data-icon="inline-start" />
                        格式化
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
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "保存中…" : "保存"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
