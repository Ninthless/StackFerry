import { useCallback, useEffect, useMemo, useState } from "react"
import type { McpDraft, McpListItem, McpTarget } from "@shared/types"
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

export function useMcps() {
  const [servers, setServers] = useState<McpListItem[]>([])
  const [query, setQuery] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<McpListItem | null>(null)
  const [deleting, setDeleting] = useState<McpListItem | null>(null)

  const refresh = useCallback(async () => {
    setServers(await desktopApi().listMcps())
  }, [])

  useEffect(() => {
    try {
      void refresh().catch((loadError) => {
        window.setTimeout(() => tipError(formatAppError(loadError), "mcp-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(formatAppError(loadError), "mcp-load"), 0)
    }
    if (!window.stackferry) return
    return window.stackferry.onMcpsChanged(() => {
      void refresh()
    })
  }, [refresh])

  const run = useCallback(
    async (action: () => Promise<McpListItem[]>, options?: { toast?: string }): Promise<void> => {
      try {
        setServers(await action())
        if (options?.toast) toast.add({ description: options.toast })
      } catch (actionError) {
        tipError(formatAppError(actionError))
        throw actionError
      }
    },
    [],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return servers
    return servers.filter((server) => {
      const haystack = `${server.name} ${server.id} ${server.command} ${server.url}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [query, servers])

  return {
    servers: filtered,
    sourceEmpty: servers.length === 0,
    query,
    setQuery,
    busyId,
    importing,
    editorOpen,
    editing,
    deleting,
    setDeleting,
    openCreate() {
      setEditing(null)
      setEditorOpen(true)
    },
    openEdit(server: McpListItem) {
      setEditing(server)
      setEditorOpen(true)
    },
    closeEditor() {
      setEditorOpen(false)
    },
    async save(draft: McpDraft): Promise<void> {
      const api = desktopApi()
      await run(() => (editing ? api.updateMcp(editing.id, draft) : api.addMcp(draft)))
      setEditorOpen(false)
    },
    async setTarget(id: string, target: McpTarget, enabled: boolean): Promise<void> {
      setBusyId(id)
      try {
        await run(() => desktopApi().setMcpTarget(id, target, enabled))
      } finally {
        setBusyId(null)
      }
    },
    async importFromLive(): Promise<void> {
      setImporting(true)
      try {
        await run(() => desktopApi().importMcps(), { toast: m.mcp_imported() })
      } finally {
        setImporting(false)
      }
    },
    async confirmDelete(): Promise<void> {
      if (!deleting) return
      const id = deleting.id
      setBusyId(id)
      try {
        await run(() => desktopApi().deleteMcp(id))
        setDeleting(null)
      } finally {
        setBusyId(null)
      }
    },
  }
}

export type McpSession = ReturnType<typeof useMcps>
