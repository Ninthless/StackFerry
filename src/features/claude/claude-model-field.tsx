import { useEffect, useMemo, useState } from "react"
import { CheckCircle2Icon, Download, InfoIcon } from "lucide-react"
import { persistClaudeModels, uniqueClaudeModelIds } from "@shared/claude-models"
import type { ClaudeAuthScheme } from "@shared/types"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox"
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  const [query, setQuery] = useState("")
  const [fetching, setFetching] = useState(false)
  const [fetchedCount, setFetchedCount] = useState<number | null>(null)
  const catalogItems = useMemo(
    () => uniqueClaudeModelIds([query, ...suggestions, ...models]),
    [models, query, suggestions],
  )
  const defaultItems = useMemo(
    () => models.map((id) => ({ label: id, value: id })),
    [models],
  )
  const defaultComboboxItems = useMemo(
    () => uniqueClaudeModelIds([model, ...suggestions]),
    [model, suggestions],
  )

  useEffect(() => {
    if (!open) return
    setSuggestions([])
    setFetchedCount(null)
    setQuery("")
  }, [open, providerId])

  function handleModelsChange(value: string[]): void {
    const persisted = persistClaudeModels(model, value)
    onModelsChange(persisted.models)
    if (persisted.model !== model) onModelChange(persisted.model)
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
            <Combobox
              items={catalogItems}
              multiple
              autoHighlight
              value={models}
              onValueChange={(value) => {
                if (!Array.isArray(value)) return
                handleModelsChange(value.filter((item): item is string => typeof item === "string"))
              }}
              onInputValueChange={setQuery}
            >
              <ComboboxChips>
                <ComboboxValue>
                  {models.map((item) => (
                    <ComboboxChip key={item}>{item}</ComboboxChip>
                  ))}
                </ComboboxValue>
                <ComboboxChipsInput
                  id={`${formId}-models`}
                  autoComplete="off"
                  placeholder={m.claude_field_models_placeholder()}
                />
              </ComboboxChips>
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
          </div>
          <ModelsFetchButton fetching={fetching} onFetch={() => void handleFetchModels()} />
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
        {models.length > 0 ? (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Select
                items={defaultItems}
                value={models.includes(model) ? model : models[0]}
                onValueChange={(value) => {
                  if (typeof value === "string") onModelChange(value)
                }}
              >
                <SelectTrigger id={`${formId}-model`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} side="bottom">
                  <SelectGroup>
                    {defaultItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <ModelsFetchButton fetching={fetching} onFetch={() => void handleFetchModels()} />
          </div>
        ) : (
          <Combobox
            items={defaultComboboxItems}
            value={model || null}
            inputValue={model}
            onValueChange={(value) => {
              if (typeof value === "string") onModelChange(value)
            }}
            onInputValueChange={onModelChange}
          >
            <ComboboxInput
              id={`${formId}-model`}
              autoComplete="off"
              placeholder="claude-sonnet-4-6"
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
        )}
      </Field>
    </>
  )
}

function ModelsFetchButton({
  fetching,
  onFetch,
}: {
  fetching: boolean
  onFetch: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={fetching}
      aria-label={m.session_fetch_models()}
      onClick={onFetch}
    >
      <Download />
    </Button>
  )
}
