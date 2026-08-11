import React from "react";
import { cn } from "@/lib/utils";

interface ListItemRowProps {
  isLast?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const ListItemRow: React.FC<ListItemRowProps> = ({
  isLast,
  children,
  actions,
  className,
}) => {
  return (
    <div
      className={cn(
        "list-item-row group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/70",
        !isLast && "border-b border-border-default",
        className,
      )}
    >
      {actions ? (
        <>
          <div className="list-item-row-content flex min-w-0 flex-1 items-center gap-3">
            {children}
          </div>
          <div className="list-item-row-actions shrink-0">{actions}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
};
