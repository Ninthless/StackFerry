export const ROUTER_BIND_HOST = '127.0.0.1'
export const ROUTER_PROVIDER_KEY = 'stackferry_router'
export const ROUTER_PROVIDER_NAME = 'StackFerry Router'

export const DEFAULT_ROUTING_SETTINGS = {
  failureThreshold: 3,
  recoveryWaitSeconds: 30,
  halfOpenSuccesses: 1,
  logRetention: 50,
} as const

export type BreakerStateName = 'closed' | 'open' | 'halfOpen'

export type RoutingSettings = {
  queue: string[]
  failureThreshold: number
  recoveryWaitSeconds: number
  halfOpenSuccesses: number
  logRetention: number
  port: number | null
}

export type RoutingSettingsPatch = {
  failureThreshold?: number
  recoveryWaitSeconds?: number
  halfOpenSuccesses?: number
}

export type RoutingLogEntry = {
  at: string
  providerId: string
  model: string
  status: number
  latencyMs: number
  errorCode: string
}

export type RoutingBreakerView = {
  providerId: string
  state: BreakerStateName
}

export type RoutingState = RoutingSettings & {
  active: boolean
  logs: RoutingLogEntry[]
  breakers: RoutingBreakerView[]
}

export function isRoutingSettingsPatch(value: unknown): value is RoutingSettingsPatch {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const patch = value as Record<string, unknown>
  return ['failureThreshold', 'recoveryWaitSeconds', 'halfOpenSuccesses'].every((key) => {
    return patch[key] === undefined || isPositiveInt(patch[key])
  })
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
