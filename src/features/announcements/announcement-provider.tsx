import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  formatAnnouncementPublishedAt,
  latestUnreadAnnouncement,
  nextUnreadAnnouncement,
} from "@shared/app-releases"
import type { AnnouncementItem, AnnouncementSnapshot } from "@shared/types"
import { toast } from "@/components/ui/toast"
import { useOnboarding } from "@/features/onboarding/onboarding-session"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

const EMPTY: AnnouncementSnapshot = { items: [], unreadCount: 0 }

const DEV_PREVIEW: AnnouncementSnapshot = {
  unreadCount: 1,
  items: [
    {
      id: "4a394089-8645-478a-9dae-0cf7adfd1f56",
      title: "欢迎使用新版StackFerry",
      body: "有问题请积极反馈，点击下方可打开issues链接",
      htmlUrl: "https://github.com/Ninthless/StackFerry/issues/new",
      tag: "",
      publishedAt: "2026-09-09T15:05:10.879+08:00",
      prerelease: false,
      unread: true,
    },
  ],
}

type AnnouncementSession = {
  snapshot: AnnouncementSnapshot
  loading: boolean
  refreshing: boolean
  error: string
  selected: AnnouncementItem | null
  refresh: (manual: boolean) => Promise<void>
  openItem: (item: AnnouncementItem) => Promise<void>
  nextItem: () => void
  closeItem: () => void
  markAllRead: () => Promise<boolean>
}

const AnnouncementContext = createContext<AnnouncementSession | null>(null)

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AnnouncementSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<AnnouncementItem | null>(null)
  const prompted = useRef(false)
  const { completed: onboardingCompleted, running: onboardingRunning } = useOnboarding()

  const promptUnread = useCallback((next: AnnouncementSnapshot) => {
    if (prompted.current) return
    prompted.current = true
    setSelected((current) => current ?? latestUnreadAnnouncement(next))
  }, [])

  const refresh = useCallback(async (manual: boolean) => {
    const api = window.stackferry
    if (!api) {
      const next = import.meta.env.DEV ? DEV_PREVIEW : EMPTY
      setSnapshot(next)
      setError(import.meta.env.DEV ? "" : m.error_desktop_only())
      setLoading(false)
      return
    }
    setRefreshing(true)
    const toastId = "announcements-refresh"
    if (manual) {
      toast.add({ id: toastId, type: "loading", description: m.toast_announcements_refreshing(), timeout: 0 })
    }
    try {
      const next = await api.refreshAnnouncements()
      setSnapshot(next)
      setError("")
      if (manual) toast.add({ id: toastId, type: "success", description: m.toast_announcements_refreshed() })
    } catch (refreshError) {
      const message = formatAppError(refreshError)
      setError(message)
      if (manual) {
        toast.close(toastId)
        toast.add({ type: "error", description: message, priority: "high" })
      } else if (import.meta.env.DEV) {
        setSnapshot(DEV_PREVIEW)
      }
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(false)
  }, [refresh])

  useEffect(() => {
    if (loading || onboardingCompleted !== true || onboardingRunning) return
    promptUnread(snapshot)
  }, [loading, onboardingCompleted, onboardingRunning, promptUnread, snapshot])

  const openItem = useCallback(async (item: AnnouncementItem) => {
    setSelected(item)
    if (!item.unread) return
    const api = window.stackferry
    if (!api) {
      setSnapshot((current) => ({
        items: current.items.map((entry) =>
          entry.id === item.id ? { ...entry, unread: false } : entry,
        ),
        unreadCount: current.items.reduce(
          (count, entry) => count + (entry.id !== item.id && entry.unread ? 1 : 0),
          0,
        ),
      }))
      return
    }
    try {
      setSnapshot(await api.markAnnouncementRead(item.id))
    } catch (markError) {
      toast.add({ type: "error", description: formatAppError(markError), priority: "high" })
    }
  }, [])

  const nextItem = useCallback(() => {
    setSelected((current) => {
      if (!current) return current
      return nextUnreadAnnouncement(snapshot, current.id) ?? current
    })
  }, [snapshot])

  const markAllRead = useCallback(async () => {
    const api = window.stackferry
    if (!api) {
      setSnapshot((current) => ({
        items: current.items.map((item) => ({ ...item, unread: false })),
        unreadCount: 0,
      }))
      return true
    }
    try {
      setSnapshot(await api.markAllAnnouncementsRead())
      return true
    } catch (markError) {
      toast.add({ type: "error", description: formatAppError(markError), priority: "high" })
      return false
    }
  }, [])

  const value = useMemo<AnnouncementSession>(
    () => ({
      snapshot,
      loading,
      refreshing,
      error,
      selected,
      refresh,
      openItem,
      nextItem,
      closeItem() {
        setSelected(null)
      },
      markAllRead,
    }),
    [error, loading, markAllRead, nextItem, openItem, refresh, refreshing, selected, snapshot],
  )

  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>
}

export function useAnnouncements(): AnnouncementSession {
  const session = useContext(AnnouncementContext)
  if (!session) {
    throw new Error("useAnnouncements requires AnnouncementProvider")
  }
  return session
}

export function announcementMeta(item: Pick<AnnouncementItem, "tag" | "publishedAt">): string {
  return [item.tag, formatAnnouncementPublishedAt(item.publishedAt)].filter(Boolean).join(" · ")
}
