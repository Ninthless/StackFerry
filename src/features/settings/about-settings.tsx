import { useId } from "react"
import packageJson from "../../../package.json"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import * as m from "@/paraglide/messages.js"
import { SettingsSection } from "./settings-section"

export function AboutSettings() {
  const formId = useId()

  return (
    <SettingsSection>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{m.about_legend()}</FieldLegend>
          <FieldDescription>{m.about_description()}</FieldDescription>
          <Field>
            <FieldLabel htmlFor={`${formId}-version`}>{m.version_label()}</FieldLabel>
            <Input id={`${formId}-version`} value={packageJson.version} readOnly />
          </Field>
        </FieldSet>
      </FieldGroup>
    </SettingsSection>
  )
}
