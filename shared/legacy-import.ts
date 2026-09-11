export const LEGACY_DB_FILE_NAME = 'stackferry.db'
export const LEGACY_DIR_NAME = '.stackferry'

export type LegacyImportCandidate = {
  dbPath: string
  codex: number
  claude: number
  skipped: number
}

export type LegacyImportResult = {
  dbPath: string
  importedCodex: number
  importedClaude: number
  skipped: number
}
