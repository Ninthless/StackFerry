import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  announcementsApi,
  type Announcement,
  type AnnouncementFeed,
} from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";

interface AnnouncementContextValue {
  feed: AnnouncementFeed | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  banner: Announcement | null;
  critical: Announcement | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(
  null,
);

function updateAnnouncement(
  feed: AnnouncementFeed | null,
  id: string,
  update: (announcement: Announcement) => Announcement,
) {
  if (!feed) return feed;
  const announcements = feed.announcements.map((announcement) =>
    announcement.id === id ? update(announcement) : announcement,
  );
  return {
    ...feed,
    announcements,
    unreadCount: announcements.filter((announcement) => !announcement.read)
      .length,
  };
}

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [feed, setFeed] = useState<AnnouncementFeed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      force ? setIsRefreshing(true) : setIsLoading(true);
      try {
        const nextFeed = force
          ? await announcementsApi.refresh(i18n.language)
          : await announcementsApi.get(i18n.language);
        setFeed(nextFeed);
        setError(nextFeed.refreshError ?? null);
      } catch (loadError) {
        setError(extractErrorMessage(loadError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [i18n.language],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const commit = useCallback(
    async (
      id: string,
      operation: () => Promise<void>,
      update: (announcement: Announcement) => Announcement,
    ) => {
      await operation();
      setFeed((current) => updateAnnouncement(current, id, update));
    },
    [],
  );

  const value = useMemo<AnnouncementContextValue>(
    () => ({
      feed,
      isLoading,
      isRefreshing,
      error,
      banner:
        feed?.announcements.find(
          (announcement) =>
            announcement.severity === "important" && !announcement.dismissed,
        ) ?? null,
      critical:
        feed?.announcements.find(
          (announcement) =>
            announcement.severity === "critical" && !announcement.acknowledged,
        ) ?? null,
      refresh: () => load(true),
      markRead: (id) =>
        commit(
          id,
          () => announcementsApi.markRead(id),
          (announcement) => ({ ...announcement, read: true }),
        ),
      markAllRead: async () => {
        await announcementsApi.markAllRead();
        setFeed((current) =>
          current
            ? {
                ...current,
                unreadCount: 0,
                announcements: current.announcements.map((announcement) => ({
                  ...announcement,
                  read: true,
                })),
              }
            : current,
        );
      },
      dismiss: (id) =>
        commit(
          id,
          () => announcementsApi.dismiss(id),
          (announcement) => ({
            ...announcement,
            read: true,
            dismissed: true,
          }),
        ),
      acknowledge: (id) =>
        commit(
          id,
          () => announcementsApi.acknowledge(id),
          (announcement) => ({
            ...announcement,
            read: true,
            acknowledged: true,
          }),
        ),
    }),
    [commit, error, feed, isLoading, isRefreshing, load],
  );

  return (
    <AnnouncementContext.Provider value={value}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncements() {
  const context = useContext(AnnouncementContext);
  if (!context) {
    throw new Error(
      "useAnnouncements must be used within AnnouncementProvider",
    );
  }
  return context;
}
