import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Plus, Trash2 } from "lucide-react"
import * as m from "@/paraglide/messages.js"

export type McpPair = { key: string; value: string }

export function pairsFromRecord(record: Record<string, string>): McpPair[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }))
}

export function recordFromPairs(pairs: readonly McpPair[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const pair of pairs) {
    const key = pair.key.trim()
    if (!key) continue
    next[key] = pair.value
  }
  return next
}

export function McpPairFields({
  formId,
  label,
  pairs,
  onChange,
}: {
  formId: string
  label: string
  pairs: McpPair[]
  onChange: (pairs: McpPair[]) => void
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldGroup>
        {pairs.map((pair, index) => (
          <Field key={`${formId}-${index}`} orientation="horizontal">
            <Input
              name={`${formId}-key-${index}`}
              aria-label={m.mcp_pair_key()}
              autoComplete="off"
              value={pair.key}
              onChange={(event) => {
                const next = [...pairs]
                next[index] = { ...pair, key: event.target.value }
                onChange(next)
              }}
            />
            <Input
              name={`${formId}-value-${index}`}
              aria-label={m.mcp_pair_value()}
              autoComplete="off"
              value={pair.value}
              onChange={(event) => {
                const next = [...pairs]
                next[index] = { ...pair, value: event.target.value }
                onChange(next)
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.action_delete()}
              onClick={() => onChange(pairs.filter((_, item) => item !== index))}
            >
              <Trash2 />
            </Button>
          </Field>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...pairs, { key: "", value: "" }])}>
          <Plus data-icon="inline-start" />
          {m.mcp_pair_add()}
        </Button>
      </FieldGroup>
    </FieldSet>
  )
}
