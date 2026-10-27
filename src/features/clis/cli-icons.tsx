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

const piSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="1em" height="1em"><path fill="#F09082" d="M165.29 165.29H517.36V400H400V282.65H165.29Z"/><path fill="#4D9ABF" d="M165.29 282.65H282.65V400H400V517.36H282.65V634.72H165.29Z"/><path fill="#F1BE58" d="M517.36 400H634.72V634.72H517.36Z"/></svg>`

export function PiIcon(props: BrandIconProps) {
  return <BrandIcon markup={piSvg} {...props} />
}
