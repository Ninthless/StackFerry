import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  claudeGatewayNeedsReapply,
  ensureClaudeOnboardingComplete,
  readClaudeOnboardingComplete,
} from '../electron/main/claude/onboarding'

describe('claude onboarding gate', () => {
  it('asks for a rewrite when the gateway url or the onboarding flag is missing', () => {
    expect(
      claudeGatewayNeedsReapply({
        appliedBaseUrl: null,
        expectedBaseUrl: 'https://gateway.example/v1',
        onboardingComplete: true,
      }),
    ).toBe(true)
    expect(
      claudeGatewayNeedsReapply({
        appliedBaseUrl: 'https://gateway.example/v1/',
        expectedBaseUrl: 'https://gateway.example/v1',
        onboardingComplete: false,
      }),
    ).toBe(true)
    expect(
      claudeGatewayNeedsReapply({
        appliedBaseUrl: 'https://gateway.example/v1/',
        expectedBaseUrl: 'https://gateway.example/v1',
        onboardingComplete: true,
      }),
    ).toBe(false)
  })

  it('sets the onboarding flag without dropping existing user state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-onboarding-'))
    const filePath = path.join(root, '.claude.json')
    await writeFile(filePath, `${JSON.stringify({ numStartups: 4, projects: { demo: {} } })}\n`)

    await ensureClaudeOnboardingComplete(filePath)

    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as {
      numStartups: number
      projects: unknown
      hasCompletedOnboarding: boolean
    }
    expect(parsed.numStartups).toBe(4)
    expect(parsed.projects).toEqual({ demo: {} })
    expect(parsed.hasCompletedOnboarding).toBe(true)
    expect(await readClaudeOnboardingComplete(filePath)).toBe(true)
  })

  it('leaves a corrupt user file untouched', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-onboarding-corrupt-'))
    const filePath = path.join(root, '.claude.json')
    await writeFile(filePath, '{')

    await ensureClaudeOnboardingComplete(filePath)

    expect(await readFile(filePath, 'utf8')).toBe('{')
    expect(await readClaudeOnboardingComplete(filePath)).toBe(true)
  })
})
