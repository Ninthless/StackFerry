import type { AppId } from "@/platform/tauri/api/types";
import { APP_ICON_MAP } from "@/shared/platform/appRegistry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/select";
import { useTranslation } from "react-i18next";

interface AppSelectProps {
  value: AppId;
  appIds: readonly AppId[];
  onValueChange: (app: AppId) => void;
  ariaLabel: string;
}

export function AppSelect({
  value,
  appIds,
  onValueChange,
  ariaLabel,
}: AppSelectProps) {
  const { t } = useTranslation();

  return (
    <Select value={value} onValueChange={(app) => onValueChange(app as AppId)}>
      <SelectTrigger
        className="h-8 w-[168px] shrink-0 px-2.5"
        aria-label={ariaLabel}
        disabled={appIds.length <= 1}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">{APP_ICON_MAP[value].icon}</span>
          <span className="truncate">
            {t(`apps.${value}`, {
              defaultValue: APP_ICON_MAP[value].label,
            })}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        {appIds.map((app) => (
          <SelectItem key={app} value={app}>
            <span className="flex items-center gap-2">
              {APP_ICON_MAP[app].icon}
              <span>
                {t(`apps.${app}`, {
                  defaultValue: APP_ICON_MAP[app].label,
                })}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
