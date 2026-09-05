import { ScrollArea } from "@/components/ui/scroll-area"
import { AboutSettings } from "./about-settings"
import { AppearanceSettings } from "./appearance-settings"
import { RoutingSettings } from "./routing-settings"
import type { SettingsSectionId } from "./sections"

type Props = {
  section: SettingsSectionId
}

export function SettingsPage({ section }: Props) {
  return (
    <ScrollArea className="min-h-0 flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        {section === "appearance" ? <AppearanceSettings /> : null}
        {section === "codex" ? <RoutingSettings /> : null}
        {section === "about" ? <AboutSettings /> : null}
      </div>
    </ScrollArea>
  )
}
