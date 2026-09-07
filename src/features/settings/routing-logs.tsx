import { useEffect, useId, useState } from "react"
import { ScrollText } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import type { RoutingLogEntry } from "@shared/routing"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import * as m from "@/paraglide/messages.js"

const LOG_REFRESH_KEY = "stackferry.log-refresh-seconds"
const LOG_REFRESH_VALUES = [0, 2, 5, 10, 30] as const
const DEFAULT_LOG_REFRESH = 5

type Props = {
  logs: RoutingLogEntry[]
  names: Map<string, string>
  onRefresh: () => Promise<void>
}

export function RoutingLogsCard({ logs, names, onRefresh }: Props) {
  const refreshId = useId()
  const [refreshSeconds, setRefreshSeconds] = useState(readLogRefreshSeconds)
  const chartConfig = {
    ok: { label: m.routing_log_ok(), color: "var(--chart-2)" },
    fail: { label: m.routing_chart_fail(), color: "var(--chart-1)" },
  } satisfies ChartConfig
  const chartData = countByProvider(logs, names)
  const refreshItems = LOG_REFRESH_VALUES.map((seconds) => ({
    value: String(seconds),
    label:
      seconds === 0
        ? m.routing_logs_refresh_off()
        : m.routing_logs_refresh_n({ seconds }),
  }))

  useEffect(() => {
    if (refreshSeconds <= 0) return
    const timer = window.setInterval(() => {
      void onRefresh()
    }, refreshSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [onRefresh, refreshSeconds])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.routing_logs()}</CardTitle>
        <CardAction>
          <Field orientation="horizontal" className="w-fit">
            <FieldLabel htmlFor={refreshId}>{m.routing_logs_refresh()}</FieldLabel>
            <Select
              items={refreshItems}
              value={String(refreshSeconds)}
              onValueChange={(value) => {
                if (typeof value !== "string") return
                const next = readLogRefreshSeconds(value)
                setRefreshSeconds(next)
                localStorage.setItem(LOG_REFRESH_KEY, String(next))
              }}
            >
              <SelectTrigger id={refreshId} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="bottom">
                <SelectGroup>
                  {refreshItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {logs.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText />
              </EmptyMedia>
              <EmptyTitle>{m.routing_logs_empty_title()}</EmptyTitle>
              <EmptyDescription>{m.routing_logs_empty()}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="min-h-[180px] w-full">
              <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="provider"
                  tickLine={false}
                  tickMargin={8}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="ok" fill="var(--color-ok)" radius={4} />
                <Bar dataKey="fail" fill="var(--color-fail)" radius={4} />
              </BarChart>
            </ChartContainer>
            <ScrollArea className="max-h-72">
              <Table>
                <TableCaption>{m.routing_logs_caption()}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.routing_log_time()}</TableHead>
                    <TableHead>{m.routing_log_provider()}</TableHead>
                    <TableHead>{m.routing_log_model()}</TableHead>
                    <TableHead>{m.routing_log_result()}</TableHead>
                    <TableHead>{m.routing_log_status()}</TableHead>
                    <TableHead className="text-right">{m.routing_log_latency()}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((entry, index) => (
                    <TableRow key={`${entry.at}-${entry.providerId}-${index}`}>
                      <TableCell>{formatLogTime(entry.at)}</TableCell>
                      <TableCell>{names.get(entry.providerId) ?? entry.providerId}</TableCell>
                      <TableCell>{entry.model || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={entry.errorCode ? "destructive" : "secondary"}>
                          {entry.errorCode ? m.routing_log_fail() : m.routing_log_ok()}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.status || "—"}</TableCell>
                      <TableCell className="text-right">{entry.latencyMs}ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function readLogRefreshSeconds(raw?: string | null): number {
  const stored = raw ?? (typeof localStorage === "undefined" ? null : localStorage.getItem(LOG_REFRESH_KEY))
  const value = Number(stored)
  if ((LOG_REFRESH_VALUES as readonly number[]).includes(value)) return value
  return DEFAULT_LOG_REFRESH
}

function countByProvider(logs: RoutingLogEntry[], names: Map<string, string>) {
  const counts = new Map<string, { provider: string; ok: number; fail: number }>()
  for (const entry of logs) {
    const current = counts.get(entry.providerId) ?? {
      provider: names.get(entry.providerId) ?? entry.providerId,
      ok: 0,
      fail: 0,
    }
    if (entry.errorCode) current.fail += 1
    else current.ok += 1
    counts.set(entry.providerId, current)
  }
  return [...counts.values()]
}

function formatLogTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}
