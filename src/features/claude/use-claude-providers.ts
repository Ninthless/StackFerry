import { useCallback, useEffect, useState } from "react"
import { emptyRoutingSnapshot, type RoutingLaneState } from "@shared/routing"
import type { ClaudePreset, ClaudeProviderDraft, ClaudeProviderListItem } from "@shared/types"
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

const EMPTY_ROUTING = emptyRoutingSnapshot().lanes["claude-code"]

export function useClaudeProviders() {
  const [providers, setProviders] = useState<ClaudeProviderListItem[]>([])
  const [routing, setRouting] = useState<RoutingLaneState>(EMPTY_ROUTING)
  const [presets, setPresets] = useState<ClaudePreset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ClaudeProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<ClaudeProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    const [nextProviders, nextRouting] = await Promise.all([
      api.listClaudeProviders(),
      api.getRouting(),
    ])
    setProviders(nextProviders)
    setRouting(nextRouting.lanes["claude-code"])
  }, [])

  useEffect(() => {
    try {
      void desktopApi().listClaudePresets().then(setPresets)
      void refresh().catch((loadError) => {
        window.setTimeout(() => tipError(formatAppError(loadError), "claude-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(formatAppError(loadError), "claude-load"), 0)
    }
    if (!window.stackferry) return
    return window.stackferry.onClaudeChanged(() => {
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

  function openEdit(provider: ClaudeProviderListItem): void {
    setEditing(provider)
    setEditorOpen(true)
  }

  async function saveProvider(draft: ClaudeProviderDraft): Promise<void> {
    const api = desktopApi()
    const wasEditing = Boolean(editing)
    await run(
      async () => {
        if (editing) {
          await api.updateClaudeProvider(editing.id, draft)
          return
        }
        await api.addClaudeProvider(draft)
      },
      { toastError: false },
    )
    const rewriteLive = wasEditing && editing?.enabled
    setEditorOpen(false)
    setEditing(null)
    if (rewriteLive) {
      const status = await desktopApi().getClaudeStatus()
      toast.add({
        type: status.needsRestart ? "warning" : undefined,
        description: status.needsRestart
          ? m.toast_claude_enabled({ name: draft.name })
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
        const status = await desktopApi().enableClaudeProvider(id)
        needsRestart = status.needsRestart
      })
      toast.add({
        type: needsRestart ? "warning" : undefined,
        description: needsRestart
          ? m.toast_claude_enabled({ name: provider?.name ?? "" })
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
      await run(() => desktopApi().setProviderQueued("claude-code", id, queued))
    } catch {
      return
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return
    try {
      await run(() => desktopApi().deleteClaudeProvider(deleting.id))
      setDeleting(null)
      toast.add({
        description: m.toast_provider_deleted(),
      })
    } catch {
      return
    }
  }

  function reorderProviders(next: ClaudeProviderListItem[]): void {
    setProviders(next)
    void desktopApi()
      .reorderClaudeProviders(next.map((item) => item.id))
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

export type ClaudeProvidersSession = ReturnType<typeof useClaudeProviders>
