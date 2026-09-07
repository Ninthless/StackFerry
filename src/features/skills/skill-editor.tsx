import { useEffect, useId, useState, type FormEvent } from "react"
import type { SkillDocument, SkillDraft } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { MarkdownEditor } from "./markdown-editor"

type Props = {
  open: boolean
  editing: SkillDocument | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: SkillDraft) => Promise<void>
}

export function SkillEditor({ open, editing, onOpenChange, onSubmit }: Props) {
  const formId = useId()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? "")
    setDescription(editing?.description ?? "")
    setBody(editing?.body ?? "")
    setError("")
  }, [open, editing])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      await onSubmit({ name, description, body })
    } catch (submitError) {
      setError(formatAppError(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{editing ? m.skills_editor_edit() : m.skills_editor_create()}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <form id={formId} className="px-4 pb-4" onSubmit={(event) => void handleSubmit(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${formId}-name`}>{m.skills_field_name()}</FieldLabel>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  disabled={Boolean(editing)}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-description`}>{m.skills_field_description()}</FieldLabel>
                <Input
                  id={`${formId}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-body`}>{m.skills_field_body()}</FieldLabel>
                <MarkdownEditor id={`${formId}-body`} value={body} onChange={setBody} />
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </form>
        </ScrollArea>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {m.action_cancel()}
          </Button>
          <Button form={formId} type="submit" disabled={saving}>
            {saving ? m.action_saving() : m.action_save()}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
