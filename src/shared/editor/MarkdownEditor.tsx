import React, { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { placeholder as placeholderExtension } from "@codemirror/view";
import { createCodeMirrorTheme } from "@/shared/editor/codeMirrorTheme";

interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  darkMode?: boolean;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder: placeholderText = "",
  darkMode = false,
  readOnly = false,
  className = "",
  minHeight = "300px",
  maxHeight,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const sizingTheme = EditorView.theme({
      "&": {
        height: "100%",
        minHeight,
        maxHeight: maxHeight ?? "none",
      },
      ".cm-scroller": {
        flex: "1 1 auto",
        minHeight: "0",
        overflow: "auto",
      },
    });
    const readOnlyTheme = EditorView.theme({
      ".cm-cursor, .cm-dropCursor": { border: "none" },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
    });
    const extensions = [
      basicSetup,
      markdown(),
      createCodeMirrorTheme(darkMode),
      sizingTheme,
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      ...(readOnly ? [readOnlyTheme] : [placeholderExtension(placeholderText)]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
    ];
    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [darkMode, maxHeight, minHeight, placeholderText, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return <div ref={editorRef} className={className} />;
};

export default MarkdownEditor;
