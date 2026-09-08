import { useCallback, useEffect, useId, useState } from "react"
import {
  emptyRoutingSnapshot,
  type RoutingLaneId,
  type RoutingLaneState,
  type RoutingSnapshot,
} from "@shared/routing"
import type { ClaudeProviderListItem, GrokProviderListItem, ProviderListItem } from "@shared/types"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { clis, type CliId } from "@/features/clis/registry"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { RoutingLogsCard } from "./routing-logs"
import { RoutingQueueField } from "./routing-queue"
import { HintLabel, HintTitle } from "./settings-hint"

type NamedProvider = {
  id: string
  name: string
  kind: "official" | "custom"
  enabled: boolean
}

export function RoutingSettings() {
  const formId = useId()
  const [routing, setRouting] = useState<RoutingSnapshot>(emptyRoutingSnapshot)
  const [codexProviders, setCodexProviders] = useState<ProviderListItem[]>([])
  const [claudeProviders, setClaudeProviders] = useState<ClaudeProviderListItem[]>([])
  const [grokProviders, setGrokProviders] = useState<GrokProviderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      return
    }
    try {
      const [nextRouting, nextCodex, nextClaude, nextGrok] = await Promise.all([
        api.getRouting(),
        api.listProviders(),
        api.listClaudeProviders(),
        api.listGrokProviders(),
      ])
      setRouting(nextRouting)
      setCodexProviders(nextCodex)
      setClaudeProviders(nextClaude)
      setGrokProviders(nextGrok)
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
    const unsubCodex = api.onChanged(() => {
      void refresh()
    })
    const unsubClaude = api.onClaudeChanged(() => {
      void refresh()
    })

    const unsubGrok = api.onGrokChanged(() => {
      void refresh()
    })

    return () => {
      cancelled = true
      unsubCodex()
      unsubClaude()
      unsubGrok()
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

  function reorderQueue(cliId: RoutingLaneId, ids: string[]): void {
    setRouting((current) => ({
      ...current,
      lanes: { ...current.lanes, [cliId]: { ...current.lanes[cliId], queue: ids } },
    }))
    const api = window.stackferry
    if (!api) return
    void api.setQueueOrder(cliId, ids).then(setRouting)
  }

  async function resetBreaker(cliId: RoutingLaneId, id: string): Promise<void> {
    const api = window.stackferry
    if (!api) return
    setRouting(await api.resetBreaker(cliId, id))
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{m.status_read_failed()}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <HintTitle hint={m.routing_description()}>
            <CardTitle>{m.routing_legend()}</CardTitle>
          </HintTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <FieldGroup>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </FieldGroup>
          ) : (
            <Tabs defaultValue="codex">
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${clis.length}, minmax(0, 1fr))` }}>
                {clis.map((cli) => (
                  <TabsTrigger key={cli.id} value={cli.id} className="flex-1">
                    <cli.icon data-icon="inline-start" />
                    {cli.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {clis.map((cli) => (
                <TabsContent key={cli.id} value={cli.id} className="pt-4">
                  <LanePanel
                    cliId={cli.id}
                    lane={routing.lanes[cli.id]}
                    providers={providersFor(cli.id, codexProviders, claudeProviders, grokProviders)}
                    onRefresh={refresh}
                    onReorder={(ids) => {
                      void reorderQueue(cli.id, ids)
                    }}
                    onResetBreaker={(id) => {
                      void resetBreaker(cli.id, id)
                    }}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <HintTitle hint={m.routing_breaker_description()}>
            <CardTitle>{m.routing_breaker_legend()}</CardTitle>
          </HintTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {loading ? (
              <>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </>
            ) : (
              <>
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
    </div>
  )
}

function LanePanel({
  cliId,
  lane,
  providers,
  onRefresh,
  onReorder,
  onResetBreaker,
}: {
  cliId: CliId
  lane: RoutingLaneState
  providers: NamedProvider[]
  onRefresh: () => Promise<void>
  onReorder: (ids: string[]) => void
  onResetBreaker: (id: string) => void
}) {
  const names = new Map(providers.map((provider) => [provider.id, provider.name]))
  const breakerById = new Map(lane.breakers.map((item) => [item.providerId, item.state]))
  const currentId = lane.queue[0] ?? null
  const copy = laneCopy(cliId)

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Alert>
          <HintTitle hint={copy.hint}>
            <AlertTitle>{lane.active ? m.routing_active() : m.routing_inactive()}</AlertTitle>
          </HintTitle>
          <AlertDescription>
            {lane.active ? copy.active : m.routing_inactive_description()}
          </AlertDescription>
        </Alert>
        <RoutingQueueField
          queue={lane.queue}
          names={names}
          breakers={breakerById}
          currentId={currentId}
          onReorder={onReorder}
          onResetBreaker={onResetBreaker}
        />
      </FieldGroup>
      <RoutingLogsCard logs={lane.logs} names={names} onRefresh={onRefresh} />
    </div>
  )
}

function providersFor(
  cliId: CliId,
  codex: ProviderListItem[],
  claude: ClaudeProviderListItem[],
  grok: GrokProviderListItem[],
): NamedProvider[] {
  if (cliId === "claude-code") return claude
  if (cliId === "grok-build") return grok
  return codex
}

function laneCopy(cliId: CliId): { hint: string; active: string } {
  if (cliId === "claude-code") {
    return { hint: m.routing_description_claude(), active: m.routing_active_description_claude() }
  }
  if (cliId === "grok-build") {
    return { hint: m.routing_description_grok(), active: m.routing_active_description_grok() }
  }
  return { hint: m.routing_description_codex(), active: m.routing_active_description_codex() }
}
