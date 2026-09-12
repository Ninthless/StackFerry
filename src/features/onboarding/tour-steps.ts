import { defaultCliId } from "@/features/clis/registry"
import type { NavId } from "@/features/shell/app-sidebar"

export type OnboardingStepId =
  | "welcome"
  | "cli"
  | "add"
  | "skills"
  | "mcp"
  | "settings"
  | "cli_tools"
  | "routing"
  | "about"

export type OnboardingTourStep = {
  id: OnboardingStepId
  nav: NavId
  target?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}

const SIDEBAR_TARGETS = new Set(["cli", "add", "settings"])

export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: "welcome",
    nav: defaultCliId,
    align: "center",
  },
  {
    id: "cli",
    nav: defaultCliId,
    target: "cli",
    side: "right",
    align: "start",
  },
  {
    id: "add",
    nav: defaultCliId,
    target: "add",
    side: "bottom",
    align: "end",
  },
  {
    id: "skills",
    nav: "skills",
    target: "skills-actions",
    side: "bottom",
    align: "end",
  },
  {
    id: "mcp",
    nav: "mcp",
    target: "mcp-actions",
    side: "bottom",
    align: "end",
  },
  {
    id: "settings",
    nav: defaultCliId,
    target: "settings",
    side: "right",
    align: "end",
  },
  {
    id: "cli_tools",
    nav: "settings:cli",
    target: "cli-tools",
    side: "left",
    align: "start",
  },
  {
    id: "routing",
    nav: "settings:routing",
    target: "routing",
    side: "left",
    align: "start",
  },
  {
    id: "about",
    nav: "settings:about",
    target: "about",
    side: "left",
    align: "start",
  },
]

export function onboardingStepAt(index: number): OnboardingTourStep | undefined {
  return ONBOARDING_TOUR_STEPS[index]
}

function onboardingStepHidesSidebar(step: OnboardingTourStep): boolean {
  return step.nav.startsWith("settings:")
}

export function onboardingSidebarTargetOnMainShell(step: OnboardingTourStep): boolean {
  return !step.target || !SIDEBAR_TARGETS.has(step.target) || !onboardingStepHidesSidebar(step)
}
