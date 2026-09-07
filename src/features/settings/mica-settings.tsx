import { useEffect, useId, useState } from "react"
import type { MicaState } from "@shared/mica"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { applyMicaDocument } from "@/lib/mica"
import * as m from "@/paraglide/messages.js"
import { HintTitle } from "./settings-hint"

export function MicaSettings() {
  const formId = useId()
  const switchId = `${formId}-mica`
  const [state, setState] = useState<MicaState | null>(null)

  useEffect(() => {
    const api = window.stackferry
    if (!api) {
      setState({ supported: false, enabled: false })
      return
    }
    void api.getMicaState().then((next) => {
      setState(next)
      applyMicaDocument(next.enabled)
    })
  }, [])

  async function handleChange(enabled: boolean): Promise<void> {
    const api = window.stackferry
    if (!api) return
    applyMicaDocument(enabled)
    const next = await api.setMicaPreference(enabled)
    setState(next)
    applyMicaDocument(next.enabled)
  }

  if (!state?.supported) return null

  return (
    <Card>
      <CardHeader>
        <HintTitle hint={m.mica_description()}>
          <CardTitle>{m.mica_legend()}</CardTitle>
        </HintTitle>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={switchId}>{m.mica_label()}</FieldLabel>
          </FieldContent>
          <Switch
            id={switchId}
            checked={state.enabled}
            onCheckedChange={(checked) => {
              void handleChange(checked)
            }}
          />
        </Field>
      </CardContent>
    </Card>
  )
}
