import {
  CLAUDE_EFFORT_LEVELS,
  isClaudeEffortLevel,
  syncedClaudeAutoCompact,
} from "@shared/claude-session"
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
  onContextChange: (contextWindow: string, autoCompact?: string) => void
  onAutoCompactChange: (value: string) => void
}

export function ClaudeSessionFields({
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
    ...CLAUDE_EFFORT_LEVELS.map((value) => ({
      label: value,
      value,
      hint: claudeEffortHint(value),
    })),
  ]

  return (
    <>
      <Field>
        <HintLabel htmlFor={`${formId}-effort`} hint={m.claude_session_effort_description()}>
          {m.claude_session_effort()}
        </HintLabel>
        <EffortScale
          id={`${formId}-effort`}
          options={items}
          value={effortLevel}
          fasterLabel={m.session_reasoning_faster()}
          deeperLabel={m.session_reasoning_deeper()}
          onChange={(next) => {
            onEffortChange(isClaudeEffortLevel(next) ? next : "")
          }}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-context`} hint={m.claude_session_context_description()}>
          {m.claude_session_context()}
        </HintLabel>
        <Input
          id={`${formId}-context`}
          name="contextWindow"
          inputMode="numeric"
          placeholder={m.claude_session_context_placeholder()}
          value={contextWindow}
          onChange={(event) => {
            const next = event.target.value
            const compact = syncedClaudeAutoCompact(next, contextWindow, autoCompact)
            if (compact === undefined) onContextChange(next)
            else onContextChange(next, compact)
          }}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-compact`} hint={m.claude_session_compact_description()}>
          {m.claude_session_compact()}
        </HintLabel>
        <Input
          id={`${formId}-compact`}
          name="autoCompact"
          inputMode="numeric"
          placeholder={m.claude_session_compact_placeholder()}
          value={autoCompact}
          onChange={(event) => onAutoCompactChange(event.target.value)}
        />
      </Field>
    </>
  )
}

function claudeEffortHint(value: (typeof CLAUDE_EFFORT_LEVELS)[number]): string {
  switch (value) {
    case "low":
      return m.session_reasoning_hint_low()
    case "medium":
      return m.session_reasoning_hint_medium()
    case "high":
      return m.session_reasoning_hint_high()
    case "xhigh":
      return m.session_reasoning_hint_xhigh()
  }
}
