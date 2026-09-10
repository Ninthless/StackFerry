import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import * as m from "@/paraglide/messages.js"

export function HintIcon({ hint }: { hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs" />}>
        <CircleHelp />
        <span className="sr-only">{m.field_hint()}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-left whitespace-normal">{hint}</TooltipContent>
    </Tooltip>
  )
}

export function HintTitle({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <div className="flex items-center gap-1">
      {children}
      <HintIcon hint={hint} />
    </div>
  )
}

export function HintLabel({
  htmlFor,
  id,
  hint,
  required,
  children,
}: {
  htmlFor?: string
  id?: string
  hint: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-1">
      <FieldLabel htmlFor={htmlFor} id={id} required={required}>
        {children}
      </FieldLabel>
      <HintIcon hint={hint} />
    </div>
  )
}
