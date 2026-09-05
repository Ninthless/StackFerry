import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { isThemePreference, type ThemePreference } from '../../shared/theme'
import { atomicWriteFile } from './codex/writer'

type AppearanceFile = {
  mica: boolean
  theme: ThemePreference
}

const DEFAULT_APPEARANCE: AppearanceFile = {
  mica: false,
  theme: 'dark',
}

export class AppearanceStore {
  constructor(private readonly filePath: string) {}

  async getMicaPreference(): Promise<boolean> {
    return (await this.read()).mica
  }

  async setMicaPreference(mica: boolean): Promise<boolean> {
    const current = await this.read()
    await this.write({ ...current, mica })
    return mica
  }

  async getThemePreference(): Promise<ThemePreference> {
    return (await this.read()).theme
  }

  async setThemePreference(theme: ThemePreference): Promise<ThemePreference> {
    const current = await this.read()
    await this.write({ ...current, theme })
    return theme
  }

  private async read(): Promise<AppearanceFile> {
    if (!existsSync(this.filePath)) return DEFAULT_APPEARANCE
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AppearanceFile>
      return {
        mica: parsed.mica === true,
        theme: isThemePreference(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE.theme,
      }
    } catch {
      return DEFAULT_APPEARANCE
    }
  }

  private async write(file: AppearanceFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }
}
