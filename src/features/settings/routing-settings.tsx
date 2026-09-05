import { useEffect, useId, useState } from "react"
import { ListOrdered } from "lucide-react"
import { DEFAULT_ROUTING_SETTINGS, type BreakerStateName } from "@shared/routing"
import type { ProviderListItem, RoutingState } from "@shared/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { RoutingLogsCard } from "./routing-logs"

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
  const [needsRestart, setNeedsRestart] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      setLoading(false)
      return
    }

    let cancelled = false

    async function load(): Promise<void> {
      try {
        const [nextRouting, nextProviders, status] = await Promise.all([
          api.getRouting(),
          api.listProviders(),
          api.getStatus(),
        ])
        if (cancelled) return
        setRouting(nextRouting)
        setProviders(nextProviders)
        setNeedsRestart(status.needsRestart)
        setError("")
      } catch (loadError) {
        if (cancelled) return
        setError(formatAppError(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const unsubscribe = api.onChanged(() => {
      void load()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

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

  const names = new Map(providers.map((provider) => [provider.id, provider.name]))
  const breakerById = new Map(routing.breakers.map((item) => [item.providerId, item.state]))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.routing_legend()}</CardTitle>
          <CardDescription>{m.routing_description()}</CardDescription>
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
                {needsRestart ? (
                  <Alert>
                    <AlertTitle>{m.restart_codex_title()}</AlertTitle>
                    <AlertDescription>{m.restart_codex_description()}</AlertDescription>
                  </Alert>
                ) : null}
                <Alert>
                  <AlertTitle>{routing.active ? m.routing_active() : m.routing_inactive()}</AlertTitle>
                  <AlertDescription>
                    {routing.active ? m.routing_active_description() : m.routing_inactive_description()}
                  </AlertDescription>
                </Alert>
                <Field>
                  <FieldLabel>{m.routing_queue_label()}</FieldLabel>
                  {routing.queue.length === 0 ? (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <ListOrdered />
                        </EmptyMedia>
                        <EmptyTitle>{m.routing_queue_empty_title()}</EmptyTitle>
                        <EmptyDescription>{m.routing_queue_empty()}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <ItemGroup data-size="sm">
                      {routing.queue.map((id) => (
                        <Item key={id} variant="outline" size="sm">
                          <ItemContent>
                            <ItemTitle>{names.get(id) ?? id}</ItemTitle>
                          </ItemContent>
                          <ItemActions>
                            <Badge variant={breakerBadge(breakerById.get(id))}>
                              {breakerLabel(breakerById.get(id))}
                            </Badge>
                          </ItemActions>
                        </Item>
                      ))}
                    </ItemGroup>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-threshold`}>{m.routing_failure_threshold()}</FieldLabel>
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
                  <FieldDescription>{m.routing_failure_threshold_description()}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-wait`}>{m.routing_recovery_wait()}</FieldLabel>
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
                  <FieldDescription>{m.routing_recovery_wait_description()}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-half-open`}>{m.routing_half_open()}</FieldLabel>
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
                  <FieldDescription>{m.routing_half_open_description()}</FieldDescription>
                </Field>
              </>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      {loading ? null : <RoutingLogsCard logs={routing.logs} names={names} />}
    </div>
  )
}

function breakerLabel(state: BreakerStateName | undefined): string {
  if (state === "open") return m.routing_breaker_open()
  if (state === "halfOpen") return m.routing_breaker_half_open()
  return m.routing_breaker_closed()
}

function breakerBadge(state: BreakerStateName | undefined): "secondary" | "destructive" | "outline" {
  if (state === "open") return "destructive"
  if (state === "halfOpen") return "outline"
  return "secondary"
}
