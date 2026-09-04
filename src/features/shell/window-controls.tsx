import { useEffect, useState } from "react"
import { Copy, Minus, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function WindowControls() {
  const api = window.stackferry
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.showWindowControls) return
    let cancelled = false
    void api.isWindowMaximized().then((value) => {
      if (!cancelled) setMaximized(value)
    })
    const unsubscribe = api.onWindowMaximizedChange(setMaximized)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [api])

  if (!api?.showWindowControls) return null

  return (
    <div
      className="app-region-no-drag flex h-full shrink-0"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 rounded-none"
        aria-label="最小化"
        onClick={() => {
          void api.windowMinimize()
        }}
      >
        <Minus />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 rounded-none"
        aria-label={maximized ? "还原" : "最大化"}
        onClick={() => {
          void api.windowToggleMaximize()
        }}
      >
        {maximized ? <Copy /> : <Square />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 rounded-none hover:bg-destructive hover:text-white dark:hover:bg-destructive"
        aria-label="关闭"
        onClick={() => {
          void api.windowClose()
        }}
      >
        <X />
      </Button>
    </div>
  )
}
