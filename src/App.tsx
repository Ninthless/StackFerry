import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AnnouncementPopup } from "@/features/settings/announcement-popup"
import { AppShell } from "@/features/shell/app-shell"
import { AntdApp } from "@/lib/antd-app"

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AntdApp>
        <TooltipProvider>
          <Toaster>
            <AnnouncementPopup />
            <AppShell />
          </Toaster>
        </TooltipProvider>
      </AntdApp>
    </ThemeProvider>
  )
}
