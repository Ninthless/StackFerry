import type { HTMLAttributes } from "react"
import claudeSvg from "@lobehub/icons-static-svg/icons/claude-color.svg?raw"
import grokSvg from "@lobehub/icons-static-svg/icons/grok.svg?raw"
import openaiSvg from "@lobehub/icons-static-svg/icons/openai.svg?raw"
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

export function CodexIcon({ className, ...props }: BrandIconProps) {
  return <BrandIcon markup={openaiSvg} className={cn("text-black dark:text-white", className)} {...props} />
}

export function ClaudeIcon(props: BrandIconProps) {
  return <BrandIcon markup={claudeSvg} {...props} />
}

export function GrokIcon({ className, ...props }: BrandIconProps) {
  return <BrandIcon markup={grokSvg} className={cn("text-black dark:text-white", className)} {...props} />
}
