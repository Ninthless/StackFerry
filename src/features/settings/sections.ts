import { InfoIcon, PaletteIcon, SquareTerminalIcon, WaypointsIcon } from "lucide-react"
import * as m from "@/paraglide/messages.js"

export const SETTINGS_SECTIONS = [
  { id: "appearance", label: () => m.settings_appearance(), icon: PaletteIcon },
  { id: "cli", label: () => m.settings_cli(), icon: SquareTerminalIcon },
  { id: "routing", label: () => m.settings_codex(), icon: WaypointsIcon },
  { id: "about", label: () => m.settings_about(), icon: InfoIcon },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

export const defaultSettingsSectionId: SettingsSectionId = "appearance"

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value)
}
