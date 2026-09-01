import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import MarkdownEditor from "@/shared/editor/MarkdownEditor";
import type { Prompt, AppId } from "@/platform/tauri/api";

interface PromptFormPanelProps {
  appId: AppId;
  editingId?: string;
  initialData?: Prompt;
  onSave: (id: string, prompt: Prompt) => Promise<void>;
  onCancel: () => void;
}

const PromptFormPanel: React.FC<PromptFormPanelProps> = ({
  appId,
  editingId,
  initialData,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const filenameMap: Record<AppId, string> = {
    claude: "CLAUDE.md",
    "claude-desktop": "CLAUDE.md",
    codex: "AGENTS.md",
    pi: "AGENTS.md",
    gemini: "GEMINI.md",
    grokbuild: "AGENTS.md",
    opencode: "AGENTS.md",
    openclaw: "AGENTS.md",
    hermes: "SOUL.md",
  };
  const filename = filenameMap[appId];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || "");
      setContent(initialData.content);
    } else {
      setName("");
      setDescription("");
      setContent("");
    }
  }, [editingId, initialData]);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    try {
      const id = editingId || `prompt-${Date.now()}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const prompt: Prompt = {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        enabled: initialData?.enabled || false,
        createdAt: initialData?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      await onSave(id, prompt);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="prompt-name">{t("prompts.name")}</Label>
            <Input
              id="prompt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("prompts.namePlaceholder")}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="prompt-description">
              {t("prompts.description")}
            </Label>
            <Input
              id="prompt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("prompts.descriptionPlaceholder")}
              className="mt-1.5"
            />
          </div>
        </div>
        <div className="mt-5">
          <Label htmlFor="prompt-content" className="mb-1.5 block">
            {t("prompts.content")}
          </Label>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder={t("prompts.contentPlaceholder", { filename })}
            darkMode={isDarkMode}
            minHeight="420px"
          />
        </div>
      </div>
      <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
};

export default PromptFormPanel;
