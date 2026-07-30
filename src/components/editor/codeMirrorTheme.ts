import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const monochromeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.definitionKeyword],
    color: "hsl(var(--foreground))",
    fontWeight: "600",
  },
  {
    tag: [tags.name, tags.variableName, tags.propertyName, tags.attributeName],
    color: "hsl(var(--foreground) / 0.88)",
  },
  {
    tag: [tags.typeName, tags.className, tags.function(tags.variableName)],
    color: "hsl(var(--foreground))",
    fontWeight: "500",
  },
  {
    tag: [tags.string, tags.number, tags.bool, tags.null],
    color: "hsl(var(--foreground) / 0.72)",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket],
    color: "hsl(var(--muted-foreground))",
  },
  {
    tag: [tags.heading, tags.strong],
    color: "hsl(var(--foreground))",
    fontWeight: "700",
  },
  {
    tag: tags.emphasis,
    color: "hsl(var(--foreground) / 0.82)",
    fontStyle: "italic",
  },
  {
    tag: [tags.comment, tags.meta, tags.contentSeparator],
    color: "hsl(var(--muted-foreground))",
    fontStyle: "italic",
  },
  {
    tag: [tags.link, tags.url],
    color: "hsl(var(--foreground))",
    textDecoration: "underline",
  },
  {
    tag: tags.invalid,
    color: "hsl(var(--destructive))",
  },
]);

export const createCodeMirrorTheme = (dark: boolean) => [
  EditorView.theme(
    {
      "&": {
        color: "hsl(var(--foreground))",
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "calc(var(--radius) - 2px)",
        overflow: "hidden",
      },
      "&.cm-focused": {
        outline: "none",
        borderColor: "hsl(var(--ring))",
        boxShadow: "0 0 0 1px hsl(var(--ring) / 0.25)",
      },
      ".cm-scroller": {
        backgroundColor: "transparent",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: "13px",
        lineHeight: "1.6",
      },
      ".cm-content": {
        padding: "12px 0",
        caretColor: "hsl(var(--foreground))",
      },
      ".cm-line": {
        padding: "0 14px",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "hsl(var(--foreground))",
      },
      ".cm-gutters": {
        backgroundColor: "hsl(var(--muted) / 0.55)",
        color: "hsl(var(--muted-foreground))",
        borderRight: "1px solid hsl(var(--border))",
      },
      ".cm-gutterElement": {
        padding: "0 10px 0 12px",
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: "hsl(var(--accent) / 0.45)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: "hsl(var(--foreground) / 0.14)",
        },
      ".cm-selectionMatch": {
        backgroundColor: "hsl(var(--foreground) / 0.09)",
      },
      ".cm-matchingBracket": {
        backgroundColor: "hsl(var(--accent))",
        outline: "1px solid hsl(var(--border))",
      },
      ".cm-searchMatch": {
        backgroundColor: "hsl(var(--foreground) / 0.12)",
        outline: "1px solid hsl(var(--foreground) / 0.25)",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "hsl(var(--foreground) / 0.2)",
      },
      ".cm-placeholder": {
        color: "hsl(var(--muted-foreground))",
        fontStyle: "normal",
      },
      ".cm-panels, .cm-tooltip": {
        color: "hsl(var(--popover-foreground))",
        backgroundColor: "hsl(var(--popover))",
        borderColor: "hsl(var(--border))",
      },
      ".cm-button, .cm-textfield": {
        color: "hsl(var(--foreground))",
        backgroundImage: "none",
        backgroundColor: "hsl(var(--background))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "calc(var(--radius) - 3px)",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        color: "hsl(var(--accent-foreground))",
        backgroundColor: "hsl(var(--accent))",
      },
      ".cm-diagnostic-error": {
        borderLeftColor: "hsl(var(--destructive))",
      },
    },
    { dark },
  ),
  syntaxHighlighting(monochromeHighlightStyle),
];
