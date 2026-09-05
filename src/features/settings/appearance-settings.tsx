import { useId } from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { isTheme, useTheme } from "@/components/theme-provider"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldTitle } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { applyLanguagePreference, currentLanguagePreference } from "@/lib/locale"
import * as m from "@/paraglide/messages.js"
import { isLanguagePreference } from "@shared/locale"
import { MicaSettings } from "./mica-settings"

const THEME_OPTIONS = [
  { value: "system", label: () => m.theme_system(), icon: MonitorIcon },
  { value: "light", label: () => m.theme_light(), icon: SunIcon },
  { value: "dark", label: () => m.theme_dark(), icon: MoonIcon },
] as const

const LANGUAGE_OPTIONS = [
  { value: "system", label: () => m.language_system() },
  { value: "zh", label: () => m.language_zh() },
  { value: "en", label: () => m.language_en() },
] as const

export function AppearanceSettings() {
  const formId = useId()
  const themeLabelId = `${formId}-theme`
  const languageLabelId = `${formId}-language`
  const { theme, setTheme } = useTheme()
  const language = currentLanguagePreference()

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.appearance_legend()}</CardTitle>
          <CardDescription>{m.appearance_description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldTitle id={themeLabelId}>{m.theme_label()}</FieldTitle>
              <ToggleGroup
                aria-labelledby={themeLabelId}
                value={[theme]}
                onValueChange={(value) => {
                  const next = value[0]
                  if (typeof next === "string" && isTheme(next)) setTheme(next)
                }}
                variant="outline"
                spacing={2}
              >
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      <Icon />
                      {option.label()}
                    </ToggleGroupItem>
                  )
                })}
              </ToggleGroup>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle id={languageLabelId}>{m.language_legend()}</CardTitle>
          <CardDescription>{m.language_description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            aria-labelledby={languageLabelId}
            value={[language]}
            onValueChange={(value) => {
              const next = value[0]
              if (typeof next === "string" && isLanguagePreference(next)) {
                void applyLanguagePreference(next)
              }
            }}
            variant="outline"
            spacing={2}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>
      <MicaSettings />
    </div>
  )
}
