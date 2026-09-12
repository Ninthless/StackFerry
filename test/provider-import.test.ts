import { describe, expect, it } from 'vitest'
import {
  encodeProviderImportData,
  encodeProviderImportUrl,
  findProviderImportUrl,
  NEW_API_CHAT_LINK,
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

  it('parses NewAPI {address}/{key} query templates', () => {
    const url = NEW_API_CHAT_LINK.split('{address}')
      .join(encodeURIComponent('https://api.example.com'))
      .split('{key}')
      .join('sk-example-key')
    const offer = parseProviderImportUrl(url)
    expect(offer.name).toBe('New API')
    expect(offer.baseUrl).toBe('https://api.example.com')
    expect(offer.apiKey).toBe('sk-example-key')
    expect(offer.targets).toEqual(['codex', 'claude', 'grok'])
    expect(offer.drafts.codex?.kind).toBe('custom')
    expect(offer.drafts.claude?.kind).toBe('custom')
    expect(offer.drafts.grok?.kind).toBe('custom')
  })

  it('defaults query name and targets, and lets data win over query fields', () => {
    const unnamed = parseProviderImportUrl(
      'stackferry://import/providers?baseUrl=https://gw.example.com/v1&apiKey=secret',
    )
    expect(unnamed.name).toBe('gw.example.com')
    expect(unnamed.targets).toEqual(['codex', 'claude', 'grok'])
    const trimmed = parseProviderImportUrl(
      'stackferry://import/providers?baseUrl=https://gw.example.com&apiKey=secret&targets=codex,%20claude&wireApi=chat',
    )
    expect(trimmed.targets).toEqual(['codex', 'claude'])
    expect(overlayWireApi(trimmed.drafts.codex?.tomlText ?? '')).toBe('chat')
    expect(trimmed.drafts.grok).toBeUndefined()
    const mixed = parseProviderImportUrl(
      `${encodeProviderImportUrl({
        name: 'From Data',
        baseUrl: 'https://data.example.com',
        apiKey: 'from-data',
        targets: ['codex'],
      })}&baseUrl=https://query.example.com&apiKey=from-query&targets=grok`,
    )
    expect(mixed.name).toBe('From Data')
    expect(mixed.baseUrl).toBe('https://data.example.com')
    expect(mixed.targets).toEqual(['codex'])
  })

  it('rejects incomplete or unexpanded query links', () => {
    expectAppError(
      () => parseProviderImportUrl('stackferry://import/providers?baseUrl=https://api.example.com'),
      'api_key_required',
    )
    expectAppError(
      () => parseProviderImportUrl('stackferry://import/providers?apiKey=secret'),
      'import_invalid',
    )
    expectAppError(
      () =>
        parseProviderImportUrl(
          'stackferry://import/providers?baseUrl={address}&apiKey=secret&targets=codex',
        ),
      'import_invalid',
    )
    expectAppError(
      () =>
        parseProviderImportUrl(
          'stackferry://import/providers?baseUrl=https://api.example.com&apiKey=secret&targets=gemini',
        ),
      'import_targets',
    )
  })
})

function parseProviderImportDataCorrupt(): void {
  parseProviderImportUrl(`stackferry://import/providers?v=1&data=${encodeProviderImportData('nope')}`)
}
