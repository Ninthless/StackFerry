export type BurstClickState = {
  count: number
  lastAt: number
}

export function registerBurstClick(
  state: BurstClickState,
  now: number,
  options: { target: number; windowMs: number },
): BurstClickState & { fired: boolean } {
  const count = now - state.lastAt <= options.windowMs ? state.count + 1 : 1
  if (count >= options.target) {
    return { count: 0, lastAt: now, fired: true }
  }
  return { count, lastAt: now, fired: false }
}
