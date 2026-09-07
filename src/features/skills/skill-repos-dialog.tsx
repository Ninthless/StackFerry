import { useId, useState, type FormEvent } from "react"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  const [owner, setOwner] = useState("")
  const [name, setName] = useState("")
  const [branch, setBranch] = useState("main")
  const [subdirectory, setSubdirectory] = useState("")

  async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await onAdd({ owner, name, branch, subdirectory })
    setOwner("")
    setName("")
    setBranch("main")
    setSubdirectory("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.skills_repo_title()}</DialogTitle>
          <DialogDescription>{m.skills_repo_description()}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-56">
          <ul className="flex flex-col gap-2">
            {repos.map((repo) => (
              <li key={repo.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate">{repo.owner}/{repo.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {repo.branch}
                    {repo.subdirectory ? ` · ${repo.subdirectory}` : ""}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => void onRemove(repo.id)}>
                  {m.skills_repo_remove()}
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
        <form id={formId} className="grid gap-3" onSubmit={(event) => void handleAdd(event)}>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`${formId}-owner`}>{m.skills_repo_owner()}</FieldLabel>
              <Input id={`${formId}-owner`} value={owner} onChange={(event) => setOwner(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-name`}>{m.skills_repo_name()}</FieldLabel>
              <Input id={`${formId}-name`} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-branch`}>{m.skills_repo_branch()}</FieldLabel>
              <Input id={`${formId}-branch`} value={branch} onChange={(event) => setBranch(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-sub`}>{m.skills_repo_subdirectory()}</FieldLabel>
              <Input
                id={`${formId}-sub`}
                value={subdirectory}
                onChange={(event) => setSubdirectory(event.target.value)}
              />
            </Field>
          </div>
        </form>
        <DialogFooter>
          <Button form={formId} type="submit">
            {m.skills_repo_add()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
