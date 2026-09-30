import { releaseNotesForLocale } from "@shared/app-releases"
import type { AppLocale } from "@shared/locale"
import { getLocale } from "@/paraglide/runtime.js"
import { cn } from "@/lib/utils"

export function ReleaseNotes({ notes }: { notes: string }) {
  const locale: AppLocale = getLocale() === "zh" ? "zh" : "en"
  return (
    <pre
      className={cn(
        "bg-muted text-muted-foreground max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg p-3 text-sm whitespace-pre-wrap",
        "[scrollbar-width:thin]",
        "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/25",
      )}
    >
      {releaseNotesForLocale(notes, locale)}
    </pre>
  )
}
