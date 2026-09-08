import { useCallback, useEffect, useState } from "react"
import { emptyRoutingSnapshot, type RoutingLaneState } from "@shared/routing"
import type { GrokPreset, GrokProviderDraft, GrokProviderListItem } from "@shared/types"
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

const EMPTY_ROUTING = emptyRoutingSnapshot().lanes["grok-build"]

export function useGrokProviders() {
  const [providers, setProviders] = useState<GrokProviderListItem[]>([])
  const [routing, setRouting] = useState<RoutingLaneState>(EMPTY_ROUTING)
  const [presets, setPresets] = useState<GrokPreset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<GrokProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<GrokProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    const [nextProviders, nextRouting] = await Promise.all([api.listGrokProviders(), api.getRouting()])
    setProviders(nextProviders)
    setRouting(nextRouting.lanes["grok-build"])
  }, [])

  useEffect(() => {
    try {
      void desktopApi().listGrokPresets().then(setPresets)
      void refresh().catch((loadError) => {
        window.setTimeout(() => tipError(formatAppError(loadError), "grok-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(formatAppError(loadError), "grok-load"), 0)
    }
    if (!window.stackferry) return
    return window.stackferry.onGrokChanged(() => {
      void refresh()
    })
  }, [refresh])

  async function run(action: () => Promise<unknown>, options?: { toastError?: boolean }): Promise<void> {
    try {
      await action()
      await refresh()
    } catch (actionError) {
      if (options?.toastError !== false) tipError(formatAppError(actionError))
      throw actionError
    }
  }

  function openCreate(): void {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(provider: GrokProviderListItem): void {
    setEditing(provider)
    setEditorOpen(true)
  }

  async function saveProvider(draft: GrokProviderDraft): Promise<void> {
    const api = desktopApi()
    const wasEditing = Boolean(editing)
    await run(
      async () => {
        if (editing) {
          await api.updateGrokProvider(editing.id, draft)
          return
        }
        await api.addGrokProvider(draft)
      },
      { toastError: false },
    )
    const rewriteLive = wasEditing && editing?.enabled
    setEditorOpen(false)
    setEditing(null)
    if (rewriteLive) {
      const status = await desktopApi().getGrokStatus()
      toast.add({
        type: status.needsRestart ? "warning" : undefined,
        description: status.needsRestart
          ? m.toast_grok_enabled({ name: draft.name })
          : m.toast_enabled_routed({ name: draft.name }),
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
      let needsRestart = true
      await run(async () => {
        const status = await desktopApi().enableGrokProvider(id)
        needsRestart = status.needsRestart
      })
      toast.add({
        type: needsRestart ? "warning" : undefined,
        description: needsRestart
          ? m.toast_grok_enabled({ name: provider?.name ?? "" })
          : m.toast_enabled_routed({ name: provider?.name ?? "" }),
      })
    } catch {
      return
    } finally {
      setBusyId(null)
    }
  }

  async function setProviderQueued(id: string, queued: boolean): Promise<void> {
    try {
      await run(() => desktopApi().setProviderQueued("grok-build", id, queued))
    } catch {
      return
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return
    try {
      await run(() => desktopApi().deleteGrokProvider(deleting.id))
      setDeleting(null)
      toast.add({ description: m.toast_provider_deleted() })
    } catch {
      return
    }
  }

  function reorderProviders(next: GrokProviderListItem[]): void {
    setProviders(next)
    void desktopApi()
      .reorderGrokProviders(next.map((item) => item.id))
      .then(setProviders)
      .catch((reorderError) => {
        tipError(formatAppError(reorderError))
        void refresh()
      })
  }

  return {
    providers,
    routing,
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
    setProviderQueued,
    reorderProviders,
    confirmDelete,
  }
}

export type GrokProvidersSession = ReturnType<typeof useGrokProviders>
