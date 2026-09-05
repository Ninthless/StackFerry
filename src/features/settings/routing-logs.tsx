import { ScrollText } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import type { RoutingLogEntry } from "@shared/routing"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area"
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

type Props = {
  logs: RoutingLogEntry[]
  names: Map<string, string>
}

export function RoutingLogsCard({ logs, names }: Props) {
  const chartConfig = {
    ok: { label: m.routing_log_ok(), color: "var(--chart-2)" },
    fail: { label: m.routing_chart_fail(), color: "var(--chart-1)" },
  } satisfies ChartConfig
  const chartData = countByProvider(logs, names)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.routing_logs()}</CardTitle>
        <CardDescription>{m.routing_chart_description()}</CardDescription>
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
                          {entry.errorCode || m.routing_log_ok()}
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
