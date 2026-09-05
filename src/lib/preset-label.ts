import * as m from "../paraglide/messages.js"

const PRESET_LABELS: Record<string, () => string> = {
  official: () => m.preset_official(),
  "openai-api": () => m.preset_openai_api(),
  openrouter: () => m.preset_openrouter(),
  deepseek: () => m.preset_deepseek(),
  custom: () => m.preset_custom(),
}

export function presetLabel(id: string, fallback: string): string {
  return PRESET_LABELS[id]?.() ?? fallback
}
