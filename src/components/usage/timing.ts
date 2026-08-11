export function formatTiming(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

export function formatTimingPair(
  latencyMs: number | null | undefined,
  firstTokenMs: number | null | undefined,
) {
  return `${formatTiming(latencyMs)}/${formatTiming(firstTokenMs)}`;
}
