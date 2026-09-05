import { useMemo, useState } from "react"
import { CheckCircle2Icon, CircleHelp, Download, InfoIcon } from "lucide-react"
import {
  REASONING_EFFORTS,
  overlayBaseUrl,
  overlaySession,
  withOverlaySession,
  type OverlaySession,
} from "@shared/provider-overlay"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

function FieldHint({
  htmlFor,
  label,
  hint,
}: {
  htmlFor: string
  label: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-1">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <Tooltip>
        <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" />}>
          <CircleHelp />
          <span className="sr-only">{m.field_hint()}</span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function reasoningItems() {
  return [
    { label: m.session_reasoning_default(), value: null },
    ...REASONING_EFFORTS.map((value) => ({ label: value, value })),
  ]
}

type Props = {
  formId: string
  tomlText: string
  apiKey: string
  providerId?: string
  onTomlChange: (value: string) => void
  onError: (message: string) => void
}

export function CodexSessionFields({
  formId,
  tomlText,
  apiKey,
  providerId,
  onTomlChange,
  onError,
}: Props) {
  const session = overlaySession(tomlText)
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchedCount, setFetchedCount] = useState<number | null>(null)
  const items = reasoningItems()
  const modelItems = useMemo(() => {
    if (!session.model || models.includes(session.model)) return models
    return [session.model, ...models]
  }, [models, session.model])

  function patchSession(patch: Partial<OverlaySession>): void {
    try {
      onTomlChange(withOverlaySession(tomlText, patch))
      onError("")
    } catch (error) {
      onError(formatAppError(error))
    }
  }

  async function handleFetchModels(): Promise<void> {
    const api = window.stackferry
    if (!api) {
      onError(m.error_desktop_only())
      return
    }
    setFetching(true)
    try {
      const ids = await api.listModels({
        baseUrl: overlayBaseUrl(tomlText),
        apiKey,
        providerId,
      })
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
    <>
      <Field>
        <FieldHint
          htmlFor={`${formId}-model`}
          label={m.session_model()}
          hint={m.session_model_description()}
        />
        <Combobox
          items={modelItems}
          value={session.model || null}
          inputValue={session.model}
          onValueChange={(value) => {
            if (typeof value === "string") patchSession({ model: value })
          }}
          onInputValueChange={(value) => {
            patchSession({ model: value })
          }}
        >
          <ComboboxInput
            id={`${formId}-model`}
            autoComplete="off"
            placeholder="gpt-5.4"
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
      <Field>
        <FieldHint
          htmlFor={`${formId}-reasoning`}
          label={m.session_reasoning()}
          hint={m.session_reasoning_description()}
        />
        <Select
          items={items}
          value={session.reasoningEffort || null}
          onValueChange={(value) => {
            patchSession({
              reasoningEffort:
                typeof value === "string" && isReasoningOption(value) ? value : "",
            })
          }}
        >
          <SelectTrigger id={`${formId}-reasoning`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value ?? "default"} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldHint
          htmlFor={`${formId}-context`}
          label={m.session_context()}
          hint={m.session_context_description()}
        />
        <Input
          id={`${formId}-context`}
          name="contextWindow"
          inputMode="numeric"
          placeholder={m.session_context_placeholder()}
          value={session.contextWindow}
          onChange={(event) => patchSession({ contextWindow: event.target.value })}
        />
      </Field>
      <Field>
        <FieldHint
          htmlFor={`${formId}-compact`}
          label={m.session_compact()}
          hint={m.session_compact_description()}
        />
        <Input
          id={`${formId}-compact`}
          name="autoCompact"
          inputMode="numeric"
          placeholder={m.session_compact_placeholder()}
          value={session.autoCompact}
          onChange={(event) => patchSession({ autoCompact: event.target.value })}
        />
      </Field>
    </>
  )
}

function isReasoningOption(value: string): value is (typeof REASONING_EFFORTS)[number] {
  return (REASONING_EFFORTS as readonly string[]).includes(value)
}
