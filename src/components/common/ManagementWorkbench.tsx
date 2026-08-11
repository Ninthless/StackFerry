import type { HTMLAttributes, ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Info,
  LockKeyhole,
  MinusCircle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ManagementWorkbenchMode = "list" | "split" | "detail";

interface ManagementWorkbenchProps extends HTMLAttributes<HTMLDivElement> {
  summary?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  detail?: ReactNode;
  mode?: ManagementWorkbenchMode;
  contentClassName?: string;
}

export function ManagementWorkbench({
  summary,
  toolbar,
  children,
  detail,
  mode = "list",
  className,
  contentClassName,
  ...props
}: ManagementWorkbenchProps) {
  return (
    <div
      className={cn(
        "management-workbench workbench-container flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
      data-mode={mode}
      {...props}
    >
      {summary}
      {toolbar}
      <div
        className={cn(
          "management-workbench-content min-h-0 flex-1",
          contentClassName,
        )}
      >
        <div className="management-workbench-primary min-h-0">{children}</div>
        {detail && (
          <div className="management-workbench-detail min-h-0">{detail}</div>
        )}
      </div>
    </div>
  );
}

interface ManagementSummaryProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  trailing?: ReactNode;
}

export function ManagementSummary({
  children,
  trailing,
  className,
  ...props
}: ManagementSummaryProps) {
  return (
    <div
      className={cn(
        "management-summary flex min-h-10 shrink-0 items-center gap-4 border-b border-border/70 py-2 text-xs",
        className,
      )}
      {...props}
    >
      <div className="management-summary-items flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1.5">
        {children}
      </div>
      {trailing && (
        <div className="management-summary-trailing ml-auto flex shrink-0 items-center gap-2">
          {trailing}
        </div>
      )}
    </div>
  );
}

interface ManagementSummaryItemProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  value: ReactNode;
  status?: StatusTone;
}

export function ManagementSummaryItem({
  label,
  value,
  status,
  className,
  ...props
}: ManagementSummaryItemProps) {
  return (
    <div
      className={cn(
        "management-summary-item flex min-w-0 items-baseline gap-1.5",
        className,
      )}
      {...props}
    >
      <span className="truncate text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "shrink-0 font-semibold text-foreground",
          status && statusTextClasses[status],
        )}
      >
        {value}
      </strong>
    </div>
  );
}

interface ResourceToolbarProps extends HTMLAttributes<HTMLDivElement> {
  search?: ReactNode;
  primaryFilters?: ReactNode;
  secondaryFilters?: ReactNode;
  actions?: ReactNode;
}

export function ResourceToolbar({
  search,
  primaryFilters,
  secondaryFilters,
  actions,
  className,
  ...props
}: ResourceToolbarProps) {
  return (
    <div
      className={cn(
        "resource-toolbar flex min-h-10 shrink-0 items-center gap-2 border-b border-border/70 py-2",
        className,
      )}
      role="toolbar"
      {...props}
    >
      {search && (
        <div className="resource-toolbar-search min-w-0 flex-1">{search}</div>
      )}
      {primaryFilters && (
        <div className="resource-toolbar-primary-filters flex shrink-0 items-center gap-2">
          {primaryFilters}
        </div>
      )}
      {secondaryFilters && (
        <div className="resource-toolbar-secondary-filters flex shrink-0 items-center gap-2">
          {secondaryFilters}
        </div>
      )}
      {actions && (
        <div className="resource-toolbar-actions ml-auto flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export type StatusTone =
  | "success"
  | "muted"
  | "warning"
  | "error"
  | "info"
  | "protected"
  | "pending";

const statusIcons = {
  success: CheckCircle2,
  muted: MinusCircle,
  warning: AlertCircle,
  error: AlertCircle,
  info: Info,
  protected: ShieldCheck,
  pending: Clock3,
} satisfies Record<StatusTone, typeof CheckCircle2>;

const statusTextClasses: Record<StatusTone, string> = {
  success: "text-emerald-700 dark:text-emerald-300",
  muted: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-300",
  error: "text-destructive",
  info: "text-sky-700 dark:text-sky-300",
  protected: "text-indigo-700 dark:text-indigo-300",
  pending: "text-violet-700 dark:text-violet-300",
};

const statusSurfaceClasses: Record<StatusTone, string> = {
  success:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  muted: "border-border bg-muted/70 text-muted-foreground",
  warning:
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-destructive/25 bg-destructive/10 text-destructive",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  protected:
    "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  pending:
    "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusTone;
  icon?: ReactNode;
  children: ReactNode;
}

export function StatusBadge({
  status,
  icon,
  children,
  className,
  ...props
}: StatusBadgeProps) {
  const Icon = statusIcons[status];

  return (
    <span
      className={cn(
        "status-badge inline-flex h-6 max-w-full items-center gap-1 rounded border px-2 text-xs font-medium",
        statusSurfaceClasses[status],
        className,
      )}
      data-status={status}
      {...props}
    >
      <span className="status-badge-icon shrink-0" aria-hidden="true">
        {icon ?? <Icon className="h-3.5 w-3.5" />}
      </span>
      <span className="truncate">{children}</span>
    </span>
  );
}

interface StatusReasonProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  status: StatusTone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

export function StatusReason({
  status,
  title,
  children,
  actions,
  className,
  ...props
}: StatusReasonProps) {
  const Icon = status === "protected" ? LockKeyhole : statusIcons[status];

  return (
    <div
      className={cn(
        "status-reason flex min-w-0 items-start gap-2 border-l-2 py-1 pl-3 text-sm",
        statusSurfaceClasses[status],
        "border-y-0 border-r-0 bg-transparent",
        className,
      )}
      data-status={status}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        {children && (
          <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>
        )}
      </div>
      {actions && (
        <div className="status-reason-actions flex shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
    </div>
  );
}

interface DetailPaneProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function DetailPane({
  title,
  description,
  icon,
  actions,
  children,
  footer,
  className,
  ...props
}: DetailPaneProps) {
  return (
    <section
      className={cn(
        "detail-pane flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background",
        className,
      )}
      {...props}
    >
      <header className="detail-pane-header flex min-h-14 shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        {icon && (
          <div className="detail-pane-icon flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h2>
          {description && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {actions && (
          <div className="detail-pane-actions flex shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
      </header>
      <div className="detail-pane-body min-h-0 flex-1 overflow-y-auto p-4">
        {children}
      </div>
      {footer && (
        <footer className="detail-pane-footer flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}
