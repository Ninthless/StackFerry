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

const getTokenColor = (container: HTMLElement, text: string) => {
  const token = Array.from(
    container.querySelectorAll<HTMLElement>(".cm-line span"),
  ).find((element) => element.textContent?.includes(text));
  if (!token) throw new Error(`CodeMirror token was not rendered: ${text}`);
  return getComputedStyle(token).color;
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

describe("editor syntax highlighting", () => {
  it("uses distinct semantic colors for JSON in light and dark themes", () => {
    const value = '{"enabled": true, "retries": 3, "mode": "safe"}';
    const { container, rerender } = render(
      <JsonEditor value={value} onChange={() => {}} />,
    );

    const lightColors = new Set([
      getTokenColor(container, '"enabled"'),
      getTokenColor(container, "true"),
      getTokenColor(container, '"safe"'),
    ]);
    expect(lightColors.size).toBe(3);

    rerender(<JsonEditor value={value} onChange={() => {}} darkMode />);

    const darkColors = new Set([
      getTokenColor(container, '"enabled"'),
      getTokenColor(container, "true"),
      getTokenColor(container, '"safe"'),
    ]);
    expect(darkColors.size).toBe(3);
    expect(darkColors).not.toEqual(lightColors);
  });

  it("highlights JavaScript keywords, strings, and comments", () => {
    const { container } = render(
      <JsonEditor
        value={'const endpoint = "https://example.com"; // request URL'}
        onChange={() => {}}
        language="javascript"
      />,
    );

    expect(
      new Set([
        getTokenColor(container, "const"),
        getTokenColor(container, '"https://example.com"'),
        getTokenColor(container, "// request URL"),
      ]).size,
    ).toBe(3);
  });

  it("highlights TOML keys, strings, tables, and comments", () => {
    const { container } = render(
      <JsonEditor
        value={
          'model_provider = "custom"\n[model_providers.custom]\nrequire_openai_auth = true\n# Provider settings'
        }
        onChange={() => {}}
        language="toml"
      />,
    );

    expect(
      new Set([
        getTokenColor(container, "model_provider"),
        getTokenColor(container, '"custom"'),
        getTokenColor(container, "[model_providers.custom]"),
        getTokenColor(container, "# Provider settings"),
      ]).size,
    ).toBe(4);
  });

  it("highlights environment variable keys, values, and comments", () => {
    const { container } = render(
      <JsonEditor
        value={"GEMINI_API_KEY=sk-test\n# Active model"}
        onChange={() => {}}
        language="properties"
      />,
    );

    expect(
      new Set([
        getTokenColor(container, "GEMINI_API_KEY"),
        getTokenColor(container, "sk-test"),
        getTokenColor(container, "# Active model"),
      ]).size,
    ).toBe(3);
  });

  it("highlights Markdown headings, emphasis, and links", () => {
    const { container } = render(
      <MarkdownEditor value="# Title\n\n*Body* with [link](https://example.com)" />,
    );

    expect(
      new Set([
        getTokenColor(container, "Title"),
        getTokenColor(container, "Body"),
        getTokenColor(container, "link"),
      ]).size,
    ).toBe(3);
  });
});
