import { useId, useState } from "react"
import { Download } from "lucide-react"
import {
  REASONING_EFFORTS,
  overlayBaseUrl,
  overlaySession,
  withOverlaySession,
  type OverlaySession,
} from "@shared/provider-overlay"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const REASONING_ITEMS = [
  { label: "默认", value: null },
  { label: "minimal", value: "minimal" },
  { label: "low", value: "low" },
  { label: "medium", value: "medium" },
  { label: "high", value: "high" },
  { label: "xhigh", value: "xhigh" },
]

type Props = {
  formId: string
  tomlText: string
  apiKey: string
  providerId?: string
  onTomlChange: (value: string) => void
  onError: (message: string) => void
}

export function CodexSessionFields({
  formId,
  tomlText,
  apiKey,
  providerId,
  onTomlChange,
  onError,
}: Props) {
  const modelsListId = useId()
  const session = overlaySession(tomlText)
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)

  function patchSession(patch: Partial<OverlaySession>): void {
    try {
      onTomlChange(withOverlaySession(tomlText, patch))
      onError("")
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleFetchModels(): Promise<void> {
    const api = window.stackferry
    if (!api) {
      onError("请从 StackFerry 桌面应用打开，而不是浏览器预览页。")
      return
    }
    setFetching(true)
    try {
      const ids = await api.listModels({
        baseUrl: overlayBaseUrl(tomlText),
        apiKey,
        providerId,
      })
      setModels(ids)
      onError("")
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setFetching(false)
    }
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${formId}-model`}>默认模型</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`${formId}-model`}
            name="model"
            autoComplete="off"
            list={modelsListId}
            placeholder="gpt-5.4"
            value={session.model}
            onChange={(event) => patchSession({ model: event.target.value })}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={fetching}
              aria-label="获取模型列表"
              onClick={() => {
                void handleFetchModels()
              }}
            >
              <Download />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <datalist id={modelsListId}>
          {models.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <FieldDescription>
          填写 Base URL 和 API Key 后可获取模型列表，也可直接输入模型 ID。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${formId}-reasoning`}>思考等级</FieldLabel>
        <Select
          items={REASONING_ITEMS}
          value={session.reasoningEffort || null}
          onValueChange={(value) => {
            patchSession({
              reasoningEffort:
                typeof value === "string" && isReasoningOption(value) ? value : "",
            })
          }}
        >
          <SelectTrigger id={`${formId}-reasoning`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            <SelectGroup>
              {REASONING_ITEMS.map((item) => (
                <SelectItem key={item.value ?? "default"} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          对应 config.toml 的 model_reasoning_effort，仅 Responses API 生效。选「默认」则不写入该键。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${formId}-context`}>上下文窗口</FieldLabel>
        <Input
          id={`${formId}-context`}
          name="contextWindow"
          inputMode="numeric"
          placeholder="例如 272000，留空则用模型默认"
          value={session.contextWindow}
          onChange={(event) => patchSession({ contextWindow: event.target.value })}
        />
        <FieldDescription>对应 model_context_window，单位是 token。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${formId}-compact`}>自动压缩阈值</FieldLabel>
        <Input
          id={`${formId}-compact`}
          name="autoCompact"
          inputMode="numeric"
          placeholder="例如 900000，留空则不写"
          value={session.autoCompact}
          onChange={(event) => patchSession({ autoCompact: event.target.value })}
        />
        <FieldDescription>
          对应 model_auto_compact_token_limit。1M 上下文通常配 900000。
        </FieldDescription>
      </Field>
    </>
  )
}

function isReasoningOption(value: string): value is (typeof REASONING_EFFORTS)[number] {
  return (REASONING_EFFORTS as readonly string[]).includes(value)
}
