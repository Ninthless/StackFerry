import {
  GROK_EFFORT_LEVELS,
  GROK_PERMISSION_MODES,
  grokOverlaySession,
  isGrokEffortLevel,
  isGrokPermissionMode,
  withGrokOverlaySession,
} from "@shared/grok-session"
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
  overlayToml: string
  onOverlayChange: (value: string) => void
  onError: (message: string) => void
}

export function GrokSessionFields({ formId, overlayToml, onOverlayChange, onError }: Props) {
  const session = grokOverlaySession(overlayToml)
  const items = [
    { label: m.session_reasoning_default(), value: null, hint: m.session_reasoning_hint_default() },
    ...GROK_EFFORT_LEVELS.map((value) => ({
      label: value,
      value,
      hint: grokEffortHint(value),
    })),
  ]

  function patchSession(patch: Parameters<typeof withGrokOverlaySession>[1]): void {
    try {
      onOverlayChange(withGrokOverlaySession(overlayToml, patch))
      onError("")
    } catch (error) {
      onError(formatAppError(error))
    }
  }

  return (
    <>
      <Field>
        <HintLabel htmlFor={`${formId}-effort`} hint={m.grok_session_effort_description()}>
          {m.grok_session_effort()}
        </HintLabel>
        <EffortScale
          id={`${formId}-effort`}
          options={items}
          value={session.effortLevel}
          fasterLabel={m.session_reasoning_faster()}
          deeperLabel={m.session_reasoning_deeper()}
          onChange={(next) => {
            patchSession({
              effortLevel: isGrokEffortLevel(next) ? next : "",
            })
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
          value={session.contextWindow}
          onChange={(event) => patchSession({ contextWindow: event.target.value })}
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
          value={session.autoCompact}
          onChange={(event) => patchSession({ autoCompact: event.target.value })}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-permission`} hint={m.grok_session_permission_description()}>
          {m.grok_session_permission()}
        </HintLabel>
        <Select
          items={grokPermissionItems()}
          value={session.permissionMode || UNSET_PERMISSION}
          onValueChange={(value) => {
            if (typeof value !== "string") return
            patchSession({
              permissionMode: isGrokPermissionMode(value) ? value : "",
            })
          }}
        >
          <SelectTrigger id={`${formId}-permission`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            <SelectGroup>
              {grokPermissionItems().map((item) => (
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

function grokPermissionItems() {
  return [
    { label: m.session_reasoning_default(), value: UNSET_PERMISSION },
    ...GROK_PERMISSION_MODES.map((value) => ({ label: value, value })),
  ]
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
