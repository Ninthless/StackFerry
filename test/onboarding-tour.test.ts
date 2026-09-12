import { describe, expect, it } from 'vitest'
import { defaultCliId } from '../src/features/clis/registry'
import {
  ONBOARDING_TOUR_STEPS,
  onboardingSidebarTargetOnMainShell,
  onboardingStepAt,
} from '../src/features/onboarding/tour-steps'

describe('onboarding tour steps', () => {
  it('walks the first-run path in order', () => {
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.id)).toEqual([
      'welcome',
      'cli',
      'add',
      'skills',
      'mcp',
      'settings',
      'cli_tools',
      'routing',
      'about',
    ])
  })

  it('keeps sidebar highlights on the main shell', () => {
    for (const step of ONBOARDING_TOUR_STEPS) {
      expect(onboardingSidebarTargetOnMainShell(step), step.id).toBe(true)
    }
  })

  it('opens Codex before highlighting add', () => {
    const add = ONBOARDING_TOUR_STEPS.find((step) => step.target === 'add')
    expect(add?.nav).toBe(defaultCliId)
  })

  it('enters settings pages only after the settings entry', () => {
    const ids = ONBOARDING_TOUR_STEPS.map((step) => step.id)
    expect(ids.indexOf('settings')).toBeLessThan(ids.indexOf('cli_tools'))
    expect(ids.indexOf('cli_tools')).toBeLessThan(ids.indexOf('routing'))
    expect(ids.indexOf('routing')).toBeLessThan(ids.indexOf('about'))
    expect(onboardingStepAt(ids.indexOf('cli_tools'))?.nav).toBe('settings:cli')
    expect(onboardingStepAt(ids.indexOf('routing'))?.nav).toBe('settings:routing')
    expect(onboardingStepAt(ids.indexOf('about'))?.nav).toBe('settings:about')
  })

  it('uses unique highlight targets', () => {
    const targets = ONBOARDING_TOUR_STEPS.map((step) => step.target).filter(
      (target): target is string => Boolean(target),
    )
    expect(new Set(targets).size).toBe(targets.length)
  })
})
