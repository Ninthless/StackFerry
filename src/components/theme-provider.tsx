import { createContext, useContext, useEffect, useState } from "react"
import { isThemePreference, type ThemePreference } from "@shared/theme"

export type Theme = ThemePreference

export function isTheme(value: string): value is Theme {
  return isThemePreference(value)
}

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function resolvedThemeClass(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return theme
}

function applyThemeClass(theme: Theme): void {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolvedThemeClass(theme))
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => {
      const stored = localStorage.getItem(storageKey)
      return isThemePreference(stored) ? stored : defaultTheme
    }
  )

  useEffect(() => {
    applyThemeClass(theme)
    if (theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => applyThemeClass("system")
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [theme])

  useEffect(() => {
    void window.stackferry?.setThemePreference(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next)
      setThemeState(next)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
