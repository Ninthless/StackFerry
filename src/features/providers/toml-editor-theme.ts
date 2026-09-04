import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags } from "@lezer/highlight"
import { EditorView } from "@codemirror/view"

const darkChrome = EditorView.theme(
  {
    "&": {
      color: "var(--foreground)",
      backgroundColor: "transparent",
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "color-mix(in oklch, var(--foreground) 18%, transparent)",
      },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklch, var(--foreground) 6%, transparent)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--muted-foreground)",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in oklch, var(--foreground) 6%, transparent)",
    },
  },
  { dark: true },
)

const darkHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--muted-foreground)" },
  { tag: tags.meta, color: "var(--muted-foreground)" },
  { tag: tags.propertyName, color: "var(--editor-property)" },
  { tag: [tags.string, tags.deleted], color: "var(--editor-string)" },
  {
    tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName],
    color: "var(--editor-atom)",
  },
  { tag: [tags.number, tags.literal, tags.inserted], color: "var(--editor-number)" },
  { tag: tags.keyword, color: "var(--editor-keyword)" },
  { tag: [tags.bracket, tags.squareBracket], color: "var(--muted-foreground)" },
  { tag: tags.invalid, color: "var(--destructive)" },
])

export const tomlEditorDarkTheme = [darkChrome, syntaxHighlighting(darkHighlight)]
