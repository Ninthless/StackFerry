import { useCallback, useEffect, useState } from "react"
import { emptyRoutingSnapshot, type RoutingLaneState } from "@shared/routing"
import type { CodexDaemonState, Preset, ProviderDraft, ProviderListItem } from "@shared/types"
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

const EMPTY_ROUTING = emptyRoutingSnapshot().lanes.codex

export function useCodexProviders() {
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [routing, setRouting] = useState<RoutingLaneState>(EMPTY_ROUTING)
  const [presets, setPresets] = useState<Preset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<ProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [daemonState, setDaemonState] = useState<CodexDaemonState>("stopped")
  const [restartingDaemon, setRestartingDaemon] = useState(false)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    const [nextProviders, nextRouting, status] = await Promise.all([
      api.listProviders(),
      api.getRouting(),
      api.getStatus(),
    ])
    setProviders(nextProviders)
    setRouting(nextRouting.lanes.codex)
    setDaemonState(status.codexDaemon)
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
    const refreshOnChange = () => { void refresh().catch(() => undefined) }
    const unsubscribe = window.stackferry.onChanged(refreshOnChange)
    window.addEventListener("focus", refreshOnChange)
    return () => {
      unsubscribe()
      window.removeEventListener("focus", refreshOnChange)
    }
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
      const status = await desktopApi().getStatus()
      toast.add({
        type: status.needsRestart ? "warning" : undefined,
        description: status.needsRestart
          ? m.toast_enabled_description({ name: draft.name })
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
        const status = await desktopApi().enableProvider(id)
        needsRestart = status.needsRestart
      })
      toast.add({
        type: needsRestart ? "warning" : undefined,
        description: needsRestart
          ? m.toast_enabled_description({ name: provider?.name ?? "" })
          : m.toast_enabled_routed({ name: provider?.name ?? "" }),
      })
    } catch {
      return
    } finally {
      setBusyId(null)
    }
  }

  async function restartDaemon(): Promise<boolean> {
    setRestartingDaemon(true)
    try {
      const status = await desktopApi().restartCodexDaemon()
      setDaemonState(status.codexDaemon)
      toast.add({ description: m.codex_daemon_restarted() })
      return true
    } catch (error) {
      tipError(formatAppError(error))
      return false
    } finally {
      setRestartingDaemon(false)
    }
  }

  async function setProviderQueued(id: string, queued: boolean): Promise<void> {
    try {
      await run(() => desktopApi().setProviderQueued("codex", id, queued))
    } catch {
      return
    }
  }

  function reorderProviders(next: ProviderListItem[]): void {
    setProviders(next)
    void desktopApi()
      .reorderProviders(next.map((item) => item.id))
      .then(setProviders)
      .catch((reorderError) => {
        tipError(formatAppError(reorderError))
        void refresh()
      })
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
    routing,
    presets,
    editorOpen,
    editing,
    deleting,
    busyId,
    daemonState,
    restartingDaemon,
    restartDaemon,
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

export type CodexProvidersSession = ReturnType<typeof useCodexProviders>
