import { useCallback, useEffect, useMemo, useState } from "react"
import type { SkillDocument, SkillDraft, SkillListItem, SkillRepo, SkillRepoDraft, SkillTarget } from "@shared/types"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

function desktopApi() {
  if (!window.stackferry) {
    throw new Error(m.error_desktop_only())
  }
  return window.stackferry
}

function tipError(description: string, id?: string): void {
  toast.add({ id, type: "error", description, priority: "high" })
}

export function useSkills() {
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [repos, setRepos] = useState<SkillRepo[]>([])
  const [query, setQuery] = useState("")
  const [pane, setPane] = useState<"local" | "market">("local")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SkillDocument | null>(null)
  const [deleting, setDeleting] = useState<SkillListItem | null>(null)
  const [reposOpen, setReposOpen] = useState(false)

  const refresh = useCallback(async () => {
    const api = desktopApi()
    const [nextSkills, nextRepos] = await Promise.all([api.listSkills(), api.listSkillRepos()])
    setSkills(nextSkills)
    setRepos(nextRepos)
  }, [])

  useEffect(() => {
    try {
      void refresh().catch((loadError) => {
        window.setTimeout(() => tipError(formatAppError(loadError), "skills-load"), 0)
      })
    } catch (loadError) {
      window.setTimeout(() => tipError(formatAppError(loadError), "skills-load"), 0)
    }
    if (!window.stackferry) return
    return window.stackferry.onSkillsChanged(() => {
      void refresh()
    })
  }, [refresh])

  const run = useCallback(
    async (
      action: () => Promise<SkillListItem[] | SkillRepo[] | void>,
      options?: { toast?: string },
    ): Promise<void> => {
      try {
        const result = await action()
        if (Array.isArray(result) && result.length && "installed" in result[0]) {
          setSkills(result as SkillListItem[])
        } else if (Array.isArray(result)) {
          setRepos(result as SkillRepo[])
        } else {
          await refresh()
        }
        if (options?.toast) toast.add({ description: options.toast })
      } catch (actionError) {
        tipError(formatAppError(actionError))
        throw actionError
      }
    },
    [refresh],
  )

  const refreshCatalog = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await run(() => desktopApi().refreshSkills(), { toast: m.toast_skills_refreshed() })
    } finally {
      setRefreshing(false)
    }
  }, [run])

  const install = useCallback(
    async (name: string): Promise<void> => {
      setBusyId(name)
      try {
        await run(() => desktopApi().installSkill(name), { toast: m.toast_skill_installed({ name }) })
      } finally {
        setBusyId(null)
      }
    },
    [run],
  )

  const update = useCallback(
    async (name: string): Promise<void> => {
      setBusyId(name)
      try {
        await run(() => desktopApi().updateSkill(name), { toast: m.toast_skill_updated({ name }) })
      } finally {
        setBusyId(null)
      }
    },
    [run],
  )

  const updateAll = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await run(() => desktopApi().updateAllSkills(), { toast: m.toast_skills_updated_all() })
    } finally {
      setRefreshing(false)
    }
  }, [run])

  const setTarget = useCallback(
    async (name: string, target: SkillTarget, enabled: boolean): Promise<void> => {
      setBusyId(name)
      try {
        await run(() => desktopApi().setSkillTarget(name, target, enabled))
      } finally {
        setBusyId(null)
      }
    },
    [run],
  )

  const adopt = useCallback(
    async (name: string): Promise<void> => {
      setBusyId(name)
      try {
        await run(() => desktopApi().adoptSkill(name), { toast: m.toast_skill_adopted({ name }) })
      } finally {
        setBusyId(null)
      }
    },
    [run],
  )

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!deleting) return
    const name = deleting.name
    await run(() => desktopApi().uninstallSkill(name), { toast: m.toast_skill_uninstalled({ name }) })
    setDeleting(null)
  }, [deleting, run])

  const saveSkill = useCallback(
    async (draft: SkillDraft): Promise<void> => {
      if (editing) {
        await run(() => desktopApi().writeSkill(editing.name, draft), {
          toast: m.toast_skill_saved({ name: draft.name }),
        })
      } else {
        await run(() => desktopApi().createSkill(draft), { toast: m.toast_skill_created({ name: draft.name }) })
      }
      setEditorOpen(false)
      setEditing(null)
    },
    [editing, run],
  )

  const openEdit = useCallback(async (skill: SkillListItem): Promise<void> => {
    const document = await desktopApi().readSkill(skill.name)
    setEditing(document)
    setEditorOpen(true)
  }, [])

  const openCreate = useCallback((): void => {
    setEditing(null)
    setEditorOpen(true)
  }, [])

  const closeEditor = useCallback((): void => {
    setEditorOpen(false)
    setEditing(null)
  }, [])

  const setSkillsPane = useCallback((next: "local" | "market"): void => {
    setPane(next)
    setQuery("")
  }, [])

  const addRepo = useCallback(
    async (draft: SkillRepoDraft): Promise<void> => {
      await run(() => desktopApi().addSkillRepo(draft))
    },
    [run],
  )

  const removeRepo = useCallback(
    async (id: string): Promise<void> => {
      await run(() => desktopApi().removeSkillRepo(id))
    },
    [run],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (pane === "local") {
        if (!skill.installed && !skill.orphan) return false
      } else if (!skill.origin || skill.orphan) {
        return false
      }
      if (!needle) return true
      const haystack = `${skill.name} ${skill.description} ${skill.repoLabel ?? ""}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [pane, query, skills])

  const updateCount = useMemo(
    () => skills.reduce((count, skill) => count + (skill.updateAvailable ? 1 : 0), 0),
    [skills],
  )

  return {
    skills: visible,
    updateCount,
    repos,
    query,
    setQuery,
    pane,
    setPane: setSkillsPane,
    busyId,
    refreshing,
    editorOpen,
    editing,
    deleting,
    setDeleting,
    reposOpen,
    setReposOpen,
    refreshCatalog,
    install,
    update,
    updateAll,
    setTarget,
    adopt,
    confirmDelete,
    saveSkill,
    openEdit,
    openCreate,
    closeEditor,
    addRepo,
    removeRepo,
  }
}

export type SkillsSession = ReturnType<typeof useSkills>
