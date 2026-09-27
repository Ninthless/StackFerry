import { useEffect, useId, useState } from "react"
import { emptyEgressProxyView, type EgressProxyView } from "@shared/egress-proxy"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { HintLabel, HintTitle } from "./settings-hint"

function tipError(description: string): void {
  toast.add({ id: "egress-proxy", type: "error", description, priority: "high" })
}

export function EgressProxyCard({ onChanged }: { onChanged: () => void }) {
  const formId = useId()
  const [view, setView] = useState<EgressProxyView>(emptyEgressProxyView)
  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [bypass, setBypass] = useState("")
  const [switchKey, setSwitchKey] = useState(0)

  useEffect(() => {
    const api = window.stackferry
    if (!api) return
    let cancelled = false
    void api.getEgressProxy().then((next) => {
      if (cancelled) return
      applyView(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function applyView(next: EgressProxyView): void {
    setView(next)
    setUrl(next.url)
    setUsername(next.username)
    setBypass(next.bypass)
    setPassword("")
    setPasswordDirty(false)
  }

  async function save(patch: {
    enabled?: boolean
    url?: string
    username?: string
    bypass?: string
    password?: string
  }): Promise<void> {
    const api = window.stackferry
    if (!api) return
    try {
      const next = await api.setEgressProxy(patch)
      applyView(next)
      onChanged()
    } catch (saveError) {
      tipError(formatAppError(saveError))
      setSwitchKey((key) => key + 1)
    }
  }

  return (
    <Card>
      <CardHeader>
        <HintTitle hint={m.egress_description()}>
          <CardTitle>{m.egress_legend()}</CardTitle>
        </HintTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${formId}-enabled`}>{m.egress_enabled()}</FieldLabel>
            </FieldContent>
            <Switch
              key={switchKey}
              id={`${formId}-enabled`}
              checked={view.enabled}
              onCheckedChange={(checked) => {
                if (checked && !url.trim()) {
                  tipError(m.error_egress_proxy_url())
                  setSwitchKey((key) => key + 1)
                  return
                }
                void save({ enabled: checked, url, username, bypass, ...(passwordDirty ? { password } : {}) })
              }}
            />
          </Field>
          <Field>
            <HintLabel htmlFor={`${formId}-url`} hint={m.egress_url_description()}>
              {m.egress_url()}
            </HintLabel>
            <Input
              id={`${formId}-url`}
              value={url}
              placeholder={m.egress_url_placeholder()}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => {
                if (url.trim() === view.url) return
                void save({ url, username, bypass, ...(passwordDirty ? { password } : {}) })
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-username`}>{m.egress_username()}</FieldLabel>
            <Input
              id={`${formId}-username`}
              value={username}
              autoComplete="off"
              onChange={(event) => setUsername(event.target.value)}
              onBlur={() => {
                if (username.trim() === view.username) return
                void save({ url, username, bypass, ...(passwordDirty ? { password } : {}) })
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-password`}>{m.egress_password()}</FieldLabel>
            <Input
              id={`${formId}-password`}
              type="password"
              value={password}
              placeholder={view.hasPassword ? m.egress_password_set() : ""}
              autoComplete="new-password"
              onChange={(event) => {
                setPassword(event.target.value)
                setPasswordDirty(true)
              }}
              onBlur={() => {
                if (!passwordDirty) return
                void save({ url, username, password, bypass })
              }}
            />
          </Field>
          <Field>
            <HintLabel htmlFor={`${formId}-bypass`} hint={m.egress_bypass_description()}>
              {m.egress_bypass()}
            </HintLabel>
            <Input
              id={`${formId}-bypass`}
              value={bypass}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setBypass(event.target.value)}
              onBlur={() => {
                if (bypass.trim() === view.bypass) return
                void save({ url, username, bypass, ...(passwordDirty ? { password } : {}) })
              }}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
