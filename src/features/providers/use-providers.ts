import { useCallback, useEffect, useState } from "react"
import type { Preset, ProviderDraft, ProviderListItem, RoutingState } from "@shared/types"
import { DEFAULT_ROUTING_SETTINGS } from "@shared/routing"
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

const EMPTY_ROUTING: RoutingState = {
  queue: [],
  failureThreshold: DEFAULT_ROUTING_SETTINGS.failureThreshold,
  recoveryWaitSeconds: DEFAULT_ROUTING_SETTINGS.recoveryWaitSeconds,
  halfOpenSuccesses: DEFAULT_ROUTING_SETTINGS.halfOpenSuccesses,
  logRetention: DEFAULT_ROUTING_SETTINGS.logRetention,
  port: null,
  active: false,
  logs: [],
  breakers: [],
}

export function useProviders() {
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [routing, setRouting] = useState<RoutingState>(EMPTY_ROUTING)
  const [presets, setPresets] = useState<Preset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<ProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    const [nextProviders, nextRouting] = await Promise.all([
      api.listProviders(),
      api.getRouting(),
    ])
    setProviders(nextProviders)
    setRouting(nextRouting)
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

  async function setProviderQueued(id: string, queued: boolean): Promise<void> {
    try {
      await run(() => desktopApi().setProviderQueued(id, queued))
    } catch {
      return
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
    confirmDelete,
  }
}

export type ProvidersSession = ReturnType<typeof useProviders>
