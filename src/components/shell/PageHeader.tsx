import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PageHeaderOverflowAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  indicator?: boolean;
}

interface PageHeaderProps {
  title: string;
  context?: string;
  appSwitcher?: ReactNode;
  showTitle?: boolean;
  actions?: ReactNode;
  overflowActions?: PageHeaderOverflowAction[];
  overflowLabel?: string;
}

export function PageHeader({
  title,
  context,
  appSwitcher,
  showTitle = true,
  actions,
  overflowActions = [],
  overflowLabel = "More actions",
}: PageHeaderProps) {
  const hasActions = Boolean(actions) || overflowActions.length > 0;

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-background px-6">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {appSwitcher}
          <h1
            className={cn(
              "min-w-0 truncate text-[17px] font-semibold leading-6 text-foreground",
              !showTitle && "sr-only",
            )}
          >
            {title}
          </h1>
        </div>
        {context && (
          <p className="truncate text-xs leading-5 text-muted-foreground">
            {context}
          </p>
        )}
      </div>
      {hasActions && (
        <div className="flex shrink-0 items-center justify-end gap-2 py-2">
          {actions}
          {overflowActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={overflowLabel}
                  title={overflowLabel}
                  className="h-8 w-8"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {overflowActions.map((action) => (
                  <DropdownMenuItem
                    key={action.key}
                    onSelect={action.onSelect}
                    disabled={action.disabled}
                    className={
                      action.destructive
                        ? "text-destructive focus:text-destructive"
                        : undefined
                    }
                  >
                    {action.icon}
                    <span className="min-w-0 flex-1 truncate">
                      {action.label}
                    </span>
                    {action.indicator && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
}
