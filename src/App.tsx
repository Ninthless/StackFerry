import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AnnouncementDialog } from "@/features/announcements/announcement-dialog"
import { AnnouncementProvider } from "@/features/announcements/announcement-provider"
import { AppUpdatePopup } from "@/features/settings/app-update-popup"
import { AppShell } from "@/features/shell/app-shell"
import { AntdApp } from "@/lib/antd-app"

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AntdApp>
        <TooltipProvider>
          <Toaster>
            <AnnouncementProvider>
              <AnnouncementDialog />
              <AppUpdatePopup />
              <AppShell />
            </AnnouncementProvider>
          </Toaster>
        </TooltipProvider>
      </AntdApp>
    </ThemeProvider>
  )
}
