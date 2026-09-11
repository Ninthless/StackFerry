import { AnnouncementsCard } from "./announcements-card"
import { AppUpdateCard } from "./app-update-card"
import { CcswImportCard } from "./ccsw-import-card"
import { LegacyImportCard } from "./legacy-import-card"

export function AboutSettings() {
  return (
    <div className="flex flex-col gap-6">
      <AppUpdateCard />
      <AnnouncementsCard />
      <LegacyImportCard />
      <CcswImportCard />
    </div>
  )
}
