import {
  Activity,
  BarChart3,
  Check,
  Copy,
  Edit,
  Loader2,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  Terminal,
  Trash2,
  Zap,
  Boxes,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AppId } from "@/platform/tauri/api";

interface ProviderActionsProps {
  appId?: AppId;
  isCurrent: boolean;
  isInConfig?: boolean;
  isTesting?: boolean;
  isProxyTakeover?: boolean;
  isOmo?: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onTest?: () => void;
  onConfigureUsage?: () => void;
  onDelete: () => void;
  onRemoveFromConfig?: () => void;
  onDisableOmo?: () => void;
  onOpenTerminal?: () => void;
  onManageRuntimeEnvironments?: () => void;
  isAutoFailoverEnabled?: boolean;
  isInFailoverQueue?: boolean;
  isFailoverMutationPending?: boolean;
  onToggleFailover?: (enabled: boolean) => void;
  isOfficialBlockedByProxy?: boolean;
  isReadOnly?: boolean;
  isDefaultModel?: boolean;
  onSetAsDefault?: () => void;
}

interface MainButtonState {
  disabled: boolean;
  variant: "default" | "secondary";
  className: string;
  icon: JSX.Element;
  text: string;
  title?: string;
}

export function ProviderActions({
  appId,
  isCurrent,
  isInConfig = false,
  isTesting,
  isProxyTakeover = false,
  isOmo = false,
  onSwitch,
  onEdit,
  onDuplicate,
  onTest,
  onConfigureUsage,
  onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onOpenTerminal,
  onManageRuntimeEnvironments,
  isAutoFailoverEnabled = false,
  isInFailoverQueue = false,
  isFailoverMutationPending = false,
  onToggleFailover,
  isOfficialBlockedByProxy = false,
  isReadOnly = false,
  isDefaultModel = false,
  onSetAsDefault,
}: ProviderActionsProps) {
  const { t } = useTranslation();
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const isMenuOpenRef = useRef(false);
  const suppressTooltipRef = useRef(false);
  const isAdditiveMode =
    (appId === "opencode" && !isOmo) ||
    appId === "openclaw" ||
    appId === "hermes" ||
    appId === "pi";
  const isFailoverMode =
    !isAdditiveMode && !isOmo && isAutoFailoverEnabled && onToggleFailover;

  const handleMainButtonClick = () => {
    if (isOmo) {
      if (isCurrent) {
        onDisableOmo?.();
      } else {
        onSwitch();
      }
      return;
    }

    if (isAdditiveMode) {
      if (isInConfig) {
        if (onRemoveFromConfig) {
          onRemoveFromConfig();
        } else {
          onDelete();
        }
      } else {
        onSwitch();
      }
      return;
    }

    if (isFailoverMode) {
      onToggleFailover(!isInFailoverQueue);
      return;
    }

    onSwitch();
  };

  const getMainButtonState = (): MainButtonState => {
    if (isOmo) {
      if (isCurrent) {
        return {
          disabled: false,
          variant: "secondary",
          className: "bg-muted text-muted-foreground hover:bg-muted",
          icon: <Check className="h-4 w-4" />,
          text: t("provider.inUse"),
        };
      }
      return {
        disabled: false,
        variant: "default",
        className: "",
        icon: <Play className="h-4 w-4" />,
        text: t("provider.enable"),
      };
    }

    if (isAdditiveMode) {
      if (isInConfig) {
        return {
          disabled: isDefaultModel,
          variant: "secondary",
          className: cn(
            "bg-accent/15 text-foreground hover:bg-accent/25",
            isDefaultModel && "cursor-not-allowed opacity-40",
          ),
          icon: <Minus className="h-4 w-4" />,
          text: t("provider.removeFromConfig"),
        };
      }
      return {
        disabled: false,
        variant: "default",
        className: "",
        icon: <Plus className="h-4 w-4" />,
        text: t("provider.addToConfig"),
      };
    }

    if (isFailoverMode) {
      if (isFailoverMutationPending) {
        return {
          disabled: true,
          variant: "secondary",
          className: "bg-primary/10 text-primary",
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: t(isInFailoverQueue ? "failover.inQueue" : "failover.addQueue"),
        };
      }
      if (isInFailoverQueue) {
        return {
          disabled: false,
          variant: "secondary",
          className: "bg-primary/10 text-primary hover:bg-primary/15",
          icon: <Check className="h-4 w-4" />,
          text: t("failover.inQueue"),
        };
      }
      return {
        disabled: false,
        variant: "default",
        className: "",
        icon: <Plus className="h-4 w-4" />,
        text: t("failover.addQueue"),
      };
    }

    if (isCurrent) {
      return {
        disabled: true,
        variant: "secondary",
        className: "bg-muted text-muted-foreground hover:bg-muted",
        icon: <Check className="h-4 w-4" />,
        text: t("provider.inUse"),
      };
    }

    if (isOfficialBlockedByProxy) {
      return {
        disabled: true,
        variant: "default",
        className: "",
        icon: <Play className="h-4 w-4" />,
        text: t("provider.enable"),
        title: t("provider.blockedByProxyHint"),
      };
    }

    return {
      disabled: false,
      variant: "default",
      className: isProxyTakeover ? "bg-primary hover:bg-primary/90" : "",
      icon: <Play className="h-4 w-4" />,
      text: t("provider.enable"),
    };
  };

  const buttonState = getMainButtonState();
  const canDelete =
    !isReadOnly && (isOmo || isAdditiveMode ? true : !isCurrent);
  const readOnlyHint = t("provider.managedByHermesHint");

  const handleMenuOpenChange = (open: boolean) => {
    isMenuOpenRef.current = open;
    suppressTooltipRef.current = true;
    setIsTooltipOpen(false);
  };

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && (isMenuOpenRef.current || suppressTooltipRef.current)) {
      return;
    }
    setIsTooltipOpen(open);
  };

  return (
    <div className="flex items-center gap-1.5">
      {onManageRuntimeEnvironments && (
        <Button
          size="sm"
          variant="outline"
          onClick={onManageRuntimeEnvironments}
          className="w-fit px-2.5"
        >
          <Boxes className="h-4 w-4" />
          {t("provider.manageRuntimeEnvironments")}
        </Button>
      )}
      {(appId === "openclaw" || appId === "hermes" || appId === "pi") &&
        isInConfig &&
        onSetAsDefault &&
        (() => {
          const activeLabel =
            appId === "hermes" ? t("provider.inUse") : t("provider.isDefault");
          const inactiveLabel =
            appId === "hermes"
              ? t("provider.enable")
              : t("provider.setAsDefault");
          return (
            <Button
              size="sm"
              variant={isDefaultModel ? "secondary" : "default"}
              onClick={isDefaultModel ? undefined : onSetAsDefault}
              disabled={isDefaultModel}
              className={cn(
                "w-fit px-2.5",
                isDefaultModel &&
                  "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
              )}
            >
              <Zap className="h-4 w-4" />
              {isDefaultModel ? activeLabel : inactiveLabel}
            </Button>
          );
        })()}

      <span
        title={buttonState.title}
        className={cn(
          "inline-flex",
          buttonState.disabled && "cursor-not-allowed",
        )}
      >
        <Button
          size="sm"
          variant={buttonState.variant}
          onClick={handleMainButtonClick}
          disabled={buttonState.disabled}
          className={cn("min-w-[4.5rem] px-2.5", buttonState.className)}
        >
          {buttonState.icon}
          {buttonState.text}
        </Button>
      </span>

      <TooltipProvider delayDuration={300}>
        <DropdownMenu onOpenChange={handleMenuOpenChange}>
          <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("provider.moreActions")}
                  className="h-8 w-8"
                  onPointerMove={() => {
                    if (!isMenuOpenRef.current) {
                      suppressTooltipRef.current = false;
                    }
                  }}
                  onBlur={() => {
                    if (!isMenuOpenRef.current) {
                      suppressTooltipRef.current = false;
                    }
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t("provider.moreActions")}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onSelect={onEdit}
              disabled={isReadOnly}
              title={isReadOnly ? readOnlyHint : undefined}
            >
              <Edit className="h-4 w-4" />
              {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="h-4 w-4" />
              {t("provider.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTest} disabled={!onTest || isTesting}>
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Activity className="h-4 w-4" />
              )}
              {t("provider.connectivityCheck")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onConfigureUsage}
              disabled={!onConfigureUsage}
            >
              <BarChart3 className="h-4 w-4" />
              {t("provider.configureUsage")}
            </DropdownMenuItem>
            {onOpenTerminal && (
              <DropdownMenuItem onSelect={onOpenTerminal}>
                <Terminal className="h-4 w-4" />
                {t("provider.launchDirect")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={canDelete ? onDelete : undefined}
              disabled={!canDelete}
              title={isReadOnly ? readOnlyHint : undefined}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>
    </div>
  );
}
