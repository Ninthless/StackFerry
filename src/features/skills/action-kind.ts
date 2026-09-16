import type { SkillListItem, SkillRepo } from "@shared/skills"

export function isSkillListResult(value: SkillListItem[] | SkillRepo[] | void): value is SkillListItem[] {
  return Array.isArray(value) && value.length > 0 && "installed" in value[0]
}

export function isRepoListResult(value: SkillListItem[] | SkillRepo[] | void): value is SkillRepo[] {
  return Array.isArray(value) && value.length > 0 && !("installed" in value[0])
}
