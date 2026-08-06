import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SessionMessage } from "@/types";
import {
  formatTimestamp,
  getRoleLabel,
  getRoleTone,
  highlightText,
} from "./utils";

const COLLAPSE_THRESHOLD = 3000;
const COLLAPSED_LENGTH = 1500;

interface SessionMessageItemProps {
  message: SessionMessage;
  isActive: boolean;
  searchQuery?: string;
  onCopy: (content: string) => void | Promise<void>;
  onLoadFullContent?: (message: SessionMessage) => Promise<string>;
}

export const SessionMessageItem = memo(function SessionMessageItem({
  message,
  isActive,
  searchQuery,
  onCopy,
  onLoadFullContent,
}: SessionMessageItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(false);
    setFullContent(null);
    setIsLoadingContent(false);
    setContentError(null);
  }, [message.content, message.contentCursor, message.role, message.ts]);

  const content = fullContent ?? message.content;
  const isLong =
    Boolean(message.contentCursor) || content.length > COLLAPSE_THRESHOLD;
  const hasSearchMatch =
    isLong &&
    !expanded &&
    !!searchQuery &&
    content.toLowerCase().includes(searchQuery.toLowerCase());
  const collapsed = isLong && !expanded && !hasSearchMatch;
  const displayContent = collapsed
    ? content.slice(0, COLLAPSED_LENGTH) + "…"
    : content;
  const loadContent = async () => {
    if (fullContent !== null) return fullContent;
    if (!message.contentCursor || !onLoadFullContent) return message.content;

    setIsLoadingContent(true);
    setContentError(null);
    try {
      const loaded = await onLoadFullContent(message);
      setFullContent(loaded);
      return loaded;
    } catch (error) {
      setContentError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleToggleExpanded = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    try {
      await loadContent();
      setExpanded(true);
    } catch {
      return;
    }
  };

  const handleCopy = async () => {
    try {
      await onCopy(await loadContent());
    } catch {
      return;
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 relative group transition-shadow min-w-0",
        message.role.toLowerCase() === "user"
          ? "bg-primary/5 border-primary/20 ml-8"
          : message.role.toLowerCase() === "assistant"
            ? "mr-8 border-foreground/15 bg-foreground/[0.035]"
            : "bg-muted/40 border-border/60",
        isActive && "ring-2 ring-primary ring-offset-2",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => void handleCopy()}
            disabled={isLoadingContent}
            aria-label={t("sessionManager.copyMessage", {
              defaultValue: "复制消息",
            })}
          >
            {isLoadingContent ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t("sessionManager.copyMessage", {
            defaultValue: "复制内容",
          })}
        </TooltipContent>
      </Tooltip>
      <div className="flex items-center justify-between text-xs mb-1.5 pr-6">
        <span className={cn("font-semibold", getRoleTone(message.role))}>
          {getRoleLabel(message.role, t)}
        </span>
        {message.ts && (
          <span className="text-muted-foreground">
            {formatTimestamp(message.ts)}
          </span>
        )}
      </div>
      <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed min-w-0">
        {searchQuery
          ? highlightText(displayContent, searchQuery)
          : displayContent}
      </div>
      {contentError && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {t("sessionManager.contentLoadFailed", {
            defaultValue: "完整内容加载失败，请重试",
          })}
        </p>
      )}
      {isLong && !hasSearchMatch && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => void handleToggleExpanded()}
          disabled={isLoadingContent}
          className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isLoadingContent ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              {t("sessionManager.loadingContent", {
                defaultValue: "加载完整内容...",
              })}
            </>
          ) : expanded ? (
            <>
              <ChevronUp className="size-3" />
              {t("sessionManager.collapseContent", {
                defaultValue: "收起",
              })}
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {t("sessionManager.expandContent", {
                defaultValue: "展开完整内容",
              })}
              <span className="text-muted-foreground/60">
                ({Math.round((message.contentBytes ?? content.length) / 1000)}k)
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
});
