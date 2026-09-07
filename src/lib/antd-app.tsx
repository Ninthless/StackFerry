import { StyleProvider } from "@ant-design/cssinjs"
import { ConfigProvider, theme } from "antd"
import enUS from "antd/locale/en_US"
import zhCN from "antd/locale/zh_CN"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useTheme } from "@/components/theme-provider"
import { getLocale } from "../paraglide/runtime.js"

type ThemeColors = {
  primary: string
  primaryForeground: string
  background: string
  foreground: string
  muted: string
  mutedForeground: string
  accent: string
  popover: string
  border: string
  destructive: string
  ring: string
}

const FALLBACK: ThemeColors = {
  primary: "rgb(33, 33, 33)",
  primaryForeground: "rgb(250, 250, 250)",
  background: "rgb(255, 255, 255)",
  foreground: "rgb(23, 23, 23)",
  muted: "rgb(247, 247, 247)",
  mutedForeground: "rgb(115, 115, 115)",
  accent: "rgb(235, 235, 235)",
  popover: "rgb(255, 255, 255)",
  border: "rgb(229, 229, 229)",
  destructive: "rgb(220, 38, 38)",
  ring: "rgb(163, 163, 163)",
}

function resolveCssColor(name: string, fallback: string): string {
  const probe = document.createElement("span")
  probe.style.color = `var(${name})`
  document.documentElement.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  if (!value || value === "rgba(0, 0, 0, 0)") return fallback
  return value
}

function readThemeColors(): ThemeColors {
  if (typeof document === "undefined") return FALLBACK
  return {
    primary: resolveCssColor("--primary", FALLBACK.primary),
    primaryForeground: resolveCssColor("--primary-foreground", FALLBACK.primaryForeground),
    background: resolveCssColor("--background", FALLBACK.background),
    foreground: resolveCssColor("--foreground", FALLBACK.foreground),
    muted: resolveCssColor("--muted", FALLBACK.muted),
    mutedForeground: resolveCssColor("--muted-foreground", FALLBACK.mutedForeground),
    accent: resolveCssColor("--accent", FALLBACK.accent),
    popover: resolveCssColor("--popover", FALLBACK.popover),
    border: resolveCssColor("--border", FALLBACK.border),
    destructive: resolveCssColor("--destructive", FALLBACK.destructive),
    ring: resolveCssColor("--ring", FALLBACK.ring),
  }
}

export function AntdApp({ children }: { children: ReactNode }) {
  const { theme: preference } = useTheme()
  const [colors, setColors] = useState(readThemeColors)
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )
  const locale = getLocale() === "zh" ? zhCN : enUS

  useEffect(() => {
    const sync = () => {
      setColors(readThemeColors())
      setIsDark(document.documentElement.classList.contains("dark"))
    }
    sync()
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => {
      media.removeEventListener("change", sync)
      observer.disconnect()
    }
  }, [preference])

  const antdTheme = useMemo(
    () => ({
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: colors.primary,
        colorTextLightSolid: colors.primaryForeground,
        colorBgContainer: colors.background,
        colorBgElevated: colors.popover,
        colorBgLayout: colors.background,
        colorText: colors.foreground,
        colorTextSecondary: colors.mutedForeground,
        colorTextTertiary: colors.mutedForeground,
        colorBorder: colors.border,
        colorBorderSecondary: colors.border,
        colorFillSecondary: colors.muted,
        colorFillTertiary: colors.accent,
        colorFillQuaternary: colors.muted,
        colorError: colors.destructive,
        colorInfo: colors.primary,
        colorLink: colors.foreground,
        colorLinkHover: colors.foreground,
        colorPrimaryBg: colors.muted,
        colorPrimaryBgHover: colors.accent,
        controlOutline: colors.ring,
        borderRadius: 10,
        fontFamily: "inherit",
      },
      components: {
        Table: {
          headerBg: "transparent",
          headerColor: colors.mutedForeground,
          rowHoverBg: "transparent",
          rowSelectedBg: "transparent",
          rowSelectedHoverBg: "transparent",
          borderColor: colors.border,
          headerSplitColor: "transparent",
        },
        Button: {
          primaryShadow: "none",
          defaultShadow: "none",
          dangerShadow: "none",
        },
        Tag: {
          defaultBg: colors.muted,
          defaultColor: colors.foreground,
        },
      },
    }),
    [colors, isDark],
  )

  return (
    <StyleProvider layer>
      <ConfigProvider locale={locale} theme={antdTheme}>
        {children}
      </ConfigProvider>
    </StyleProvider>
  )
}
