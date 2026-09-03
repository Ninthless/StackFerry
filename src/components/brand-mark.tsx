import { cn } from "@/lib/utils"

type Props = {
  className?: string
}

export function BrandMark({ className }: Props) {
  return (
    <img
      alt="StackFerry"
      src="/icon.png"
      className={cn("size-8 shrink-0 rounded-lg object-cover", className)}
    />
  )
}
