import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import type { ProviderListItem } from '../../shared/types'

type TrayOptions = {
  iconPath: string
  onShow: () => void
  onQuit: () => void
  onEnable: (id: string) => Promise<void>
}

export class AppTray {
  private tray: Tray | null = null

  constructor(private readonly options: TrayOptions) {}

  create(): void {
    if (this.tray) return
    this.tray = new Tray(this.loadIcon())
    this.tray.setToolTip('StackFerry')
    this.tray.on('click', () => this.options.onShow())
    this.update([])
  }

  update(providers: ProviderListItem[]): void {
    if (!this.tray) return
    const providerItems = providers.map((provider) => ({
      label: provider.enabled ? `✓ ${provider.name}` : provider.name,
      click: () => {
        void this.options.onEnable(provider.id)
      },
    }))
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开 StackFerry', click: () => this.options.onShow() },
        { type: 'separator' },
        ...(providerItems.length
          ? providerItems
          : [{ label: '暂无供应商', enabled: false }]),
        { type: 'separator' },
        { label: '退出', click: () => this.options.onQuit() },
      ]),
    )
  }

  private loadIcon(): NativeImage {
    const image = nativeImage.createFromPath(this.options.iconPath)
    if (image.isEmpty()) {
      return nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALElEQVRYR+3QQREAAAQEMPdft5tDsQFm0kqSJEmSJEmSJEmSJEmS5GcP8w8AAfkB3tEAAAAASUVORK5CYII=',
      )
    }
    return image
  }
}
