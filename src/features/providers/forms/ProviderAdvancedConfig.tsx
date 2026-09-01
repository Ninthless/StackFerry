import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Coins } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
export type PricingModelSourceOption = "inherit" | "request" | "response";

interface ProviderPricingConfig {
  enabled: boolean;
  costMultiplier?: string;
  pricingModelSource: PricingModelSourceOption;
}

interface ProviderAdvancedConfigProps {
  pricingConfig: ProviderPricingConfig;
  onPricingConfigChange: (config: ProviderPricingConfig) => void;
}

export function ProviderAdvancedConfig({
  pricingConfig,
  onPricingConfigChange,
}: ProviderAdvancedConfigProps) {
  const { t } = useTranslation();
  const [isPricingConfigOpen, setIsPricingConfigOpen] = useState(
    pricingConfig.enabled,
  );

  useEffect(() => {
    setIsPricingConfigOpen(pricingConfig.enabled);
  }, [pricingConfig.enabled]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/50 bg-muted/20">
        <div className="flex items-center">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30"
            aria-expanded={isPricingConfigOpen}
            aria-controls="pricing-config-panel"
            onClick={() => setIsPricingConfigOpen(!isPricingConfigOpen)}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">
                {t("providerAdvanced.pricingConfig", {
                  defaultValue: "计费配置",
                })}
              </span>
            </span>
            {isPricingConfigOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          <div className="flex shrink-0 items-center gap-2 pr-4">
            <Label
              htmlFor="pricing-config-enabled"
              className="text-sm text-muted-foreground"
            >
              {t("providerAdvanced.useCustomPricing", {
                defaultValue: "使用单独配置",
              })}
            </Label>
            <Switch
              id="pricing-config-enabled"
              checked={pricingConfig.enabled}
              onCheckedChange={(checked) => {
                onPricingConfigChange({ ...pricingConfig, enabled: checked });
                if (checked) setIsPricingConfigOpen(true);
              }}
            />
          </div>
        </div>
        {isPricingConfigOpen && (
          <div id="pricing-config-panel">
            <div className="space-y-4 border-t border-border/50 p-4">
              <p className="text-sm text-muted-foreground">
                {t("providerAdvanced.pricingConfigDesc", {
                  defaultValue:
                    "为此供应商配置单独的计费参数，不启用时使用全局默认配置。",
                })}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cost-multiplier">
                    {t("providerAdvanced.costMultiplier", {
                      defaultValue: "成本倍率",
                    })}
                  </Label>
                  <Input
                    id="cost-multiplier"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={pricingConfig.costMultiplier || ""}
                    onChange={(e) =>
                      onPricingConfigChange({
                        ...pricingConfig,
                        costMultiplier: e.target.value || undefined,
                      })
                    }
                    placeholder={t(
                      "providerAdvanced.costMultiplierPlaceholder",
                      {
                        defaultValue: "留空使用全局默认（1）",
                      },
                    )}
                    disabled={!pricingConfig.enabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("providerAdvanced.costMultiplierHint", {
                      defaultValue:
                        "实际成本 = 基础成本 × 倍率，支持小数如 1.5",
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricing-model-source">
                    {t("providerAdvanced.pricingModelSourceLabel", {
                      defaultValue: "计费模式",
                    })}
                  </Label>
                  <Select
                    value={pricingConfig.pricingModelSource}
                    onValueChange={(value) =>
                      onPricingConfigChange({
                        ...pricingConfig,
                        pricingModelSource: value as PricingModelSourceOption,
                      })
                    }
                    disabled={!pricingConfig.enabled}
                  >
                    <SelectTrigger id="pricing-model-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">
                        {t("providerAdvanced.pricingModelSourceInherit", {
                          defaultValue: "继承全局默认",
                        })}
                      </SelectItem>
                      <SelectItem value="request">
                        {t("providerAdvanced.pricingModelSourceRequest", {
                          defaultValue: "请求模型",
                        })}
                      </SelectItem>
                      <SelectItem value="response">
                        {t("providerAdvanced.pricingModelSourceResponse", {
                          defaultValue: "返回模型",
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("providerAdvanced.pricingModelSourceHint", {
                      defaultValue: "选择按请求模型还是返回模型进行定价匹配",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
