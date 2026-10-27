import { useCallback, useEffect, useState } from "react"
import { emptyRoutingSnapshot, type RoutingLaneState } from "@shared/routing"
import type { PiProviderDraft, PiProviderListItem, PiPreset } from "@shared/types"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

function desktopApi() {
  if (!window.stackferry) throw new Error(m.error_desktop_only())
  return window.stackferry
}

function tipError(description: string, id?: string): void {
  toast.add({ id, type: "error", description, priority: "high" })
}

const EMPTY_ROUTING = emptyRoutingSnapshot().lanes.pi

export function usePiProviders() {
  const [providers, setProviders] = useState<PiProviderListItem[]>([])
  const [routing, setRouting] = useState<RoutingLaneState>(EMPTY_ROUTING)
  const [presets, setPresets] = useState<PiPreset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<PiProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<PiProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    const [nextProviders, nextRouting] = await Promise.all([api.listPiProviders(), api.getRouting()])
    setProviders(nextProviders)
    setRouting(nextRouting.lanes.pi)
  }, [])

  useEffect(() => {
    try {
      void desktopApi().listPiPresets().then(setPresets)
      void refresh().catch((loadError) => {
        window.setTimeout(() => tipError(formatAppError(loadError), "pi-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(formatAppError(loadError), "pi-load"), 0)
    }
    if (!window.stackferry) return
    return window.stackferry.onPiChanged(() => {
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

  function openEdit(provider: PiProviderListItem): void {
    setEditing(provider)
    setEditorOpen(true)
  }

  async function saveProvider(draft: PiProviderDraft): Promise<void> {
    const wasEditing = Boolean(editing)
    const enabled = editing?.enabled === true
    await run(
      async () => {
        if (editing) {
          await desktopApi().updatePiProvider(editing.id, draft)
          return
        }
        await desktopApi().addPiProvider(draft)
      },
      { toastError: false },
    )
    setEditorOpen(false)
    setEditing(null)
    if (wasEditing && enabled) {
      const status = await desktopApi().getPiStatus()
      toast.add({
        type: status.needsRestart ? "warning" : undefined,
        description: status.needsRestart
          ? m.toast_pi_enabled({ name: draft.name })
          : m.toast_enabled_routed({ name: draft.name }),
      })
      return
    }
    toast.add({ description: wasEditing ? m.toast_provider_updated() : m.toast_provider_added() })
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
        const status = await desktopApi().enablePiProvider(id)
        needsRestart = status.needsRestart
      })
      toast.add({
        type: needsRestart ? "warning" : undefined,
        description: needsRestart
          ? m.toast_pi_enabled({ name: provider?.name ?? "" })
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
      await run(() => desktopApi().setProviderQueued("pi", id, queued))
    } catch {
      return
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return
    try {
      await run(() => desktopApi().deletePiProvider(deleting.id))
      setDeleting(null)
      toast.add({ description: m.toast_provider_deleted() })
    } catch {
      return
    }
  }

  function reorderProviders(next: PiProviderListItem[]): void {
    setProviders(next)
    void desktopApi()
      .reorderPiProviders(next.map((item) => item.id))
      .then(setProviders)
      .catch((reorderError) => {
        tipError(formatAppError(reorderError))
        void refresh()
      })
  }

  return {
    providers,
    presets,
    routing,
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

export type PiProvidersSession = ReturnType<typeof usePiProviders>
