import { ArrowUpCircle, ExternalLink } from "lucide-react";
import { settingsApi, type Announcement } from "@/platform/tauri/api";
import { Button } from "@/shared/ui/button";

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
              void settingsApi.openExternal(action.url);
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
