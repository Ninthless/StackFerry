import { Menu, Tray, nativeImage, type MenuItemConstructorOptions, type NativeImage } from 'electron'
import type { CliToolId } from '../../shared/cli-tools'
import type { ClaudeProviderListItem, GrokProviderListItem, ProviderListItem } from '../../shared/types'
import { m } from './i18n'
import { buildTrayMenuTemplate, type TrayCliLists, type TrayMenuNode } from './tray-menu'

type TrayOptions = {
  iconPath: string
  onShow: () => void
  onQuit: () => void
  onEnable: (cliId: CliToolId, id: string) => Promise<void>
}

export class AppTray {
  private tray: Tray | null = null

  constructor(private readonly options: TrayOptions) {}

  create(): void {
    if (this.tray) return
    this.tray = new Tray(this.loadIcon())
    this.tray.setToolTip('StackFerry')
    if (process.platform !== 'darwin') {
      this.tray.on('click', () => this.options.onShow())
    }
    this.update({ codex: [], claude: [], grok: [] })
  }

  update(lists: {
    codex: ProviderListItem[]
    claude: ClaudeProviderListItem[]
    grok: GrokProviderListItem[]
  }): void {
    if (!this.tray) return
    const snapshot: TrayCliLists = {
      codex: lists.codex,
      'claude-code': lists.claude,
      'grok-build': lists.grok,
    }
    this.tray.setContextMenu(
      Menu.buildFromTemplate(
        toElectronMenu(
          buildTrayMenuTemplate(snapshot, {
            open: m.tray_open(),
            empty: m.tray_empty(),
            quit: m.tray_quit(),
            clis: {
              codex: m.tray_cli_codex(),
              'claude-code': m.tray_cli_claude(),
              'grok-build': m.tray_cli_grok(),
            },
          }),
          this.options,
        ),
      ),
    )
  }

  private loadIcon(): NativeImage {
    const image = nativeImage.createFromPath(this.options.iconPath)
    if (image.isEmpty()) {
      return nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALElEQVRYR+3QQREAAAQEMPdft5tDsQFm0kqSJEmSJEmSJEmSJEmS5GcP8w8AAfkB3tEAAAAASUVORK5CYII=',
      )
    }
    if (process.platform === 'darwin') image.setTemplateImage(true)
    return image
  }
}

function toElectronMenu(nodes: TrayMenuNode[], options: TrayOptions): MenuItemConstructorOptions[] {
  return nodes.map((node) => {
    if (node.type === 'separator') return { type: 'separator' }
    if (node.type === 'submenu') {
      return { label: node.label, submenu: toElectronMenu(node.submenu, options) }
    }
    if (node.type === 'radio') {
      return {
        type: 'radio',
        label: node.label,
        checked: node.checked,
        click: () => {
          void options.onEnable(node.click.cliId, node.click.providerId)
        },
      }
    }
    return {
      type: 'normal',
      label: node.label,
      enabled: node.enabled,
      click: node.click?.kind === 'show' ? () => options.onShow() : node.click?.kind === 'quit' ? () => options.onQuit() : undefined,
    }
  })
}
