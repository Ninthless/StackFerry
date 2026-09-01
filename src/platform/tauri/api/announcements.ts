import { invoke } from "@tauri-apps/api/core";

export type AnnouncementSeverity = "info" | "important" | "critical";
export type AnnouncementActionType = "update" | "external";

export interface AnnouncementAction {
  type: AnnouncementActionType;
  url?: string | null;
  label: string;
}

export interface Announcement {
  id: string;
  category: "release" | "maintenance" | "security" | "service";
  severity: AnnouncementSeverity;
  publishedAt: string;
  relatedVersion?: string | null;
  title: string;
  summary: string;
  body: string;
  actions: AnnouncementAction[];
  read: boolean;
  dismissed: boolean;
  acknowledged: boolean;
}

export interface AnnouncementFeed {
  announcements: Announcement[];
  unreadCount: number;
  fetchedAt?: number | null;
  stale: boolean;
  refreshError?: string | null;
}

export const announcementsApi = {
  get: (language: string) =>
    invoke<AnnouncementFeed>("get_announcements", { language }),
  refresh: (language: string) =>
    invoke<AnnouncementFeed>("refresh_announcements", { language }),
  markRead: (id: string) => invoke<void>("mark_announcement_read", { id }),
  markAllRead: () => invoke<void>("mark_all_announcements_read"),
  dismiss: (id: string) => invoke<void>("dismiss_announcement", { id }),
  acknowledge: (id: string) => invoke<void>("acknowledge_announcement", { id }),
};
