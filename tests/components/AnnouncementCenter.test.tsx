import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { AnnouncementCenter } from "@/components/announcements/AnnouncementCenter";
import type { AnnouncementFeed } from "@/lib/api";

const markRead = vi.fn().mockResolvedValue(undefined);
const markAllRead = vi.fn().mockResolvedValue(undefined);
const refresh = vi.fn().mockResolvedValue(undefined);

const feed: AnnouncementFeed = {
  announcements: [
    {
      id: "release",
      category: "release",
      severity: "important",
      publishedAt: "2026-08-12T01:30:00Z",
      relatedVersion: "0.1.18",
      title: "StackFerry v0.1.18 已发布",
      summary: "本次更新带来新的公告系统。",
      body: "第一段。\n\n第二段。",
      actions: [],
      read: false,
      dismissed: false,
      acknowledged: false,
    },
  ],
  unreadCount: 1,
  fetchedAt: 1,
  stale: false,
  refreshError: null,
};

vi.mock("@/contexts/AnnouncementContext", () => ({
  useAnnouncements: () => ({
    feed,
    isLoading: false,
    isRefreshing: false,
    error: null,
    refresh,
    markRead,
    markAllRead,
  }),
}));

describe("AnnouncementCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the announcement without marking the implicit selection read", () => {
    render(<AnnouncementCenter onOpenUpdate={vi.fn()} />);

    expect(screen.getAllByText("StackFerry v0.1.18 已发布")).toHaveLength(2);
    expect(screen.getByText(/第一段。[\s\S]*第二段。/)).toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("marks an announcement read after an explicit selection", async () => {
    render(<AnnouncementCenter onOpenUpdate={vi.fn()} />);

    fireEvent.click(
      screen.getAllByText("StackFerry v0.1.18 已发布")[0].closest("button")!,
    );

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("release"));
    expect(
      screen.getByRole("button", { name: /common.back/ }),
    ).toBeInTheDocument();
  });

  it("supports mark-all-read and refresh actions", () => {
    render(<AnnouncementCenter onOpenUpdate={vi.fn()} />);

    fireEvent.click(screen.getByText("announcements.markAllRead"));
    fireEvent.click(screen.getByRole("button", { name: "common.refresh" }));

    expect(markAllRead).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
