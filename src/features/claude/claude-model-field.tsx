import { useEffect, useMemo, useState } from "react"
import { Select } from "antd"
import { CheckCircle2Icon, Download, InfoIcon } from "lucide-react"
import { uniqueClaudeModelIds } from "@shared/claude-models"
import type { ClaudeAuthScheme } from "@shared/types"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { HintLabel } from "@/features/settings/settings-hint"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

type Props = {
  formId: string
  open: boolean
  baseUrl: string
  apiKey: string
  authScheme: ClaudeAuthScheme
  providerId?: string
  model: string
  models: string[]
  onModelChange: (value: string) => void
  onModelsChange: (value: string[]) => void
  onError: (message: string) => void
}

export function ClaudeModelField({
  formId,
  open,
  baseUrl,
  apiKey,
  authScheme,
  providerId,
  model,
  models,
  onModelChange,
  onModelsChange,
  onError,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchedCount, setFetchedCount] = useState<number | null>(null)
  const suggestionOptions = useMemo(
    () => suggestions.map((id) => ({ value: id, label: id })),
    [suggestions],
  )
  const defaultOptions = useMemo(
    () => models.map((id) => ({ value: id, label: id })),
    [models],
  )
  const defaultValue = models.includes(model) ? model : undefined

  useEffect(() => {
    if (!open) return
    setSuggestions([])
    setFetchedCount(null)
  }, [open, providerId])

  function handleModelsChange(value: string[]): void {
    const next = uniqueClaudeModelIds(value)
    onModelsChange(next)
    if (!model || !next.includes(model)) onModelChange(next[0] ?? "")
  }

  async function handleFetchModels(): Promise<void> {
    const api = window.stackferry
    if (!api) {
      onError(m.error_desktop_only())
      return
    }
    setFetching(true)
    try {
      const ids = await api.listClaudeModels({
        baseUrl,
        apiKey,
        providerId,
        authScheme,
      })
      setSuggestions(ids)
      setFetchedCount(ids.length)
      onError("")
    } catch (error) {
      setFetchedCount(null)
      onError(formatAppError(error))
    } finally {
      setFetching(false)
    }
  }

  return (
    <>
      <Field>
        <HintLabel htmlFor={`${formId}-models`} hint={m.claude_field_models_description()}>
          {m.claude_field_models()}
        </HintLabel>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Select
              id={`${formId}-models`}
              mode="tags"
              tokenSeparators={[","]}
              style={{ width: "100%" }}
              placeholder="claude-sonnet-4-6"
              value={models}
              options={suggestionOptions}
              notFoundContent={m.session_models_empty()}
              onChange={handleModelsChange}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={fetching}
            aria-label={m.session_fetch_models()}
            onClick={() => {
              void handleFetchModels()
            }}
          >
            <Download />
          </Button>
        </div>
        {fetchedCount == null ? null : (
          <Alert>
            {fetchedCount > 0 ? <CheckCircle2Icon /> : <InfoIcon />}
            <AlertTitle>
              {fetchedCount > 0
                ? m.session_models_fetched({ count: fetchedCount })
                : m.session_models_none()}
            </AlertTitle>
          </Alert>
        )}
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-model`} hint={m.claude_field_model_description()}>
          {m.claude_field_model()}
        </HintLabel>
        <Select
          id={`${formId}-model`}
          style={{ width: "100%" }}
          placeholder="claude-sonnet-4-6"
          value={defaultValue}
          options={defaultOptions}
          onChange={(value) => {
            onModelChange(typeof value === "string" ? value : "")
          }}
        />
      </Field>
    </>
  )
}
