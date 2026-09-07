import { execFile } from 'node:child_process'

export type ManagedPolicyProbe = () => Promise<boolean>

export function queryWindowsRegKey(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('reg', ['query', key], { windowsHide: true }, (error) => {
      resolve(!error)
    })
  })
}

export function createWindowsClaudePolicyProbe(
  platform: NodeJS.Platform = process.platform,
  query: (key: string) => Promise<boolean> = queryWindowsRegKey,
): ManagedPolicyProbe {
  return async () => {
    if (platform !== 'win32') return false
    return query('HKLM\\SOFTWARE\\Policies\\Claude')
  }
}
