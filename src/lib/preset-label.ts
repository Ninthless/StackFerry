import * as m from "../paraglide/messages.js"

const PRESET_LABELS: Record<string, () => string> = {
  official: () => m.preset_official(),
  "openai-api": () => m.preset_openai_api(),
  openrouter: () => m.preset_openrouter(),
  deepseek: () => m.preset_deepseek(),
  xfcode: () => m.preset_xfcode(),
  custom: () => m.preset_custom(),
}

const CLAUDE_PRESET_LABELS: Record<string, () => string> = {
  official: () => m.preset_claude_official(),
  custom: () => m.preset_custom(),
}

export function presetLabel(id: string, fallback: string): string {
  return PRESET_LABELS[id]?.() ?? fallback
}

export function claudePresetLabel(id: string, fallback: string): string {
  return CLAUDE_PRESET_LABELS[id]?.() ?? fallback
}

export function grokPresetLabel(id: string, fallback: string): string {
  if (id === "official") return m.preset_grok_official()
  return CLAUDE_PRESET_LABELS[id]?.() ?? fallback
}
