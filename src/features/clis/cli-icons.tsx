import type { HTMLAttributes } from "react"
import claudeSvg from "@lobehub/icons-static-svg/icons/claude.svg?raw"
import codexSvg from "@lobehub/icons-static-svg/icons/codex.svg?raw"
import { cn } from "@/lib/utils"

type BrandIconProps = HTMLAttributes<HTMLSpanElement>

function BrandIcon({ markup, className, ...props }: BrandIconProps & { markup: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: markup }}
      {...props}
    />
  )
}

export function CodexIcon(props: BrandIconProps) {
  return <BrandIcon markup={codexSvg} {...props} />
}

export function ClaudeIcon(props: BrandIconProps) {
  return <BrandIcon markup={claudeSvg} {...props} />
}
