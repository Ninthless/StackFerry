import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
} from "@/shared/ui/dialog";
import { ProviderIcon } from "@/shared/ui/ProviderIcon";
import { IconPicker } from "@/shared/ui/IconPicker";
import { getIconMetadata } from "@/icons/extracted/metadata";
import type { UseFormReturn } from "react-hook-form";
import type { ProviderFormData } from "@/lib/schemas/provider";
import { ProviderFormSection } from "./ProviderFormLayout";

interface BasicFormFieldsProps {
  form: UseFormReturn<ProviderFormData>;
  /** Slot to render content between icon and name fields */
  beforeNameSlot?: ReactNode;
}

export function BasicFormFields({
  form,
  beforeNameSlot,
}: BasicFormFieldsProps) {
  const { t } = useTranslation();
  const [iconDialogOpen, setIconDialogOpen] = useState(false);

  const currentIcon = form.watch("icon");
  const currentIconColor = form.watch("iconColor");
  const providerName = form.watch("name") || "Provider";
  const effectiveIconColor =
    currentIconColor ||
    (currentIcon ? getIconMetadata(currentIcon)?.defaultColor : undefined);
  const iconButtonLabel = currentIcon
    ? t("providerIcon.clickToChange", {
        defaultValue: "Change provider icon",
      })
    : t("providerIcon.clickToSelect", {
        defaultValue: "Select provider icon",
      });

  const handleIconSelect = (icon: string) => {
    const meta = getIconMetadata(icon);
    form.setValue("icon", icon);
    form.setValue("iconColor", meta?.defaultColor ?? "");
  };

  return (
    <ProviderFormSection
      title={t("providerForm.identityTitle", {
        defaultValue: "Provider identity",
      })}
    >
      {/* 图标选择区域 - 顶部居中，可选 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[64px_minmax(0,1fr)]">
        <div className="flex justify-center sm:justify-start">
          <Dialog open={iconDialogOpen} onOpenChange={setIconDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-border-default bg-muted/30 p-2.5 transition-colors hover:border-foreground/30 hover:bg-muted/50"
                aria-label={iconButtonLabel}
                title={
                  currentIcon
                    ? t("providerIcon.clickToChange", {
                        defaultValue: "点击更换图标",
                      })
                    : t("providerIcon.clickToSelect", {
                        defaultValue: "点击选择图标",
                      })
                }
              >
                <ProviderIcon
                  icon={currentIcon}
                  name={providerName}
                  color={effectiveIconColor}
                  size={38}
                />
              </button>
            </DialogTrigger>
            <DialogContent
              variant="fullscreen"
              zIndex="top"
              overlayClassName="bg-[hsl(var(--background))]"
              className="p-0 sm:rounded-none"
            >
              <div className="flex h-full flex-col">
                <div className="flex-shrink-0 py-4 border-b border-border-default bg-muted/40">
                  <div className="px-6 flex items-center gap-4">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    </DialogClose>
                    <p className="text-lg font-semibold leading-tight">
                      {t("providerIcon.selectIcon", {
                        defaultValue: "选择图标",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 px-6 py-6 w-full">
                    <IconPicker
                      value={currentIcon}
                      onValueChange={handleIconSelect}
                      color={effectiveIconColor}
                    />
                    <div className="flex justify-end gap-2">
                      <DialogClose asChild>
                        <Button type="button" variant="outline">
                          {t("common.done", { defaultValue: "完成" })}
                        </Button>
                      </DialogClose>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {/* Slot for additional fields between icon and name */}
          {beforeNameSlot}

          {/* 基础信息 - 网格布局 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("provider.name")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("provider.namePlaceholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("provider.notes")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("provider.notesPlaceholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="websiteUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("provider.websiteUrl")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t("providerForm.websiteUrlPlaceholder")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </ProviderFormSection>
  );
}
