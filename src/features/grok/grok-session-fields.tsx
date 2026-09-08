import { GROK_EFFORT_LEVELS, isGrokEffortLevel } from "@shared/grok-session"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { EffortScale } from "@/features/clis/effort-scale"
import { HintLabel } from "@/features/settings/settings-hint"
import * as m from "@/paraglide/messages.js"

type Props = {
  formId: string
  effortLevel: string
  contextWindow: string
  autoCompact: string
  onEffortChange: (value: string) => void
  onContextChange: (value: string) => void
  onAutoCompactChange: (value: string) => void
}

export function GrokSessionFields({
  formId,
  effortLevel,
  contextWindow,
  autoCompact,
  onEffortChange,
  onContextChange,
  onAutoCompactChange,
}: Props) {
  const items = [
    { label: m.session_reasoning_default(), value: null, hint: m.session_reasoning_hint_default() },
    ...GROK_EFFORT_LEVELS.map((value) => ({
      label: value,
      value,
      hint: grokEffortHint(value),
    })),
  ]

  return (
    <>
      <Field>
        <HintLabel htmlFor={`${formId}-effort`} hint={m.grok_session_effort_description()}>
          {m.grok_session_effort()}
        </HintLabel>
        <EffortScale
          id={`${formId}-effort`}
          options={items}
          value={effortLevel}
          fasterLabel={m.session_reasoning_faster()}
          deeperLabel={m.session_reasoning_deeper()}
          onChange={(next) => {
            onEffortChange(isGrokEffortLevel(next) ? next : "")
          }}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-context`} hint={m.grok_session_context_description()}>
          {m.grok_session_context()}
        </HintLabel>
        <Input
          id={`${formId}-context`}
          name="contextWindow"
          inputMode="numeric"
          placeholder={m.grok_session_context_placeholder()}
          value={contextWindow}
          onChange={(event) => onContextChange(event.target.value)}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-compact`} hint={m.grok_session_compact_description()}>
          {m.grok_session_compact()}
        </HintLabel>
        <Input
          id={`${formId}-compact`}
          name="autoCompact"
          inputMode="numeric"
          placeholder={m.grok_session_compact_placeholder()}
          value={autoCompact}
          onChange={(event) => onAutoCompactChange(event.target.value)}
        />
      </Field>
    </>
  )
}

function grokEffortHint(value: (typeof GROK_EFFORT_LEVELS)[number]): string {
  switch (value) {
    case "none":
      return m.session_reasoning_hint_none()
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
  }
}
