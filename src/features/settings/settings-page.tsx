import { useId, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppearanceSettings } from "./appearance-settings"
import { CodexSettings } from "./codex-settings"
import { AboutSettings } from "./about-settings"

const SECTIONS = [
  { id: "appearance", label: "外观" },
  { id: "codex", label: "Codex" },
  { id: "about", label: "关于" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((section) => section.id === value)
}

export function SettingsPage() {
  const tabsId = useId()
  const [section, setSection] = useState<SectionId>("appearance")

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Tabs
        value={section}
        onValueChange={(value) => {
          if (typeof value === "string" && isSectionId(value)) setSection(value)
        }}
        orientation="vertical"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList className="mt-6 ml-6 shrink-0 self-start">
          {SECTIONS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} id={`${tabsId}-${item.id}`}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="appearance" className="flex min-h-0 flex-col overflow-hidden">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="codex" className="flex min-h-0 flex-col overflow-hidden">
          <CodexSettings />
        </TabsContent>
        <TabsContent value="about" className="flex min-h-0 flex-col overflow-hidden">
          <AboutSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
