import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { FieldDescription } from "@/components/ui/field"
import { EffortEnergy } from "@/features/clis/effort-energy"
import { energyIntensity, effortTone, effortTrack } from "@/features/clis/effort-tone"
import { cn } from "@/lib/utils"

export type EffortOption = {
  label: string
  value: string | null
  hint: string
}

type Props = {
  id: string
  options: EffortOption[]
  value: string
  fasterLabel: string
  deeperLabel: string
  onChange: (value: string) => void
}

const INSET = 14
const SETTLE_MS = 620
const SETTLE_PEAK_MS = 1840

function optionIndex(options: EffortOption[], value: string): number {
  const found = options.findIndex((option) => (option.value ?? "") === value)
  return found < 0 ? 0 : found
}

function fromClientX(clientX: number, rail: HTMLElement, last: number): number {
  const rect = rail.getBoundingClientRect()
  const width = Math.max(rect.width - INSET * 2, 1)
  const raw = ((clientX - rect.left - INSET) / width) * last
  return Math.min(last, Math.max(0, raw))
}

function useDarkClass(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  useEffect(() => {
    const root = document.documentElement
    const sync = (): void => setDark(root.classList.contains("dark"))
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return dark
}

export function EffortScale({
  id,
  options,
  value,
  fasterLabel,
  deeperLabel,
  onChange,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<number | null>(null)
  const settleTimer = useRef(0)
  const [drag, setDrag] = useState<number | null>(null)
  const [settling, setSettling] = useState(false)
  const last = Math.max(options.length - 1, 1)
  const index = optionIndex(options, value)
  const visual = drag ?? index
  const progress = visual / last
  const charged = progress > 0
  const peak = progress >= 0.99
  const intensity = energyIntensity(progress)
  const dragging = drag !== null
  const active = dragging || settling
  const energized = charged && (active || progress >= 0.9995)
  const current = options[Math.round(visual)] ?? options[index] ?? options[0]
  const dense = options.length > 6
  const dark = useDarkClass()
  const color = effortTone(dark)
  const track = effortTrack(dark)

  useEffect(() => () => window.clearTimeout(settleTimer.current), [])

  function commitIndex(next: number): void {
    const option = options[next]
    if (!option) return
    const nextValue = option.value ?? ""
    if (nextValue === value) return
    onChange(nextValue)
  }

  function armSettle(next: number): void {
    window.clearTimeout(settleTimer.current)
    setSettling(true)
    settleTimer.current = window.setTimeout(() => setSettling(false), next >= last ? SETTLE_PEAK_MS : SETTLE_MS)
  }

  function handlePointer(event: PointerEvent<HTMLDivElement>): void {
    const rail = railRef.current
    if (!rail) return
    const next = fromClientX(event.clientX, rail, last)
    dragRef.current = next
    setDrag(next)
    commitIndex(Math.round(next))
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    handlePointer(event)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    handlePointer(event)
  }

  function releasePointer(event: PointerEvent<HTMLDivElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>): void {
    releasePointer(event)
    const snapped = Math.round(dragRef.current ?? index)
    dragRef.current = null
    setDrag(null)
    commitIndex(snapped)
    armSettle(snapped)
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>): void {
    releasePointer(event)
    dragRef.current = null
    setDrag(null)
  }

  function choose(next: number): void {
    commitIndex(next)
    armSettle(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    let next: number | undefined
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, index - 1)
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(last, index + 1)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = last
    else return
    event.preventDefault()
    choose(next)
  }

  const travel = `calc(${INSET}px + ${progress} * (100% - ${INSET * 2}px))`
  const snap = cn(
    "motion-reduce:transition-none group-data-[dragging]/effort:transition-none",
    "transition-[left,width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1.18,0.36,1)]",
  )

  return (
    <div
      className="flex flex-col gap-1"
      style={
        {
          "--effort-track": track,
          "--effort-canvas-opacity": charged ? (dark ? 1 : 0.92) : 0,
          "--effort-dots-opacity": 1 - intensity * 0.72,
        } as CSSProperties
      }
    >
      {dense ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-0.5 text-[10px] leading-4">
          <span className="text-muted-foreground">{fasterLabel}</span>
          <span className="font-semibold text-foreground">{current?.label}</span>
          <span className="text-right text-muted-foreground">{deeperLabel}</span>
        </div>
      ) : (
        <div className="relative h-4">
          {options.map((option, optionIndexValue) => {
            const edge =
              optionIndexValue === 0
                ? "translateX(0)"
                : optionIndexValue === last
                  ? "translateX(-100%)"
                  : "translateX(-50%)"
            const selected = optionIndexValue === Math.round(visual)
            return (
              <button
                key={option.value ?? "default"}
                type="button"
                tabIndex={-1}
                className={cn(
                  "absolute max-w-16 truncate text-[10px] leading-4 text-muted-foreground",
                  selected && "max-w-none font-semibold text-foreground",
                )}
                style={{
                  left: `calc(${INSET}px + ${optionIndexValue / last} * (100% - ${INSET * 2}px))`,
                  transform: edge,
                }}
                onClick={() => choose(optionIndexValue)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
      <div
        ref={railRef}
        id={id}
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={current?.label}
        data-dragging={dragging || undefined}
        data-peak={peak || undefined}
        className="group/effort relative isolate h-8 cursor-grab touch-none overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--border)_75%,#11121a)] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        style={{ background: "var(--effort-track)" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
      >
        <div className="pointer-events-none absolute inset-x-3.5 inset-y-0 z-[2] flex items-center justify-between">
          {options.map((option) => (
            <i
              key={option.value ?? "default"}
              aria-hidden
              className={cn("size-1 rounded-full bg-[#8c8592] dark:bg-[#51525a]", snap)}
              style={{ opacity: peak ? 0 : "var(--effort-dots-opacity)" }}
            />
          ))}
        </div>
        <EffortEnergy
          active={energized}
          baseColor={track}
          color={color}
          intensity={intensity}
          light={!dark}
          ratio={progress}
        />
        <div
          aria-hidden
          className={cn("effort-thumb", snap)}
          style={{
            left: travel,
            transform: dragging ? "translate(-50%, -50%) scale(0.95)" : "translate(-50%, -50%)",
          }}
        />
      </div>
      <FieldDescription>{current?.hint}</FieldDescription>
    </div>
  )
}
