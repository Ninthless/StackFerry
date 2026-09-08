import { useEffect, useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SkillImportCandidate } from "@shared/types"
import * as m from "@/paraglide/messages.js"

type Props = {
  candidates: SkillImportCandidate[] | null
  onOpenChange: (open: boolean) => void
  onConfirm: (directories: string[]) => Promise<void>
}

export function SkillImportDialog({ candidates, onOpenChange, onConfirm }: Props) {
  const [saving, setSaving] = useState(false)
  const importable = candidates?.filter((item) => !item.installed) ?? []

  useEffect(() => {
    setSaving(false)
  }, [candidates])

  async function handleConfirm(): Promise<void> {
    setSaving(true)
    try {
      await onConfirm(importable.map((item) => item.directory))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={candidates !== null} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.skills_import_title()}</DialogTitle>
          <DialogDescription>{m.skills_import_description()}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-56">
          {candidates && candidates.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{m.skills_import_empty_title()}</EmptyTitle>
                <EmptyDescription>{m.skills_import_empty_description()}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {(candidates ?? []).map((skill) => (
                <Item key={skill.directory} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>{skill.name}</ItemTitle>
                    <ItemDescription>{skill.description}</ItemDescription>
                  </ItemContent>
                  {skill.installed ? (
                    <ItemActions>
                      <Badge variant="secondary">{m.skills_import_managed()}</Badge>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {m.action_cancel()}
          </Button>
          <Button type="button" disabled={saving || importable.length === 0} onClick={() => void handleConfirm()}>
            {m.skills_import()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
