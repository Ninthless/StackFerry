import { useId } from "react"
import { isTheme, useTheme } from "@/components/theme-provider"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { applyLanguagePreference, currentLanguagePreference } from "@/lib/locale"
import * as m from "@/paraglide/messages.js"
import { isLanguagePreference } from "@shared/locale"
import { SettingsSection } from "./settings-section"

const THEME_OPTIONS = [
  {
    value: "system",
    label: () => m.theme_system(),
    description: () => m.theme_system_description(),
  },
  {
    value: "light",
    label: () => m.theme_light(),
    description: () => m.theme_light_description(),
  },
  {
    value: "dark",
    label: () => m.theme_dark(),
    description: () => m.theme_dark_description(),
  },
] as const

const LANGUAGE_OPTIONS = [
  {
    value: "system",
    label: () => m.language_system(),
    description: () => m.language_system_description(),
  },
  {
    value: "zh",
    label: () => m.language_zh(),
    description: () => m.language_zh_description(),
  },
  {
    value: "en",
    label: () => m.language_en(),
    description: () => m.language_en_description(),
  },
] as const

export function AppearanceSettings() {
  const formId = useId()
  const { theme, setTheme } = useTheme()
  const language = currentLanguagePreference()

  return (
    <SettingsSection>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{m.appearance_legend()}</FieldLegend>
          <FieldDescription>{m.appearance_description()}</FieldDescription>
          <RadioGroup
            value={theme}
            onValueChange={(value) => {
              if (typeof value === "string" && isTheme(value)) setTheme(value)
            }}
          >
            {THEME_OPTIONS.map((option) => {
              const optionId = `${formId}-theme-${option.value}`
              return (
                <Field key={option.value} orientation="horizontal">
                  <RadioGroupItem value={option.value} id={optionId} />
                  <FieldContent>
                    <FieldLabel htmlFor={optionId}>{option.label()}</FieldLabel>
                    <FieldDescription>{option.description()}</FieldDescription>
                  </FieldContent>
                </Field>
              )
            })}
          </RadioGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend>{m.language_legend()}</FieldLegend>
          <FieldDescription>{m.language_description()}</FieldDescription>
          <RadioGroup
            value={language}
            onValueChange={(value) => {
              if (typeof value === "string" && isLanguagePreference(value)) {
                void applyLanguagePreference(value)
              }
            }}
          >
            {LANGUAGE_OPTIONS.map((option) => {
              const optionId = `${formId}-language-${option.value}`
              return (
                <Field key={option.value} orientation="horizontal">
                  <RadioGroupItem value={option.value} id={optionId} />
                  <FieldContent>
                    <FieldLabel htmlFor={optionId}>{option.label()}</FieldLabel>
                    <FieldDescription>{option.description()}</FieldDescription>
                  </FieldContent>
                </Field>
              )
            })}
          </RadioGroup>
        </FieldSet>
      </FieldGroup>
    </SettingsSection>
  )
}
