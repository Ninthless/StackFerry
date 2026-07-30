import type { CSSProperties, ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  context?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, context, actions }: PageHeaderProps) {
  return (
    <header
      className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-background px-6"
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-semibold leading-6 text-foreground">
          {title}
        </h1>
        {context && (
          <p className="truncate text-xs leading-5 text-muted-foreground">
            {context}
          </p>
        )}
      </div>
      {actions && (
        <div
          className="flex min-w-0 shrink items-center justify-end gap-2 overflow-x-auto py-2"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
