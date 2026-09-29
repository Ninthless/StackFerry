import { ROUTER_BIND_HOST } from '../../../shared/routing'
import { enableClaudeProvider, type ClaudeIpcContext } from './ipc'
import { claudeSettingsPath } from './home'
import {
  claudeGatewayNeedsReapply,
  readClaudeAppliedBaseUrl,
  readClaudeOnboardingComplete,
} from './onboarding'

export async function reapplyClaudeGatewayIfNeeded(context: ClaudeIpcContext): Promise<void> {
  const id = await context.claudeStore.getActiveId()
  if (!id) return
  let provider
  try {
    provider = await context.claudeStore.peek(id)
  } catch {
    return
  }
  if (provider.kind !== 'custom') return
  const lane = (await context.routing.snapshot()).lanes['claude-code']
  const expected =
    lane.active && lane.port != null ? `http://${ROUTER_BIND_HOST}:${lane.port}` : provider.baseUrl
  const home = (await context.claude.status()).claudeHome
  const drifted = claudeGatewayNeedsReapply({
    appliedBaseUrl: await readClaudeAppliedBaseUrl(claudeSettingsPath(home)),
    expectedBaseUrl: expected,
    onboardingComplete: await readClaudeOnboardingComplete(context.claude.userJsonPath()),
  })
  if (!drifted) return
  await enableClaudeProvider(context, id)
}

export async function reapplyClaudeGatewayOnStartup(context: ClaudeIpcContext): Promise<void> {
  try {
    await reapplyClaudeGatewayIfNeeded(context)
  } catch {
    return
  }
}
