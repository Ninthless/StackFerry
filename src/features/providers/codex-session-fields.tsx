import { useEffect, useMemo, useState } from "react"
import { CheckCircle2Icon, CircleHelp, Download, InfoIcon } from "lucide-react"
import { persistCodexModels, uniqueCodexModelIds } from "@shared/codex-models"
import {
  APPROVAL_POLICIES,
  REASONING_EFFORTS,
  isApprovalPolicy,
  overlayBaseUrl,
  overlaySession,
  syncedAutoCompactValue,
  withOverlaySession,
  type OverlaySession,
} from "@shared/provider-overlay"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
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
import { Input } from "@/components/ui/input"
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EffortScale } from "@/features/clis/effort-scale"
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

function reasoningHint(value: (typeof REASONING_EFFORTS)[number] | null): string {
  switch (value) {
    case "none":
      return m.session_reasoning_hint_none()
    case "minimal":
      return m.session_reasoning_hint_minimal()
    case "low":
      return m.session_reasoning_hint_low()
    case "medium":
      return m.session_reasoning_hint_medium()
    case "high":
      return m.session_reasoning_hint_high()
    case "xhigh":
      return m.session_reasoning_hint_xhigh()
    case "max":
      return m.session_reasoning_hint_max()
    case "ultra":
      return m.session_reasoning_hint_ultra()
    case "persistent":
      return m.session_reasoning_hint_persistent()
    default:
      return m.session_reasoning_hint_default()
  }
}

function reasoningItems() {
  return [
    { label: m.session_reasoning_default(), value: null, hint: reasoningHint(null) },
    ...REASONING_EFFORTS.map((value) => ({
      label: value,
      value,
      hint: reasoningHint(value),
    })),
  ]
}

type Props = {
  formId: string
  tomlText: string
  apiKey: string
  providerId?: string
  models: string[]
  onTomlChange: (value: string) => void
  onModelsChange: (value: string[]) => void
  onError: (message: string) => void
}

export function CodexSessionFields({
  formId,
  tomlText,
  apiKey,
  providerId,
  models,
  onTomlChange,
  onModelsChange,
  onError,
}: Props) {
  const session = overlaySession(tomlText)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [fetching, setFetching] = useState(false)
  const [fetchedCount, setFetchedCount] = useState<number | null>(null)
  const items = reasoningItems()
  const catalogItems = useMemo(
    () => uniqueCodexModelIds([query, ...suggestions, ...models]),
    [models, query, suggestions],
  )
  const defaultItems = useMemo(
    () => models.map((id) => ({ label: id, value: id })),
    [models],
  )
  const defaultComboboxItems = useMemo(
    () => uniqueCodexModelIds([session.model, ...suggestions]),
    [session.model, suggestions],
  )

  useEffect(() => {
    setSuggestions([])
    setFetchedCount(null)
    setQuery("")
  }, [providerId])

  function patchSession(patch: Partial<OverlaySession>): void {
    try {
      onTomlChange(withOverlaySession(tomlText, patch))
      onError("")
    } catch (error) {
      onError(formatAppError(error))
    }
  }

  function handleModelsChange(next: string[]): void {
    const persisted = persistCodexModels(session.model, next)
    onModelsChange(persisted.models)
    if (persisted.model !== session.model) patchSession({ model: persisted.model })
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
        <FieldHint
          htmlFor={`${formId}-models`}
          label={m.session_catalog()}
          hint={m.session_catalog_description()}
        />
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
                  placeholder={m.session_catalog_placeholder()}
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
        <FieldHint
          htmlFor={`${formId}-model`}
          label={m.session_model()}
          hint={m.session_model_description()}
        />
        {models.length > 0 ? (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Select
                items={defaultItems}
                value={models.includes(session.model) ? session.model : models[0]}
                onValueChange={(value) => {
                  if (typeof value === "string") patchSession({ model: value })
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
        )}
      </Field>
      <Field>
        <FieldHint
          htmlFor={`${formId}-reasoning`}
          label={m.session_reasoning()}
          hint={m.session_reasoning_description()}
        />
        <EffortScale
          id={`${formId}-reasoning`}
          tone="codex"
          options={items}
          value={session.reasoningEffort}
          fasterLabel={m.session_reasoning_faster()}
          deeperLabel={m.session_reasoning_deeper()}
          onChange={(next) => {
            patchSession({
              reasoningEffort: isReasoningOption(next) ? next : "",
            })
          }}
        />
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
          onChange={(event) => {
            const contextWindow = event.target.value
            const autoCompact = syncedAutoCompactValue(
              contextWindow,
              session.contextWindow,
              session.autoCompact,
            )
            patchSession(
              autoCompact === undefined
                ? { contextWindow }
                : { contextWindow, autoCompact },
            )
          }}
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
      <Field>
        <FieldHint
          htmlFor={`${formId}-permission`}
          label={m.session_permission()}
          hint={m.session_permission_description()}
        />
        <Select
          items={approvalItems()}
          value={session.approvalPolicy || UNSET_PERMISSION}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            patchSession({
              approvalPolicy: isApprovalPolicy(value) ? value : "",
            })
          }}
        >
          <SelectTrigger id={`${formId}-permission`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            <SelectGroup>
              {approvalItems().map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

const UNSET_PERMISSION = "__unset__"

function approvalItems() {
  return [
    { label: m.session_reasoning_default(), value: UNSET_PERMISSION },
    ...APPROVAL_POLICIES.map((value) => ({ label: value, value })),
  ]
}

function isReasoningOption(value: string): value is (typeof REASONING_EFFORTS)[number] {
  return (REASONING_EFFORTS as readonly string[]).includes(value)
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
