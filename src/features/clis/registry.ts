import type { LucideIcon } from "lucide-react"
import { SquareTerminal } from "lucide-react"

export type CliId = "codex"

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
]

export const defaultCliId: CliId = "codex"

export function cliById(id: CliId): CliDefinition {
  const found = clis.find((cli) => cli.id === id)
  if (!found) {
    throw new Error(`Unknown CLI: ${id}`)
  }
  return found
}
