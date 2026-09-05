import { useCallback, useEffect, useState } from "react"
import type { Preset, ProviderDraft, ProviderListItem } from "@shared/types"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

function desktopApi() {
  if (!window.stackferry) {
    throw new Error(m.error_desktop_only())
  }
  return window.stackferry
}

function tipError(description: string, id?: string): void {
  toast.add({ id, type: "error", description, priority: "high" })
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
        window.setTimeout(() => tipError(formatAppError(loadError), "app-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(formatAppError(loadError), "app-load"), 0)
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
        tipError(formatAppError(actionError))
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
    const rewriteLive = wasEditing && editing?.enabled
    setEditorOpen(false)
    setEditing(null)
    if (rewriteLive) {
      toast.add({
        type: "warning",
        description: m.toast_enabled_description({ name: draft.name }),
      })
      return
    }
    toast.add({
      description: wasEditing ? m.toast_provider_updated() : m.toast_provider_added(),
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
        description: m.toast_enabled_description({ name: provider?.name ?? "" }),
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
        description: m.toast_provider_deleted(),
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
