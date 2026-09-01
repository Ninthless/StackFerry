import type { ReactNode } from "react";

interface WorkbenchEmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function WorkbenchEmptyState({
  icon,
  title,
  description,
  actions,
}: WorkbenchEmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border bg-card/45 p-10 text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {actions && <div className="mt-6 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
