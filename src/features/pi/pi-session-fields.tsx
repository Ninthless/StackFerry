import { PI_THINKING_LEVELS, isPiThinkingLevel } from "@shared/types"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { EffortScale } from "@/features/clis/effort-scale"
import { HintLabel } from "@/features/settings/settings-hint"
import * as m from "@/paraglide/messages.js"

type Props = {
  formId: string
  thinkingLevel: string
  contextWindow: string
  contextInvalid: boolean
  onThinkingLevel: (value: string) => void
  onContextWindow: (value: string) => void
}

function thinkingHint(level: string): string {
  if (level === "off") return m.session_reasoning_hint_none()
  if (level === "minimal") return m.session_reasoning_hint_minimal()
  if (level === "low") return m.session_reasoning_hint_low()
  if (level === "medium") return m.session_reasoning_hint_medium()
  if (level === "high") return m.session_reasoning_hint_high()
  if (level === "xhigh") return m.session_reasoning_hint_xhigh()
  if (level === "max") return m.session_reasoning_hint_max()
  return m.session_reasoning_hint_default()
}

export function PiSessionFields({
  formId,
  thinkingLevel,
  contextWindow,
  contextInvalid,
  onThinkingLevel,
  onContextWindow,
}: Props) {
  const options = [
    { label: m.session_reasoning_default(), value: null, hint: m.session_reasoning_hint_default() },
    ...PI_THINKING_LEVELS.map((value) => ({ label: value, value, hint: thinkingHint(value) })),
  ]

  return (
    <>
      <Field>
        <HintLabel htmlFor={`${formId}-thinking`} hint={m.pi_session_thinking_description()}>
          {m.pi_session_thinking()}
        </HintLabel>
        <EffortScale
          id={`${formId}-thinking`}
          tone="pi"
          options={options}
          value={thinkingLevel}
          fasterLabel={m.session_reasoning_faster()}
          deeperLabel={m.session_reasoning_deeper()}
          onChange={(next) => onThinkingLevel(isPiThinkingLevel(next) ? next : "")}
        />
      </Field>
      <Field data-invalid={contextInvalid || undefined}>
        <HintLabel htmlFor={`${formId}-context`} hint={m.pi_session_context_description()}>
          {m.pi_session_context()}
        </HintLabel>
        <Input
          id={`${formId}-context`}
          inputMode="numeric"
          placeholder={m.pi_session_context_placeholder()}
          value={contextWindow}
          onChange={(event) => onContextWindow(event.target.value)}
        />
        {contextInvalid ? <FieldError>{m.error_pi_context_window()}</FieldError> : null}
      </Field>
    </>
  )
}
