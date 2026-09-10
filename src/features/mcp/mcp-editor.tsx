import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import {
  formatArgList,
  isMcpTransport,
  MCP_TARGETS,
  parseArgList,
  suggestMcpId,
  uniqueMcpTargets,
  type McpDraft,
  type McpListItem,
  type McpTarget,
  type McpTransport,
} from "@shared/mcp"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { missingText, nonHttpUrl, useEditorSubmit } from "@/features/providers/editor-validation"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { McpPairFields, pairsFromRecord, recordFromPairs, type McpPair } from "./mcp-pair-fields"

type Props = {
  open: boolean
  editing: McpListItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: McpDraft) => Promise<void>
}

export function McpEditor({ open, editing, onOpenChange, onSubmit }: Props) {
  const formId = useId()
  const [name, setName] = useState("")
  const [id, setId] = useState("")
  const [idTouched, setIdTouched] = useState(false)
  const [transport, setTransport] = useState<McpTransport>("stdio")
  const [command, setCommand] = useState("")
  const [argsText, setArgsText] = useState("")
  const [cwd, setCwd] = useState("")
  const [url, setUrl] = useState("")
  const [bearer, setBearer] = useState("")
  const [envPairs, setEnvPairs] = useState<McpPair[]>([])
  const [headerPairs, setHeaderPairs] = useState<McpPair[]>([])
  const [targets, setTargets] = useState<McpTarget[]>([...MCP_TARGETS])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const displayedRef = useRef(editing)
  if (open) displayedRef.current = editing
  const displayed = displayedRef.current
  const { submitted, markSubmitted } = useEditorSubmit(open)
  const nameInvalid = submitted && missingText(name)
  const idInvalid = submitted && missingText(id)
  const commandInvalid = submitted && transport === "stdio" && missingText(command)
  const urlInvalid = submitted && transport === "http" && (missingText(url) || nonHttpUrl(url))

  useEffect(() => {
    if (!open) return
    setError("")
    setPending(false)
    if (editing) {
      setName(editing.name)
      setId(editing.id)
      setIdTouched(true)
      setTransport(editing.transport)
      setCommand(editing.command)
      setArgsText(formatArgList(editing.args))
      setCwd(editing.cwd)
      setUrl(editing.url)
      setBearer(editing.bearerTokenEnvVar)
      setEnvPairs(pairsFromRecord(editing.env))
      setHeaderPairs(pairsFromRecord(editing.headers))
      setTargets(editing.appliedTo)
      return
    }
    setName("")
    setId("")
    setIdTouched(false)
    setTransport("stdio")
    setCommand("")
    setArgsText("")
    setCwd("")
    setUrl("")
    setBearer("")
    setEnvPairs([])
    setHeaderPairs([])
    setTargets([...MCP_TARGETS])
  }, [open, editing])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    markSubmitted()
    if (missingText(name) || missingText(id)) return
    if (transport === "stdio" && missingText(command)) return
    if (transport === "http" && (missingText(url) || nonHttpUrl(url))) return
    setPending(true)
    setError("")
    try {
      await onSubmit({
        id,
        name,
        transport,
        command,
        args: parseArgList(argsText),
        cwd,
        env: recordFromPairs(envPairs),
        url,
        headers: recordFromPairs(headerPairs),
        bearerTokenEnvVar: bearer,
        claudeRemoteType: displayed?.claudeRemoteType,
        appliedTo: uniqueMcpTargets(targets),
      })
    } catch (submitError) {
      setError(formatAppError(submitError))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={handleSubmit}>
          <SheetHeader>
            <SheetTitle>{displayed ? m.mcp_editor_edit_title() : m.mcp_editor_add_title()}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <FieldGroup className="px-4 pb-4">
              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor={`${formId}-name`} required>
                  {m.field_name()}
                </FieldLabel>
                <Input
                  id={`${formId}-name`}
                  name="name"
                  aria-required
                  aria-invalid={nameInvalid || undefined}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => {
                    const next = event.target.value
                    setName(next)
                    if (!displayed && !idTouched) setId(suggestMcpId(next))
                  }}
                />
                {nameInvalid ? <FieldError>{m.error_mcp_name_required()}</FieldError> : null}
              </Field>
              <Field data-invalid={idInvalid || undefined}>
                <FieldLabel htmlFor={`${formId}-id`} required>
                  {m.mcp_field_id()}
                </FieldLabel>
                <Input
                  id={`${formId}-id`}
                  name="id"
                  aria-required
                  aria-invalid={idInvalid || undefined}
                  autoComplete="off"
                  disabled={Boolean(displayed)}
                  value={id}
                  onChange={(event) => {
                    setIdTouched(true)
                    setId(event.target.value)
                  }}
                />
                <FieldDescription>{m.mcp_field_id_description()}</FieldDescription>
                {idInvalid ? <FieldError>{m.error_mcp_id_invalid()}</FieldError> : null}
              </Field>
              <FieldSet>
                <FieldLegend variant="label">{m.mcp_field_transport()}</FieldLegend>
                <ToggleGroup
                  value={[transport]}
                  onValueChange={(value) => {
                    const next = value[0]
                    if (isMcpTransport(next)) setTransport(next)
                  }}
                  variant="outline"
                >
                  <ToggleGroupItem value="stdio">{m.mcp_transport_stdio()}</ToggleGroupItem>
                  <ToggleGroupItem value="http">{m.mcp_transport_http()}</ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
              {transport === "stdio" ? (
                <>
                  <Field data-invalid={commandInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-command`} required>
                      {m.mcp_field_command()}
                    </FieldLabel>
                    <Input
                      id={`${formId}-command`}
                      name="command"
                      aria-required
                      aria-invalid={commandInvalid || undefined}
                      autoComplete="off"
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                    />
                    {commandInvalid ? <FieldError>{m.error_mcp_command_required()}</FieldError> : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-args`}>{m.mcp_field_args()}</FieldLabel>
                    <Input
                      id={`${formId}-args`}
                      name="args"
                      autoComplete="off"
                      value={argsText}
                      onChange={(event) => setArgsText(event.target.value)}
                    />
                    <FieldDescription>{m.mcp_field_args_description()}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-cwd`}>{m.mcp_field_cwd()}</FieldLabel>
                    <Input
                      id={`${formId}-cwd`}
                      name="cwd"
                      autoComplete="off"
                      value={cwd}
                      onChange={(event) => setCwd(event.target.value)}
                    />
                  </Field>
                  <McpPairFields
                    formId={`${formId}-env`}
                    label={m.mcp_field_env()}
                    pairs={envPairs}
                    onChange={setEnvPairs}
                  />
                </>
              ) : (
                <>
                  <Field data-invalid={urlInvalid || undefined}>
                    <FieldLabel htmlFor={`${formId}-url`} required>
                      {m.mcp_field_url()}
                    </FieldLabel>
                    <Input
                      id={`${formId}-url`}
                      name="url"
                      type="url"
                      inputMode="url"
                      aria-required
                      aria-invalid={urlInvalid || undefined}
                      autoComplete="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                    />
                    {urlInvalid ? <FieldError>{m.error_mcp_url_invalid()}</FieldError> : null}
                  </Field>
                  <McpPairFields
                    formId={`${formId}-headers`}
                    label={m.mcp_field_headers()}
                    pairs={headerPairs}
                    onChange={setHeaderPairs}
                  />
                  <Field>
                    <FieldLabel htmlFor={`${formId}-bearer`}>{m.mcp_field_bearer()}</FieldLabel>
                    <Input
                      id={`${formId}-bearer`}
                      name="bearerTokenEnvVar"
                      autoComplete="off"
                      value={bearer}
                      onChange={(event) => setBearer(event.target.value)}
                    />
                    <FieldDescription>{m.mcp_field_bearer_description()}</FieldDescription>
                  </Field>
                </>
              )}
              <FieldSet>
                <FieldLegend variant="label">{m.mcp_field_targets()}</FieldLegend>
                <FieldGroup>
                  {MCP_TARGETS.map((target) => (
                    <Field key={target} orientation="horizontal">
                      <FieldLabel htmlFor={`${formId}-${target}`}>
                        {target === "claude" ? m.skills_claude() : target === "codex" ? m.skills_codex() : m.skills_grok()}
                      </FieldLabel>
                      <Switch
                        id={`${formId}-${target}`}
                        checked={targets.includes(target)}
                        onCheckedChange={(checked) => {
                          setTargets((current) =>
                            uniqueMcpTargets(checked ? [...current, target] : current.filter((item) => item !== target)),
                          )
                        }}
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </ScrollArea>
          <SheetFooter>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {m.action_cancel()}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? m.action_saving() : m.action_save()}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
