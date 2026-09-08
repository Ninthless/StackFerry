import { useEffect, useMemo, useState } from "react"
import { CheckCircle2Icon, Download, InfoIcon } from "lucide-react"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Field } from "@/components/ui/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import { HintLabel } from "@/features/settings/settings-hint"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

type Props = {
  formId: string
  open: boolean
  baseUrl: string
  apiKey: string
  providerId?: string
  model: string
  onModelChange: (value: string) => void
  onError: (message: string) => void
}

export function GrokModelField({
  formId,
  open,
  baseUrl,
  apiKey,
  providerId,
  model,
  onModelChange,
  onError,
}: Props) {
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchedCount, setFetchedCount] = useState<number | null>(null)
  const modelItems = useMemo(() => {
    if (!model || models.includes(model)) return models
    return [model, ...models]
  }, [models, model])

  useEffect(() => {
    if (!open) return
    setModels([])
    setFetchedCount(null)
  }, [open, providerId])

  async function handleFetchModels(): Promise<void> {
    const api = window.stackferry
    if (!api) {
      onError(m.error_desktop_only())
      return
    }
    setFetching(true)
    try {
      const ids = await api.listGrokModels({ baseUrl, apiKey, providerId })
      setModels(ids)
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
    <Field>
      <HintLabel htmlFor={`${formId}-model`} hint={m.grok_field_model_description()}>
        {m.grok_field_model()}
      </HintLabel>
      <Combobox
        items={modelItems}
        value={model || null}
        inputValue={model}
        onValueChange={(value) => {
          if (typeof value === "string") onModelChange(value)
        }}
        onInputValueChange={(value) => {
          onModelChange(value)
        }}
      >
        <ComboboxInput
          id={`${formId}-model`}
          autoComplete="off"
          placeholder="grok-4.6"
          className="w-full"
        >
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={fetching}
              aria-label={m.session_fetch_models()}
              onClick={() => {
                void handleFetchModels()
              }}
            >
              <Download />
            </InputGroupButton>
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent>
          <ComboboxEmpty>{m.session_models_empty()}</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
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
  )
}
