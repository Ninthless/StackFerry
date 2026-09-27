import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../shared/app-error'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { EgressProxyStore } from '../electron/main/egress/store'

describe('egress proxy store', () => {
  it('stores a remote proxy and keeps the password out of the view', async () => {
    const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'stackferry-egress-')), 'egress-proxy.json')
    const store = new EgressProxyStore(filePath)
    const view = await store.set({
      enabled: true,
      url: 'https://user:secret@proxy.example.com:8443',
      bypass: 'internal.example.com',
    })
    expect(view).toEqual({
      enabled: true,
      url: 'https://proxy.example.com:8443',
      username: 'user',
      hasPassword: true,
      bypass: 'internal.example.com',
    })
    expect(await store.route()).toEqual({
      proxyUri: 'https://user:secret@proxy.example.com:8443',
      bypass: 'internal.example.com',
    })
  })

  it('refuses to enable without a proxy url', async () => {
    const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), 'stackferry-egress-')), 'egress-proxy.json')
    const store = new EgressProxyStore(filePath)
    await expect(store.set({ enabled: true, url: '' })).rejects.toBeInstanceOf(AppError)
  })
})
