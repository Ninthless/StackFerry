import { useCallback, useEffect, useId, useState } from "react"
import { DEFAULT_ROUTING_SETTINGS } from "@shared/routing"
import type { ProviderListItem, RoutingState } from "@shared/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { RoutingLogsCard } from "./routing-logs"
import { RoutingQueueField } from "./routing-queue"
import { HintLabel, HintTitle } from "./settings-hint"

const EMPTY_ROUTING: RoutingState = {
  queue: [],
  failureThreshold: DEFAULT_ROUTING_SETTINGS.failureThreshold,
  recoveryWaitSeconds: DEFAULT_ROUTING_SETTINGS.recoveryWaitSeconds,
  halfOpenSuccesses: DEFAULT_ROUTING_SETTINGS.halfOpenSuccesses,
  logRetention: DEFAULT_ROUTING_SETTINGS.logRetention,
  port: null,
  active: false,
  logs: [],
  breakers: [],
}

export function RoutingSettings() {
  const formId = useId()
  const [routing, setRouting] = useState<RoutingState>(EMPTY_ROUTING)
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      return
    }
    try {
      const [nextRouting, nextProviders] = await Promise.all([
        api.getRouting(),
        api.listProviders(),
      ])
      setRouting(nextRouting)
      setProviders(nextProviders)
      setError("")
    } catch (loadError) {
      setError(formatAppError(loadError))
    }
  }, [])

  useEffect(() => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      setLoading(false)
      return
    }

    let cancelled = false

    async function load(): Promise<void> {
      await refresh()
      if (!cancelled) setLoading(false)
    }

    void load()
    const unsubscribe = api.onChanged(() => {
      void refresh()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [refresh])

  async function saveNumber(
    key: "failureThreshold" | "recoveryWaitSeconds" | "halfOpenSuccesses",
    value: string,
  ): Promise<void> {
    const api = window.stackferry
    if (!api) return
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return
    setRouting(await api.setRoutingSettings({ [key]: parsed }))
  }

  function reorderQueue(ids: string[]): void {
    setRouting((current) => ({ ...current, queue: ids }))
    const api = window.stackferry
    if (!api) return
    void api.setQueueOrder(ids).then(setRouting)
  }

  async function resetBreaker(id: string): Promise<void> {
    const api = window.stackferry
    if (!api) return
    setRouting(await api.resetBreaker(id))
  }

  const names = new Map(providers.map((provider) => [provider.id, provider.name]))
  const breakerById = new Map(routing.breakers.map((item) => [item.providerId, item.state]))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <HintTitle hint={m.routing_description()}>
            <CardTitle>{m.routing_legend()}</CardTitle>
          </HintTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{m.status_read_failed()}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {loading ? (
              <>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </>
            ) : (
              <>
                <RoutingQueueField
                  queue={routing.queue}
                  names={names}
                  breakers={breakerById}
                  currentId={providers.find((provider) => provider.enabled && provider.kind === "custom")?.id ?? null}
                  onReorder={(ids) => {
                    void reorderQueue(ids)
                  }}
                  onResetBreaker={(id) => {
                    void resetBreaker(id)
                  }}
                />
                <Field>
                  <HintLabel htmlFor={`${formId}-threshold`} hint={m.routing_failure_threshold_description()}>
                    {m.routing_failure_threshold()}
                  </HintLabel>
                  <Input
                    id={`${formId}-threshold`}
                    type="number"
                    min={1}
                    value={routing.failureThreshold}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (!Number.isInteger(value) || value <= 0) return
                      setRouting((current) => ({ ...current, failureThreshold: value }))
                    }}
                    onBlur={(event) => {
                      void saveNumber("failureThreshold", event.target.value)
                    }}
                  />
                </Field>
                <Field>
                  <HintLabel htmlFor={`${formId}-wait`} hint={m.routing_recovery_wait_description()}>
                    {m.routing_recovery_wait()}
                  </HintLabel>
                  <Input
                    id={`${formId}-wait`}
                    type="number"
                    min={1}
                    value={routing.recoveryWaitSeconds}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (!Number.isInteger(value) || value <= 0) return
                      setRouting((current) => ({ ...current, recoveryWaitSeconds: value }))
                    }}
                    onBlur={(event) => {
                      void saveNumber("recoveryWaitSeconds", event.target.value)
                    }}
                  />
                </Field>
                <Field>
                  <HintLabel htmlFor={`${formId}-half-open`} hint={m.routing_half_open_description()}>
                    {m.routing_half_open()}
                  </HintLabel>
                  <Input
                    id={`${formId}-half-open`}
                    type="number"
                    min={1}
                    value={routing.halfOpenSuccesses}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (!Number.isInteger(value) || value <= 0) return
                      setRouting((current) => ({ ...current, halfOpenSuccesses: value }))
                    }}
                    onBlur={(event) => {
                      void saveNumber("halfOpenSuccesses", event.target.value)
                    }}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      {loading ? null : (
        <RoutingLogsCard logs={routing.logs} names={names} onRefresh={refresh} />
      )}
    </div>
  )
}
