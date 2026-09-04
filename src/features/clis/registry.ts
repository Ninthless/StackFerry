import type { LucideIcon } from "lucide-react"
import { Bot, SquareTerminal } from "lucide-react"

export type CliId = "codex" | "claude-code"

export type CliDefinition = {
  id: CliId
  name: string
  icon: LucideIcon
}

export const clis: CliDefinition[] = [
  {
    id: "codex",
    name: "Codex",
    icon: SquareTerminal,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    icon: Bot,
  },
]

export const defaultCliId: CliId = "codex"

export function cliById(id: CliId): CliDefinition {
  const found = clis.find((cli) => cli.id === id)
  if (!found) {
    throw new Error(`Unknown CLI: ${id}`)
  }
  return found
}
