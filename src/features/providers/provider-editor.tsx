import { useEffect, useState, type FormEvent } from "react"
import type { Preset, ProviderDraft, ProviderKind, ProviderListItem } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Props = {
  open: boolean
  presets: Preset[]
  editing: ProviderListItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: ProviderDraft) => Promise<void>
}

export function ProviderEditor({ open, presets, editing, onOpenChange, onSubmit }: Props) {
  const [presetId, setPresetId] = useState("custom")
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0]
  const kind: ProviderKind = editing?.kind ?? selectedPreset?.kind ?? "custom"

  useEffect(() => {
    if (!open) return
    setError("")
    setApiKey("")
    if (editing) {
      setPresetId(editing.kind === "official" ? "official" : "custom")
      setName(editing.name)
      setBaseUrl(editing.baseUrl)
      setModel(editing.model)
      return
    }
    const initial = presets.find((preset) => preset.id === "custom") ?? presets[0]
    setPresetId(initial?.id ?? "custom")
    setName(initial?.name ?? "")
    setBaseUrl(initial?.baseUrl ?? "")
    setModel(initial?.model ?? "")
  }, [open, editing, presets])

  function applyPreset(nextPresetId: string): void {
    const preset = presets.find((item) => item.id === nextPresetId)
    setPresetId(nextPresetId)
    if (!preset || editing) return
    setName(preset.name)
    setBaseUrl(preset.baseUrl)
    setModel(preset.model)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await onSubmit({
        name,
        kind,
        baseUrl,
        model,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑供应商" : "添加供应商"}</DialogTitle>
            <DialogDescription>
              {kind === "official"
                ? "切回官方登录时只改 config.toml，保留 Codex 登录缓存。"
                : "配置会加密保存在本机，启用时写入 Codex 用户配置。"}
            </DialogDescription>
          </DialogHeader>
          {!editing ? (
            <div className="grid gap-2">
              <Label htmlFor="preset">预设</Label>
              <Select
                value={presetId}
                onValueChange={(value) => {
                  if (typeof value === "string") applyPreset(value)
                }}
              >
                <SelectTrigger id="preset" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="provider-name">名称</Label>
            <Input
              id="provider-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {kind === "custom" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="base-url">Base URL</Label>
                <Input
                  id="base-url"
                  required
                  value={baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="model">模型</Label>
                <Input
                  id="model"
                  required
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  required={!editing || !editing.hasApiKey}
                  value={apiKey}
                  placeholder={editing?.hasApiKey ? "不修改请留空" : ""}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
