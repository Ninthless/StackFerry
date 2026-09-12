import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppearanceStore } from '../electron/main/appearance-store'

describe('appearance store', () => {
  it('defaults mica off and theme dark', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-appearance-'))
    const store = new AppearanceStore(path.join(dir, 'appearance.json'))
    expect(await store.getMicaPreference()).toBe(false)
    expect(await store.getThemePreference()).toBe('dark')
    expect(await store.getOnboardingCompleted()).toBe(false)
  })

  it('keeps the other field when mica or theme changes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-appearance-'))
    const store = new AppearanceStore(path.join(dir, 'appearance.json'))
    await store.setThemePreference('light')
    await store.setMicaPreference(true)
    expect(await store.getThemePreference()).toBe('light')
    expect(await store.getMicaPreference()).toBe(true)
    await store.setThemePreference('system')
    expect(await store.getMicaPreference()).toBe(true)
    expect(await store.getOnboardingCompleted()).toBe(false)
  })

  it('treats an existing file without the onboarding field as already completed', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-appearance-'))
    const file = path.join(dir, 'appearance.json')
    await writeFile(file, '{"mica":true,"theme":"light"}\n')
    const store = new AppearanceStore(file)
    expect(await store.getOnboardingCompleted()).toBe(true)
    expect(await store.getMicaPreference()).toBe(true)
    expect(await store.getThemePreference()).toBe('light')
  })

  it('keeps mica and theme when onboarding completion changes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-appearance-'))
    const store = new AppearanceStore(path.join(dir, 'appearance.json'))
    await store.setMicaPreference(true)
    await store.setThemePreference('light')
    expect(await store.setOnboardingCompleted(true)).toBe(true)
    expect(await store.getOnboardingCompleted()).toBe(true)
    expect(await store.getMicaPreference()).toBe(true)
    expect(await store.getThemePreference()).toBe('light')
  })

  it('shows the tour again when onboardingCompleted is false', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-appearance-'))
    const file = path.join(dir, 'appearance.json')
    await writeFile(file, '{"mica":false,"theme":"dark","onboardingCompleted":false}\n')
    const store = new AppearanceStore(file)
    expect(await store.getOnboardingCompleted()).toBe(false)
  })

  it('keeps mica and falls back when theme is invalid', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-appearance-'))
    const file = path.join(dir, 'appearance.json')
    await writeFile(file, '{"mica":true,"theme":"auto"}\n')
    const store = new AppearanceStore(file)
    expect(await store.getMicaPreference()).toBe(true)
    expect(await store.getThemePreference()).toBe('dark')
  })
})
