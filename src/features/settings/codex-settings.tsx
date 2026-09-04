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
import { SettingsSection } from "./settings-section"

function formatWriteTime(iso: string | null): string {
  if (!iso) return "尚未写入"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function fileState(exists: boolean): string {
  return exists ? "已存在" : "未找到"
}

export function CodexSettings() {
  const formId = useId()
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const api = window.stackferry
    if (!api) {
      setError("请从 StackFerry 桌面应用打开，而不是浏览器预览页。")
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
        setError(loadError instanceof Error ? loadError.message : String(loadError))
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
          <FieldLegend>Codex 环境</FieldLegend>
          <FieldDescription>
            启用供应商时会写入这里的 config.toml。应用不会改写 auth.json。
          </FieldDescription>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>无法读取状态</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {status?.needsRestart ? (
            <Alert>
              <AlertTitle>需要重启 Codex</AlertTitle>
              <AlertDescription>
                配置已写入，请重启 Codex / 终端后生效。
              </AlertDescription>
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
                <FieldLabel htmlFor={`${formId}-codex-home`}>Codex 目录</FieldLabel>
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
                <FieldLabel htmlFor={`${formId}-last-write`}>上次写入</FieldLabel>
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
