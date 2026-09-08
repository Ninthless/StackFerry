import { existsSync } from 'node:fs'
import { grokManagedConfigPaths } from './home'

export function grokManagedPolicyPresent(grokHome: string, exists = existsSync): boolean {
  return grokManagedConfigPaths(grokHome).some((filePath) => exists(filePath))
}
