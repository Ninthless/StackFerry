import { CLI_TOOL_IDS, type CliToolId } from '../../shared/cli-tools'

export type TrayProviderItem = {
  id: string
  name: string
  enabled: boolean
}

export type TrayCliLists = Record<CliToolId, TrayProviderItem[]>

export type TrayMenuLabels = {
  open: string
  empty: string
  quit: string
  clis: Record<CliToolId, string>
}

export type TrayMenuClick =
  | { kind: 'show' }
  | { kind: 'quit' }
  | { kind: 'enable'; cliId: CliToolId; providerId: string }

export type TrayMenuNode =
  | { type: 'separator' }
  | { type: 'normal'; label: string; enabled?: false; click?: TrayMenuClick }
  | { type: 'radio'; label: string; checked: boolean; click: Extract<TrayMenuClick, { kind: 'enable' }> }
  | { type: 'submenu'; label: string; submenu: TrayMenuNode[] }

export function buildTrayMenuTemplate(lists: TrayCliLists, labels: TrayMenuLabels): TrayMenuNode[] {
  return [
    { type: 'normal', label: labels.open, click: { kind: 'show' } },
    { type: 'separator' },
    ...CLI_TOOL_IDS.map((cliId) => ({
      type: 'submenu' as const,
      label: labels.clis[cliId],
      submenu: providerItems(lists[cliId], cliId, labels.empty),
    })),
    { type: 'separator' },
    { type: 'normal', label: labels.quit, click: { kind: 'quit' } },
  ]
}

function providerItems(
  providers: TrayProviderItem[],
  cliId: CliToolId,
  emptyLabel: string,
): TrayMenuNode[] {
  if (providers.length === 0) {
    return [{ type: 'normal', label: emptyLabel, enabled: false }]
  }
  return providers.map((provider) => ({
    type: 'radio',
    label: provider.name,
    checked: provider.enabled,
    click: { kind: 'enable', cliId, providerId: provider.id },
  }))
}
