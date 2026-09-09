import { AnnouncementsCard } from "./announcements-card"
import { AppUpdateCard } from "./app-update-card"

export function AboutSettings() {
  return (
    <div className="flex flex-col gap-6">
      <AppUpdateCard />
      <AnnouncementsCard />
    </div>
  )
}
