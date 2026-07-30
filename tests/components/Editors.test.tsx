import { act, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import JsonEditor from "@/components/JsonEditor";
import MarkdownEditor from "@/components/MarkdownEditor";

const getEditorView = (container: HTMLElement) => {
  const editor = container.querySelector<HTMLElement>(".cm-editor");
  if (!editor) throw new Error("CodeMirror editor was not rendered");

  const view = EditorView.findFromDOM(editor);
  if (!view) throw new Error("CodeMirror view was not found");
  return view;
};

describe("editor callbacks", () => {
  it("uses the latest JSON change handler without rebuilding the editor", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(
      <JsonEditor value="{}" onChange={first} />,
    );
    const view = getEditorView(container);

    rerender(<JsonEditor value="{}" onChange={second} />);
    act(() => {
      view.dispatch({ changes: { from: 1, insert: '"enabled":true' } });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('{"enabled":true}');
    expect(getEditorView(container)).toBe(view);
  });

  it("uses the latest Markdown change handler without rebuilding the editor", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(
      <MarkdownEditor value="# Title" onChange={first} />,
    );
    const view = getEditorView(container);

    rerender(<MarkdownEditor value="# Title" onChange={second} />);
    act(() => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "\nBody" },
      });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("# Title\nBody");
    expect(getEditorView(container)).toBe(view);
  });
});
