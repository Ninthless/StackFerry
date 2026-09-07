import { useCallback, useEffect, useState } from "react"
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

export function useClaudeProviders() {
  const [providers, setProviders] = useState<ClaudeProviderListItem[]>([])
  const [presets, setPresets] = useState<ClaudePreset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ClaudeProviderListItem | null>(null)
  const [deleting, setDeleting] = useState<ClaudeProviderListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setProviders(await desktopApi().listClaudeProviders())
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
    toast.add({
      type: rewriteLive ? "warning" : undefined,
      description: rewriteLive
        ? m.toast_claude_enabled({ name: draft.name })
        : wasEditing
          ? m.toast_provider_updated()
          : m.toast_provider_added(),
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
      await run(() => desktopApi().enableClaudeProvider(id))
      toast.add({
        type: "warning",
        description: m.toast_claude_enabled({ name: provider?.name ?? "" }),
      })
    } catch {
      return
    } finally {
      setBusyId(null)
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
    reorderProviders,
    confirmDelete,
  }
}

export type ClaudeProvidersSession = ReturnType<typeof useClaudeProviders>
