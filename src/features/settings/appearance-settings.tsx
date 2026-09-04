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
import { SettingsSection } from "./settings-section"

const THEME_OPTIONS = [
  {
    value: "system",
    label: "跟随系统",
    description: "与操作系统的浅色 / 深色模式保持一致。",
  },
  {
    value: "light",
    label: "浅色",
    description: "始终使用浅色界面。",
  },
  {
    value: "dark",
    label: "深色",
    description: "始终使用深色界面。",
  },
] as const

export function AppearanceSettings() {
  const formId = useId()
  const { theme, setTheme } = useTheme()

  return (
    <SettingsSection>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>外观</FieldLegend>
          <FieldDescription>选择 StackFerry 的配色，仅作用于本应用。</FieldDescription>
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
                    <FieldLabel htmlFor={optionId}>{option.label}</FieldLabel>
                    <FieldDescription>{option.description}</FieldDescription>
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
