import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const lightSyntaxPalette = {
  keyword: "#cf222e",
  name: "#24292f",
  property: "#0550ae",
  type: "#8250df",
  string: "#0a3069",
  constant: "#953800",
  operator: "#57606a",
  comment: "#6e7781",
  link: "#0969da",
  invalid: "#cf222e",
};

const darkSyntaxPalette: typeof lightSyntaxPalette = {
  keyword: "#ff7b72",
  name: "#c9d1d9",
  property: "#79c0ff",
  type: "#d2a8ff",
  string: "#a5d6ff",
  constant: "#ffa657",
  operator: "#b1bac4",
  comment: "#8b949e",
  link: "#58a6ff",
  invalid: "#ff7b72",
};

const createHighlightStyle = (palette: typeof lightSyntaxPalette) =>
  HighlightStyle.define([
    {
      tag: [tags.keyword, tags.modifier, tags.definitionKeyword],
      color: palette.keyword,
      fontWeight: "600",
    },
    {
      tag: [tags.name, tags.variableName],
      color: palette.name,
    },
    {
      tag: [tags.propertyName, tags.attributeName],
      color: palette.property,
    },
    {
      tag: [tags.typeName, tags.className, tags.function(tags.variableName)],
      color: palette.type,
      fontWeight: "500",
    },
    {
      tag: tags.string,
      color: palette.string,
    },
    {
      tag: [tags.number, tags.bool, tags.null, tags.atom],
      color: palette.constant,
    },
    {
      tag: [tags.operator, tags.punctuation, tags.bracket],
      color: palette.operator,
    },
    {
      tag: [tags.heading, tags.strong],
      color: palette.property,
      fontWeight: "700",
    },
    {
      tag: tags.emphasis,
      color: palette.type,
      fontStyle: "italic",
    },
    {
      tag: [tags.comment, tags.meta, tags.contentSeparator],
      color: palette.comment,
      fontStyle: "italic",
    },
    {
      tag: [tags.link, tags.url],
      color: palette.link,
      textDecoration: "underline",
    },
    {
      tag: tags.invalid,
      color: palette.invalid,
    },
  ]);

const lightHighlightStyle = createHighlightStyle(lightSyntaxPalette);
const darkHighlightStyle = createHighlightStyle(darkSyntaxPalette);

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
  syntaxHighlighting(dark ? darkHighlightStyle : lightHighlightStyle),
];
