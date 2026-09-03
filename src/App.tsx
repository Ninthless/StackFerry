import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/features/shell/app-shell"

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Toaster>
          <AppShell />
        </Toaster>
      </TooltipProvider>
    </ThemeProvider>
  )
}
