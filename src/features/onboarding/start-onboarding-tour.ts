import { driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import { defaultCliId } from "@/features/clis/registry"
import type { NavId } from "@/features/shell/app-sidebar"
import * as m from "@/paraglide/messages.js"
import "./onboarding.css"

export type OnboardingNavigate = (id: NavId) => void

const WAIT_MS = 1000

function visibleTarget(id: string): Element | undefined {
  const matches = document.querySelectorAll(`[data-onboarding="${id}"]`)
  for (const node of matches) {
    if (node instanceof HTMLElement && node.getClientRects().length > 0) return node
  }
  return undefined
}

function stepTarget(id: string): () => Element {
  return () => visibleTarget(id) as Element
}

function tourSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: m.onboarding_welcome_title(),
        description: m.onboarding_welcome_body(),
        align: "center",
      },
    },
    {
      element: stepTarget("cli"),
      waitForElement: WAIT_MS,
      popover: {
        title: m.onboarding_cli_title(),
        description: m.onboarding_cli_body(),
        side: "right",
        align: "start",
      },
    },
    {
      element: stepTarget("add"),
      waitForElement: WAIT_MS,
      popover: {
        title: m.onboarding_add_title(),
        description: m.onboarding_add_body(),
        side: "bottom",
        align: "end",
      },
    },
    {
      element: stepTarget("skills"),
      waitForElement: WAIT_MS,
      popover: {
        title: m.onboarding_skills_title(),
        description: m.onboarding_skills_body(),
        side: "right",
        align: "center",
      },
    },
    {
      element: stepTarget("mcp"),
      waitForElement: WAIT_MS,
      popover: {
        title: m.onboarding_mcp_title(),
        description: m.onboarding_mcp_body(),
        side: "right",
        align: "center",
      },
    },
    {
      element: stepTarget("settings"),
      waitForElement: WAIT_MS,
      popover: {
        title: m.onboarding_settings_title(),
        description: m.onboarding_settings_body(),
        side: "right",
        align: "end",
      },
    },
  ]
}

export function startOnboardingTour(options: {
  navigate: OnboardingNavigate
  onDestroyed: () => void
}): { destroy: () => void } {
  const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  options.navigate(defaultCliId)
  const instance = driver({
    animate,
    allowClose: true,
    allowKeyboardControl: true,
    disableActiveInteraction: true,
    overlayColor: "#000",
    overlayOpacity: 0.55,
    overlayClickBehavior: "close",
    popoverClass: "stackferry-tour",
    stagePadding: 8,
    stageRadius: 10,
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: m.onboarding_next(),
    prevBtnText: m.onboarding_prev(),
    doneBtnText: m.onboarding_done(),
    steps: tourSteps(),
    onPopoverRender(popover) {
      if (instance.isLastStep()) return
      const skip = document.createElement("button")
      skip.type = "button"
      skip.className = "driver-popover-footer-btn driver-popover-skip-btn"
      skip.textContent = m.onboarding_skip()
      skip.addEventListener("click", () => {
        instance.destroy()
      })
      popover.footerButtons.prepend(skip)
    },
    onDestroyed: options.onDestroyed,
  })
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      instance.drive()
    })
  })
  return instance
}
