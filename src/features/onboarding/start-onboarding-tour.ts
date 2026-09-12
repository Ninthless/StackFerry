import { driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import * as m from "@/paraglide/messages.js"
import {
  ONBOARDING_TOUR_STEPS,
  onboardingStepAt,
  type OnboardingStepId,
  type OnboardingTourStep,
} from "./tour-steps"
import "./onboarding.css"

export type OnboardingNavigate = (id: OnboardingTourStep["nav"]) => void

const WAIT_MS = 1500

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

function stepCopy(id: OnboardingStepId): { title: string; description: string } {
  switch (id) {
    case "welcome":
      return { title: m.onboarding_welcome_title(), description: m.onboarding_welcome_body() }
    case "cli":
      return { title: m.onboarding_cli_title(), description: m.onboarding_cli_body() }
    case "add":
      return { title: m.onboarding_add_title(), description: m.onboarding_add_body() }
    case "skills":
      return { title: m.onboarding_skills_title(), description: m.onboarding_skills_body() }
    case "mcp":
      return { title: m.onboarding_mcp_title(), description: m.onboarding_mcp_body() }
    case "settings":
      return { title: m.onboarding_settings_title(), description: m.onboarding_settings_body() }
    case "cli_tools":
      return { title: m.onboarding_cli_tools_title(), description: m.onboarding_cli_tools_body() }
    case "routing":
      return { title: m.onboarding_routing_title(), description: m.onboarding_routing_body() }
    case "about":
      return { title: m.onboarding_about_title(), description: m.onboarding_about_body() }
  }
}

function tourSteps(): DriveStep[] {
  return ONBOARDING_TOUR_STEPS.map((step) => {
    const copy = stepCopy(step.id)
    return {
      ...(step.target ? { element: stepTarget(step.target), waitForElement: WAIT_MS } : {}),
      popover: {
        title: copy.title,
        description: copy.description,
        side: step.side,
        align: step.align,
      },
    }
  })
}

export function startOnboardingTour(options: {
  navigate: OnboardingNavigate
  onDestroyed: () => void
}): { destroy: () => void } {
  const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const first = onboardingStepAt(0)
  if (first) options.navigate(first.nav)

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
    // driver.js 先等目标出现再高亮，设置页切走侧栏后必须先 navigate 再 wait。
    onNextClick(_element, _step, { driver: tour, index }) {
      const next = onboardingStepAt((index ?? 0) + 1)
      if (next) options.navigate(next.nav)
      tour.moveNext()
    },
    onPrevClick(_element, _step, { driver: tour, index }) {
      const previous = onboardingStepAt((index ?? 0) - 1)
      if (previous) options.navigate(previous.nav)
      tour.movePrevious()
    },
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
