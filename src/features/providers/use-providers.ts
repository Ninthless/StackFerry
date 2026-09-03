import { useCallback, useEffect, useState } from "react"
import type { Preset, ProviderDraft, ProviderListItem } from "@shared/types"
import { toast } from "@/components/ui/toast"

function desktopApi() {
  if (!window.stackferry) {
    throw new Error("请从 StackFerry 桌面应用打开，而不是浏览器预览页。")
  }
  return window.stackferry
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function tipError(description: string, id?: string): void {
  toast.add({ id, type: "error", title: "操作失败", description })
}

export function useProviders() {
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<ProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    setProviders(await api.listProviders())
  }, [])

  useEffect(() => {
    try {
      void desktopApi().listPresets().then(setPresets)
      void refresh().catch((loadError) => {
        window.setTimeout(() => tipError(errorMessage(loadError), "app-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(errorMessage(loadError), "app-load"), 0)
    }
    if (!window.stackferry) return
    return window.stackferry.onChanged(() => {
      void refresh()
    })
  }, [refresh])

  async function run(
    action: () => Promise<unknown>,
    options?: { toastError?: boolean },
  ): Promise<void> {
    try {
      await action()
      await refresh()
    } catch (actionError) {
      if (options?.toastError !== false) {
        tipError(errorMessage(actionError))
      }
      throw actionError
    }
  }

  function openCreate(): void {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(provider: ProviderListItem): void {
    setEditing(provider)
    setEditorOpen(true)
  }

  async function saveProvider(draft: ProviderDraft): Promise<void> {
    const api = desktopApi()
    const wasEditing = Boolean(editing)
    await run(
      async () => {
        if (editing) {
          await api.updateProvider(editing.id, draft)
          return
        }
        await api.addProvider(draft)
      },
      { toastError: false },
    )
    setEditorOpen(false)
    setEditing(null)
    toast.add({
      type: "success",
      title: wasEditing ? "供应商已更新" : "供应商已添加",
      description: draft.name,
    })
  }

  function closeEditor(): void {
    setEditorOpen(false)
    setEditing(null)
  }

  async function enableProvider(id: string): Promise<void> {
    const provider = providers.find((item) => item.id === id)
    setBusyId(id)
    try {
      await run(() => desktopApi().enableProvider(id))
      toast.add({
        type: "warning",
        title: "配置已写入",
        description: `已启用「${provider?.name ?? ""}」。请重启 Codex / 终端后生效。`,
        timeout: 10_000,
      })
    } catch {
      return
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return
    const name = deleting.name
    try {
      await run(() => desktopApi().deleteProvider(deleting.id))
      setDeleting(null)
      toast.add({
        type: "success",
        title: "供应商已删除",
        description: `「${name}」已从列表移除。`,
      })
    } catch {
      return
    }
  }

  return {
    providers,
    presets,
    editorOpen,
    editing,
    deleting,
    busyId,
    setDeleting,
    openCreate,
    openEdit,
    closeEditor,
    saveProvider,
    enableProvider,
    confirmDelete,
  }
}

export type ProvidersSession = ReturnType<typeof useProviders>
