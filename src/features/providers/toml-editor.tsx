import { useMemo } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { StreamLanguage } from "@codemirror/language"
import { toml } from "@codemirror/legacy-modes/mode/toml"
import { EditorView } from "@codemirror/view"
import { useTheme } from "@/components/theme-provider"
import { tomlEditorDarkTheme } from "./toml-editor-theme"

const tomlLanguage = StreamLanguage.define(toml)
const editorExtensions = [tomlLanguage, EditorView.lineWrapping]

type Props = {
  id: string
  value: string
  invalid?: boolean
  describedBy?: string
  onChange: (value: string) => void
}

export function TomlEditor({ id, value, invalid, describedBy, onChange }: Props) {
  const { theme } = useTheme()
  const editorTheme = useMemo(
    () => (resolveEditorTheme(theme) === "dark" ? tomlEditorDarkTheme : "light"),
    [theme],
  )

  return (
    <div
      className="overflow-hidden rounded-lg border border-input has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-destructive/20 dark:bg-input/30"
      aria-invalid={invalid || undefined}
    >
      <CodeMirror
        id={id}
        value={value}
        height="16rem"
        theme={editorTheme}
        basicSetup={{ autocompletion: false }}
        extensions={editorExtensions}
        aria-describedby={describedBy}
        onChange={onChange}
        onKeyDown={(event) => event.stopPropagation()}
      />
    </div>
  )
}

function resolveEditorTheme(theme: "dark" | "light" | "system"): "dark" | "light" {
  if (theme === "dark" || theme === "light") return theme
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
