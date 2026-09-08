import { useCallback, useEffect, useMemo, useState } from "react"
import type { SkillImportCandidate, SkillListItem, SkillRepo, SkillRepoDraft, SkillTarget } from "@shared/types"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { filterSkills, isMarketStatus, MARKET_REPO_ALL, type MarketStatus } from "./filter"

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
  const [status, setStatus] = useState<MarketStatus>("all")
  const [repoId, setRepoId] = useState(MARKET_REPO_ALL)
  const [pane, setPane] = useState<"local" | "market">("local")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [importCandidates, setImportCandidates] = useState<SkillImportCandidate[] | null>(null)
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
        if (isSkillList(result)) {
          setSkills(result)
        } else if (Array.isArray(result)) {
          setRepos(result)
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
    const toastId = "skills-refresh"
    toast.add({
      id: toastId,
      type: "loading",
      description: m.toast_skills_refreshing(),
      timeout: 0,
    })
    try {
      await run(() => desktopApi().refreshSkills())
      toast.add({
        id: toastId,
        type: "success",
        description: m.toast_skills_refreshed(),
      })
    } catch {
      toast.close(toastId)
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

  const openImport = useCallback(async (): Promise<void> => {
    try {
      const candidates = await desktopApi().chooseSkillImport()
      if (candidates === null) return
      if (candidates.length === 0) {
        tipError(m.error_skill_import_invalid())
        return
      }
      setImportCandidates(candidates)
    } catch (actionError) {
      tipError(formatAppError(actionError))
    }
  }, [])

  const confirmImport = useCallback(
    async (directories: string[]): Promise<void> => {
      await run(() => desktopApi().importSkills(directories), {
        toast: m.toast_skills_imported({ count: directories.length }),
      })
      setImportCandidates(null)
    },
    [run],
  )

  const closeImport = useCallback((): void => {
    setImportCandidates(null)
  }, [])

  const setSkillsPane = useCallback((next: "local" | "market"): void => {
    setPane(next)
    setQuery("")
    setStatus("all")
    setRepoId(MARKET_REPO_ALL)
  }, [])

  const setMarketStatus = useCallback((next: string): void => {
    if (isMarketStatus(next)) setStatus(next)
  }, [])

  const setMarketRepo = useCallback((next: string): void => {
    setRepoId(next || MARKET_REPO_ALL)
  }, [])

  useEffect(() => {
    if (repoId === MARKET_REPO_ALL) return
    if (!repos.some((repo) => repo.id === repoId)) setRepoId(MARKET_REPO_ALL)
  }, [repoId, repos])

  const addRepo = useCallback(
    async (draft: SkillRepoDraft): Promise<void> => {
      await run(() => desktopApi().addSkillRepo(draft), { toast: m.toast_skill_repo_added() })
      setRefreshing(true)
      try {
        await run(() => desktopApi().refreshSkills())
      } finally {
        setRefreshing(false)
      }
    },
    [run],
  )

  const removeRepo = useCallback(
    async (id: string): Promise<void> => {
      await run(() => desktopApi().removeSkillRepo(id))
    },
    [run],
  )

  const visible = useMemo(
    () => filterSkills({ skills, pane, query, status, repoId }),
    [pane, query, repoId, skills, status],
  )

  const sourceEmpty = useMemo(
    () => filterSkills({ skills, pane, query: "", status: "all", repoId: MARKET_REPO_ALL }).length === 0,
    [pane, skills],
  )

  const updateCount = useMemo(
    () => skills.reduce((count, skill) => count + (skill.updateAvailable ? 1 : 0), 0),
    [skills],
  )

  return {
    skills: visible,
    sourceEmpty,
    updateCount,
    repos,
    query,
    setQuery,
    status,
    setStatus: setMarketStatus,
    repoId,
    setRepoId: setMarketRepo,
    pane,
    setPane: setSkillsPane,
    busyId,
    refreshing,
    importCandidates,
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
    openImport,
    confirmImport,
    closeImport,
    addRepo,
    removeRepo,
  }
}

export type SkillsSession = ReturnType<typeof useSkills>

function isSkillList(value: SkillListItem[] | SkillRepo[] | void): value is SkillListItem[] {
  return Array.isArray(value) && value.length > 0 && "installed" in value[0]
}
