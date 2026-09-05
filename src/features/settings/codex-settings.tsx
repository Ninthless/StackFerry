import { useEffect, useId, useState } from "react"
import type { AppStatus } from "@shared/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { SettingsSection } from "./settings-section"

function formatWriteTime(iso: string | null): string {
  if (!iso) return m.never_written()
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function fileState(exists: boolean): string {
  return exists ? m.file_exists() : m.file_missing()
}

export function CodexSettings() {
  const formId = useId()
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      setLoading(false)
      return
    }

    let cancelled = false

    async function load(): Promise<void> {
      try {
        const next = await api.getStatus()
        if (cancelled) return
        setStatus(next)
        setError("")
      } catch (loadError) {
        if (cancelled) return
        setError(formatAppError(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const unsubscribe = api.onChanged(() => {
      void load()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return (
    <SettingsSection>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{m.codex_env_legend()}</FieldLegend>
          <FieldDescription>{m.codex_env_description()}</FieldDescription>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{m.status_read_failed()}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {status?.needsRestart ? (
            <Alert>
              <AlertTitle>{m.restart_codex_title()}</AlertTitle>
              <AlertDescription>{m.restart_codex_description()}</AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </>
          ) : status ? (
            <>
              <Field>
                <FieldLabel htmlFor={`${formId}-codex-home`}>{m.codex_home_label()}</FieldLabel>
                <Input id={`${formId}-codex-home`} value={status.codexHome} readOnly />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-config`}>config.toml</FieldLabel>
                <Input id={`${formId}-config`} value={fileState(status.configExists)} readOnly />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-auth`}>auth.json</FieldLabel>
                <Input id={`${formId}-auth`} value={fileState(status.authExists)} readOnly />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-last-write`}>{m.last_write_label()}</FieldLabel>
                <Input
                  id={`${formId}-last-write`}
                  value={formatWriteTime(status.lastWriteAt)}
                  readOnly
                />
              </Field>
            </>
          ) : null}
        </FieldSet>
      </FieldGroup>
    </SettingsSection>
  )
}
