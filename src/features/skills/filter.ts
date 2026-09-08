import { skillRepoId, type SkillListItem } from "@shared/skills"

export const MARKET_STATUSES = ["all", "available", "installed", "updates"] as const
export type MarketStatus = (typeof MARKET_STATUSES)[number]
export const MARKET_REPO_ALL = "all"

export function isMarketStatus(value: string): value is MarketStatus {
  return (MARKET_STATUSES as readonly string[]).includes(value)
}

function localSkills(skills: SkillListItem[]): SkillListItem[] {
  return skills.filter((skill) => skill.installed || skill.orphan)
}

function marketSkills(skills: SkillListItem[]): SkillListItem[] {
  return skills.filter((skill) => Boolean(skill.origin && !skill.orphan))
}

export function filterSkills(options: {
  skills: SkillListItem[]
  pane: "local" | "market"
  query: string
  status: MarketStatus
  repoId: string
}): SkillListItem[] {
  const source = options.pane === "local" ? localSkills(options.skills) : marketSkills(options.skills)
  const needle = options.query.trim().toLowerCase()
  return source.filter((skill) => {
    if (options.pane === "market" && !matchesMarket(skill, options.status, options.repoId)) return false
    if (!needle) return true
    const haystack = `${skill.name} ${skill.description} ${skill.repoLabel ?? ""}`.toLowerCase()
    return haystack.includes(needle)
  })
}

export function skillRepoSelectLabel(repo: { owner: string; name: string; branch: string; subdirectory: string }): string {
  const base = `${repo.owner}/${repo.name}@${repo.branch}`
  return repo.subdirectory ? `${base} · ${repo.subdirectory}` : base
}

function matchesMarket(skill: SkillListItem, status: MarketStatus, repoId: string): boolean {
  if (status === "available" && skill.installed) return false
  if (status === "installed" && !skill.installed) return false
  if (status === "updates" && !skill.updateAvailable) return false
  if (repoId === MARKET_REPO_ALL || !skill.origin) return true
  return (
    skillRepoId(skill.origin.owner, skill.origin.repo, skill.origin.branch, skill.origin.subdirectory) === repoId
  )
}
