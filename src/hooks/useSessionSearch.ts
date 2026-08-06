import { useCallback, useMemo, useRef } from "react";
import FlexSearch, { type Index } from "flexsearch";
import type { SessionMeta } from "@/types";

interface UseSessionSearchOptions {
  sessions: SessionMeta[];
}

interface UseSessionSearchResult {
  search: (query: string) => SessionMeta[];
}

/**
 * 使用 FlexSearch 实现会话全文搜索
 * 索引会话元数据（标题、摘要、项目目录等）
 */
export function useSessionSearch({
  sessions,
}: UseSessionSearchOptions): UseSessionSearchResult {
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const aTs = a.lastActiveAt ?? a.createdAt ?? 0;
        const bTs = b.lastActiveAt ?? b.createdAt ?? 0;
        return bTs - aTs;
      }),
    [sessions],
  );

  const indexRef = useRef<{
    sessions: SessionMeta[];
    index: Index;
  } | null>(null);

  const search = useCallback(
    (query: string): SessionMeta[] => {
      const needle = query.trim();

      if (!needle) {
        return sortedSessions;
      }

      let cached = indexRef.current;
      if (!cached || cached.sessions !== sortedSessions) {
        const nextIndex = new FlexSearch.Index({
          tokenize: "full",
          resolution: 9,
        });

        sortedSessions.forEach((session, idx) => {
          const metaContent = [
            session.sessionId,
            session.title,
            session.summary,
            session.projectDir,
            session.sourcePath,
          ]
            .filter(Boolean)
            .join(" ");

          nextIndex.add(idx, metaContent);
        });
        cached = { sessions: sortedSessions, index: nextIndex };
        indexRef.current = cached;
      }

      const results = cached.index.search(needle, {
        limit: sortedSessions.length,
      }) as number[];

      return results.map((idx) => sortedSessions[idx]);
    },
    [sortedSessions],
  );

  return { search };
}
