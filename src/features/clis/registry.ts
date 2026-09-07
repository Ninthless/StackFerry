import type { ComponentType, HTMLAttributes } from "react"
import { ClaudeIcon, CodexIcon } from "./cli-icons"

export type CliId = "codex" | "claude-code"

export type CliDefinition = {
  id: CliId
  name: string
  icon: ComponentType<HTMLAttributes<HTMLSpanElement>>
}

export const clis: CliDefinition[] = [
  {
    id: "codex",
    name: "Codex",
    icon: CodexIcon,
  },
  {
    id: "claude-code",
    name: "Claude",
    icon: ClaudeIcon,
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
