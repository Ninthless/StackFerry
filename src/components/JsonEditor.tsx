import React, { useEffect, useMemo, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { placeholder } from "@codemirror/view";
import { linter, type Diagnostic } from "@codemirror/lint";
import { useTranslation } from "react-i18next";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createCodeMirrorTheme } from "@/components/editor/codeMirrorTheme";
import { formatJSON } from "@/utils/formatters";

interface JsonEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  darkMode?: boolean;
  rows?: number;
  showValidation?: boolean;
  language?: "json" | "javascript";
  height?: string | number;
  showMinimap?: boolean;
}

const JsonEditor: React.FC<JsonEditorProps> = ({
  value,
  onChange,
  placeholder: placeholderText = "",
  darkMode = false,
  rows = 12,
  showValidation = true,
  language = "json",
  height,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const jsonLinter = useMemo(
    () =>
      linter((view) => {
        const diagnostics: Diagnostic[] = [];
        if (!showValidation || language !== "json") return diagnostics;

        const doc = view.state.doc.toString();
        if (!doc.trim()) return diagnostics;

        try {
          const parsed = JSON.parse(doc);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            diagnostics.push({
              from: 0,
              to: doc.length,
              severity: "error",
              message: t("jsonEditor.mustBeObject"),
            });
          }
        } catch (error) {
          diagnostics.push({
            from: 0,
            to: doc.length,
            severity: "error",
            message:
              error instanceof SyntaxError
                ? error.message
                : t("jsonEditor.invalidJson"),
          });
        }

        return diagnostics;
      }),
    [language, showValidation, t],
  );

  useEffect(() => {
    if (!editorRef.current) return;

    const heightValue = height
      ? typeof height === "number"
        ? `${height}px`
        : height
      : undefined;
    const minHeight = Math.max(1, rows) * 18;
    const sizingTheme = EditorView.theme({
      "&": heightValue
        ? { height: heightValue }
        : { minHeight: `${minHeight}px` },
      ".cm-scroller": { overflow: "auto" },
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        language === "javascript" ? javascript() : json(),
        placeholder(placeholderText),
        createCodeMirrorTheme(darkMode),
        sizingTheme,
        jsonLinter,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [darkMode, height, jsonLinter, language, placeholderText, rows]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  const handleFormat = () => {
    const currentValue = viewRef.current?.state.doc.toString() ?? "";
    if (!currentValue.trim()) return;

    try {
      const formatted = formatJSON(currentValue);
      onChangeRef.current(formatted);
      toast.success(t("common.formatSuccess", { defaultValue: "格式化成功" }), {
        closeButton: true,
      });
    } catch (error) {
      toast.error(
        t("common.formatError", {
          defaultValue: "格式化失败：{{error}}",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const isFullHeight = height === "100%";

  return (
    <div
      style={{ width: "100%", height: isFullHeight ? "100%" : "auto" }}
      className={isFullHeight ? "flex flex-col" : ""}
    >
      <div
        ref={editorRef}
        style={{ width: "100%", height: isFullHeight ? undefined : "auto" }}
        className={isFullHeight ? "min-h-0 flex-1" : ""}
      />
      {language === "json" && (
        <button
          type="button"
          onClick={handleFormat}
          className={`${isFullHeight ? "mt-2 flex-shrink-0" : "mt-2"} inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground`}
        >
          <Wand2 className="h-3.5 w-3.5" />
          {t("common.format", { defaultValue: "格式化" })}
        </button>
      )}
    </div>
  );
};

export default JsonEditor;
