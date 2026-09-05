import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { isLanguagePreference, localeFromOsTag, type AppLocale, type LanguagePreference } from '../../shared/locale'
import { atomicWriteFile } from './codex/writer'

type LocaleFile = {
  preference: LanguagePreference
}

export class LocaleStore {
  constructor(private readonly filePath: string) {}

  async getPreference(): Promise<LanguagePreference> {
    return (await this.read()).preference
  }

  async setPreference(preference: LanguagePreference): Promise<LanguagePreference> {
    await this.write({ preference })
    return preference
  }

  async resolveLocale(): Promise<AppLocale> {
    const preference = await this.getPreference()
    if (preference === 'system') return systemLocale()
    return preference
  }

  private async read(): Promise<LocaleFile> {
    if (!existsSync(this.filePath)) return { preference: 'system' }
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<LocaleFile>
      if (!isLanguagePreference(parsed.preference)) return { preference: 'system' }
      return { preference: parsed.preference }
    } catch {
      return { preference: 'system' }
    }
  }

  private async write(file: LocaleFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }
}

function systemLocale(): AppLocale {
  return localeFromOsTag(app.getLocale())
}
