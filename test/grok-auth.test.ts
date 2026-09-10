import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeGrokApiKeyAuth, restoreGrokAuth, writeStackferryApiKey } from '../electron/main/grok/auth'
import { grokAuthPath, grokAuthRestorePath } from '../electron/main/grok/home'

describe('grok auth.json', () => {
  it('encodes the xai::api_key scope Grok Build reads for Imagine', () => {
    const created = new Date('2026-09-10T01:00:00.000Z')
    expect(encodeGrokApiKeyAuth('secret', created)).toEqual({
      'xai::api_key': {
        key: 'secret',
        auth_mode: 'api_key',
        create_time: '2026-09-10T01:00:00.000Z',
        user_id: '',
        email: null,
        coding_data_retention_opt_out: false,
      },
    })
  })

  it('stashes a session auth.json once, then restores it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-auth-unit-'))
    const original = {
      'https://auth.x.ai::client': {
        key: 'oidc-token',
        auth_mode: 'oidc',
        create_time: '2026-01-01T00:00:00.000Z',
        user_id: 'u1',
      },
    }
    await writeFile(grokAuthPath(dir), `${JSON.stringify(original)}\n`)
    await writeStackferryApiKey(dir, 'first')
    await writeStackferryApiKey(dir, 'second')
    expect(JSON.parse(await readFile(grokAuthRestorePath(dir), 'utf8'))).toEqual(original)
    expect(JSON.parse(await readFile(grokAuthPath(dir), 'utf8'))['xai::api_key'].key).toBe('second')

    await restoreGrokAuth(dir)
    expect(JSON.parse(await readFile(grokAuthPath(dir), 'utf8'))).toEqual(original)
    expect(existsSync(grokAuthRestorePath(dir))).toBe(false)
  })

  it('does not treat a StackFerry api-key file as the original session', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-auth-self-'))
    await writeStackferryApiKey(dir, 'secret')
    expect(existsSync(grokAuthRestorePath(dir))).toBe(false)
    await restoreGrokAuth(dir)
    expect(existsSync(grokAuthPath(dir))).toBe(false)
  })
})
