import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const providerPanelContentClassName =
  "mx-auto w-full max-w-[1088px] pb-8 pt-2";

export const providerPanelFooterClassName = "mx-auto w-full max-w-[1088px]";

export const providerFormClassName = "mx-auto w-full max-w-5xl pb-4";

interface ProviderFormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function ProviderFormSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: ProviderFormSectionProps) {
  const hasHeader = title || description || actions;

  return (
    <section
      className={cn(
        "border-b border-border-default py-6 first:pt-2 last:border-b-0",
        className,
      )}
    >
      {hasHeader && (
        <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-1">
            {title && (
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            )}
            {description && (
              <p className="text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="w-full sm:w-auto sm:shrink-0">{actions}</div>
          )}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
