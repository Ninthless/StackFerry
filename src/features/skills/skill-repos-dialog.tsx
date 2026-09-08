import { useEffect, useId, useState, type FormEvent } from "react"
import { parseSkillRepoInput } from "@shared/skills"
import type { SkillRepo, SkillRepoDraft } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

type Props = {
  open: boolean
  repos: SkillRepo[]
  onOpenChange: (open: boolean) => void
  onAdd: (draft: SkillRepoDraft) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function SkillReposDialog({ open, repos, onOpenChange, onAdd, onRemove }: Props) {
  const formId = useId()
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setUrl("")
    setError("")
  }, [open])

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      await onAdd(parseSkillRepoInput(url))
      setUrl("")
    } catch (submitError) {
      setError(formatAppError(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.skills_repo_title()}</DialogTitle>
          <DialogDescription>{m.skills_repo_description()}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-56">
          {repos.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{m.skills_repo_empty_title()}</EmptyTitle>
                <EmptyDescription>{m.skills_repo_empty_description()}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {repos.map((repo) => (
                <Item key={repo.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>
                      {repo.owner}/{repo.name}
                    </ItemTitle>
                    <ItemDescription>
                      {repo.subdirectory ? `${repo.branch} · ${repo.subdirectory}` : repo.branch}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void onRemove(repo.id)}>
                      {m.skills_repo_remove()}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </ScrollArea>
        <form id={formId} onSubmit={(event) => void handleAdd(event)}>
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={`${formId}-url`}>{m.skills_repo_url()}</FieldLabel>
              <Input
                id={`${formId}-url`}
                value={url}
                placeholder={m.skills_repo_url_placeholder()}
                aria-invalid={error ? true : undefined}
                onChange={(event) => setUrl(event.target.value)}
              />
              <FieldDescription>{m.skills_repo_url_hint()}</FieldDescription>
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button form={formId} type="submit" disabled={saving}>
            {m.skills_repo_add()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
