import { useMemo } from "react"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { HintLabel } from "@/features/settings/settings-hint"
import * as m from "@/paraglide/messages.js"

type Props = {
  formId: string
  catalogModels: string[]
  imageModel: string
  videoModel: string
  imageBaseUrl: string
  imageApiKey: string
  hasImageApiKey: boolean
  imageBaseUrlInvalid: boolean
  onImageModelChange: (value: string) => void
  onVideoModelChange: (value: string) => void
  onImageBaseUrlChange: (value: string) => void
  onImageApiKeyChange: (value: string) => void
}

export function GrokImageFields({
  formId,
  catalogModels,
  imageModel,
  videoModel,
  imageBaseUrl,
  imageApiKey,
  hasImageApiKey,
  imageBaseUrlInvalid,
  onImageModelChange,
  onVideoModelChange,
  onImageBaseUrlChange,
  onImageApiKeyChange,
}: Props) {
  const imageItems = useMemo(
    () => withCurrent(catalogModels, imageModel),
    [catalogModels, imageModel],
  )
  const videoItems = useMemo(
    () => withCurrent(catalogModels, videoModel),
    [catalogModels, videoModel],
  )

  return (
    <FieldSet>
      <FieldLegend>{m.grok_field_image_legend()}</FieldLegend>
      <FieldDescription>{m.grok_field_image_description()}</FieldDescription>
      <Field>
        <HintLabel htmlFor={`${formId}-image-model`} hint={m.grok_field_image_model_hint()}>
          {m.grok_field_image_model()}
        </HintLabel>
        <ModelCombobox
          id={`${formId}-image-model`}
          name="imageModel"
          items={imageItems}
          value={imageModel}
          placeholder={m.grok_field_image_model_placeholder()}
          empty={m.grok_field_image_models_empty()}
          onChange={onImageModelChange}
        />
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-video-model`} hint={m.grok_field_video_model_hint()}>
          {m.grok_field_video_model()}
        </HintLabel>
        <ModelCombobox
          id={`${formId}-video-model`}
          name="videoModel"
          items={videoItems}
          value={videoModel}
          placeholder={m.grok_field_video_model_placeholder()}
          empty={m.grok_field_image_models_empty()}
          onChange={onVideoModelChange}
        />
      </Field>
      <Field data-invalid={imageBaseUrlInvalid || undefined}>
        <HintLabel htmlFor={`${formId}-image-base-url`} hint={m.grok_field_image_base_url_hint()}>
          {m.grok_field_image_base_url()}
        </HintLabel>
        <Input
          id={`${formId}-image-base-url`}
          name="imageBaseUrl"
          type="url"
          autoComplete="url"
          inputMode="url"
          aria-invalid={imageBaseUrlInvalid || undefined}
          placeholder={m.grok_field_image_base_url_placeholder()}
          value={imageBaseUrl}
          onChange={(event) => onImageBaseUrlChange(event.target.value)}
        />
        {imageBaseUrlInvalid ? <FieldError>{m.error_grok_base_url_invalid()}</FieldError> : null}
      </Field>
      <Field>
        <HintLabel htmlFor={`${formId}-image-api-key`} hint={m.grok_field_image_api_key_hint()}>
          {m.grok_field_image_api_key()}
        </HintLabel>
        <Input
          id={`${formId}-image-api-key`}
          name="imageApiKey"
          type="password"
          autoComplete="off"
          placeholder={
            hasImageApiKey ? m.api_key_keep_placeholder() : m.grok_field_image_api_key_placeholder()
          }
          value={imageApiKey}
          onChange={(event) => onImageApiKeyChange(event.target.value)}
        />
      </Field>
    </FieldSet>
  )
}

function ModelCombobox({
  id,
  name,
  items,
  value,
  placeholder,
  empty,
  onChange,
}: {
  id: string
  name: string
  items: string[]
  value: string
  placeholder: string
  empty: string
  onChange: (value: string) => void
}) {
  return (
    <Combobox
      items={items}
      value={value || null}
      inputValue={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
      onInputValueChange={onChange}
    >
      <ComboboxInput
        id={id}
        name={name}
        autoComplete="off"
        placeholder={placeholder}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function withCurrent(catalog: string[], current: string): string[] {
  if (!current || catalog.includes(current)) return catalog
  return [current, ...catalog]
}
