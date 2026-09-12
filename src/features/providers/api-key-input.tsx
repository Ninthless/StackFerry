import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import * as m from "@/paraglide/messages.js"

type Props = Omit<ComponentProps<typeof InputGroupInput>, "type" | "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
}

export function ApiKeyInput({ id, value, onValueChange, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput
        autoComplete="off"
        spellCheck={false}
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          aria-label={visible ? m.action_hide_api_key() : m.action_show_api_key()}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
