import { describe, expect, it } from 'vitest'
import {
  encodeProviderImportData,
  encodeProviderImportUrl,
  findProviderImportUrl,
  parseProviderImportUrl,
} from '../shared/provider-import'
import { overlayBaseUrl, overlayWireApi } from '../shared/provider-overlay'
import { expectAppError } from './expect-app-error'

const sample = {
  name: 'Acme API',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-example-key',
  targets: ['codex', 'claude', 'grok'],
  model: 'gpt-5.4',
  models: ['gpt-5.4', 'claude-sonnet-4'],
  wireApi: 'chat',
  claudeAuthScheme: 'x-api-key',
  grokApiBackend: 'chat_completions',
}

describe('provider import links', () => {
  it('round-trips a valid payload into custom drafts', () => {
    const url = encodeProviderImportUrl(sample)
    expect(url.startsWith('stackferry://import/providers?v=1&data=')).toBe(true)
    expect(new URL(url).searchParams.get('data')).toMatch(/^[A-Za-z0-9_-]+$/)
    const offer = parseProviderImportUrl(url)
    expect(offer.name).toBe('Acme API')
    expect(offer.baseUrl).toBe('https://api.example.com/v1')
    expect(offer.apiKey).toBe('sk-example-key')
    expect(offer.maskedKey).toBe('••••-key')
    expect(offer.targets).toEqual(['codex', 'claude', 'grok'])
    expect(offer.drafts.codex?.kind).toBe('custom')
    expect(offer.drafts.codex?.presetId).toBe('custom')
    expect(overlayBaseUrl(offer.drafts.codex?.tomlText ?? '')).toBe(sample.baseUrl)
    expect(overlayWireApi(offer.drafts.codex?.tomlText ?? '')).toBe('chat')
    expect(offer.drafts.codex?.models).toEqual(['gpt-5.4', 'claude-sonnet-4'])
    expect(offer.drafts.claude).toMatchObject({
      kind: 'custom',
      baseUrl: sample.baseUrl,
      model: 'gpt-5.4',
      authScheme: 'x-api-key',
      apiKey: sample.apiKey,
    })
    expect(offer.drafts.grok).toMatchObject({
      kind: 'custom',
      apiBackend: 'chat_completions',
      model: 'gpt-5.4',
    })
  })

  it('defaults optional fields and only builds requested targets', () => {
    const offer = parseProviderImportUrl(
      encodeProviderImportUrl({
        name: 'Only Codex',
        baseUrl: 'http://127.0.0.1:8080/v1',
        apiKey: 'k',
        targets: ['codex', 'codex'],
      }),
    )
    expect(offer.targets).toEqual(['codex'])
    expect(offer.drafts.codex).toBeDefined()
    expect(offer.drafts.claude).toBeUndefined()
    expect(offer.drafts.grok).toBeUndefined()
    expect(overlayWireApi(offer.drafts.codex?.tomlText ?? '')).toBe('responses')
    expect(offer.maskedKey).toBe('••••')
  })

  it('accepts standard base64 data and finds the URL in argv', () => {
    const payload = {
      name: 'Std',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
      targets: ['claude'],
    }
    const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    const url = `stackferry://import/providers?v=1&data=${data}`
    expect(parseProviderImportUrl(url).name).toBe('Std')
    expect(findProviderImportUrl(['--foo', url, 'bar'])).toBe(url)
    expect(findProviderImportUrl(['--foo'])).toBeNull()
  })

  it('rejects invalid links and payloads', () => {
    expectAppError(() => parseProviderImportUrl('https://example.com'), 'import_url')
    expectAppError(() => parseProviderImportUrl('stackferry://other/path?data=x'), 'import_url')
    expectAppError(
      () => parseProviderImportUrl('stackferry://import/providers?v=2&data=e30'),
      'import_version',
    )
    expectAppError(() => parseProviderImportUrl('stackferry://import/providers'), 'import_payload')
    expectAppError(() => parseProviderImportUrl(encodeProviderImportUrl({ name: 'x' })), 'import_invalid')
    expectAppError(
      () =>
        parseProviderImportUrl(
          encodeProviderImportUrl({
            name: 'x',
            baseUrl: 'https://api.example.com',
            apiKey: 'k',
            targets: [],
          }),
        ),
      'import_targets',
    )
    expectAppError(
      () =>
        parseProviderImportUrl(
          encodeProviderImportUrl({
            name: 'x',
            baseUrl: 'file:///tmp',
            apiKey: 'k',
            targets: ['codex'],
          }),
        ),
      'models_unsupported_protocol',
    )
    expectAppError(() => parseProviderImportDataCorrupt(), 'import_payload')
  })
})

function parseProviderImportDataCorrupt(): void {
  parseProviderImportUrl(`stackferry://import/providers?v=1&data=${encodeProviderImportData('nope')}`)
}
