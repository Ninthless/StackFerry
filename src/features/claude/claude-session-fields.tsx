import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_PERMISSION_MODES,
  claudeOverlayFields,
  isClaudeEffortLevel,
  isClaudePermissionMode,
  withClaudeOverlayFields,
} from "@shared/claude-session"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EffortScale } from "@/features/clis/effort-scale"
import { HintLabel } from "@/features/settings/settings-hint"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

type Props = {
  formId: string
  overlayJson: string
  onOverlayChange: (value: string) => void
  onError: (message: string) => void
}

export function ClaudeSessionFields({
  formId,
  overlayJson,
  onOverlayChange,
  onError,
}: Props) {
  const fields = claudeOverlayFields(overlayJson)

  function patchFields(patch: Parameters<typeof withClaudeOverlayFields>[1]): void {
    try {
      onOverlayChange(withClaudeOverlayFields(overlayJson, patch))
      onError("")
    } catch (error) {
      onError(formatAppError(error))
    }
  }
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
          tone="claude"
          options={items}
          value={fields.effortLevel}
          fasterLabel={m.session_reasoning_faster()}
          deeperLabel={m.session_reasoning_deeper()}
          onChange={(next) => {
            patchFields({ effortLevel: isClaudeEffortLevel(next) ? next : "" })
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
          value={fields.contextWindow}
          onChange={(event) => patchFields({ contextWindow: event.target.value })}
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
          value={fields.autoCompact}
          onChange={(event) => patchFields({ autoCompact: event.target.value })}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-permission`} hint={m.claude_session_permission_description()}>
          {m.claude_session_permission()}
        </HintLabel>
        <Select
          items={claudePermissionItems()}
          value={fields.permissionMode || UNSET_PERMISSION}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            patchFields({
              permissionMode: isClaudePermissionMode(value) ? value : "",
            })
          }}
        >
          <SelectTrigger id={`${formId}-permission`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            <SelectGroup>
              {claudePermissionItems().map((item) => (
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

function claudePermissionItems() {
  return [
    { label: m.session_reasoning_default(), value: UNSET_PERMISSION },
    ...CLAUDE_PERMISSION_MODES.map((value) => ({ label: value, value })),
  ]
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
