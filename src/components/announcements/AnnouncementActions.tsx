import { ArrowUpCircle, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { Announcement } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function AnnouncementActions({
  announcement,
  onOpenUpdate,
}: {
  announcement: Announcement;
  onOpenUpdate: () => void;
}) {
  if (announcement.actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {announcement.actions.map((action, index) => (
        <Button
          key={`${action.type}-${action.url ?? index}`}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (action.type === "update") {
              onOpenUpdate();
              return;
            }
            if (action.url) {
              void invoke("open_external", { url: action.url });
            }
          }}
        >
          {action.type === "update" ? (
            <ArrowUpCircle className="h-4 w-4" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
