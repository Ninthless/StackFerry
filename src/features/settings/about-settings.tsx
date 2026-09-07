import { useId } from "react"
import packageJson from "../../../package.json"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import * as m from "@/paraglide/messages.js"

export function AboutSettings() {
  const formId = useId()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.about_legend()}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${formId}-version`}>{m.version_label()}</FieldLabel>
            <Input id={`${formId}-version`} value={packageJson.version} readOnly />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
