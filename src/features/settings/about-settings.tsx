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
import { SettingsSection } from "./settings-section"

export function AboutSettings() {
  const formId = useId()

  return (
    <SettingsSection>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>关于</FieldLegend>
          <FieldDescription>
            管理 Codex 与后续 CLI 的供应商配置，一键写入本机配置文件。
          </FieldDescription>
          <Field>
            <FieldLabel htmlFor={`${formId}-version`}>版本</FieldLabel>
            <Input id={`${formId}-version`} value={packageJson.version} readOnly />
          </Field>
        </FieldSet>
      </FieldGroup>
    </SettingsSection>
  )
}
