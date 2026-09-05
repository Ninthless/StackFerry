import { cn } from "@/lib/utils"

type Props = {
  className?: string
}

export function BrandMark({ className }: Props) {
  return (
    <img
      alt="StackFerry"
      src="/ship-mark.svg"
      className={cn("size-8 shrink-0 rounded-lg bg-black object-contain p-2", className)}
    />
  )
}
