import type { ComponentType, HTMLAttributes } from "react"
import type { CliToolId } from "@shared/cli-tools"
import { ClaudeIcon, CodexIcon, GrokIcon } from "./cli-icons"

export type CliId = CliToolId

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
  {
    id: "grok-build",
    name: "Grok",
    icon: GrokIcon,
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
