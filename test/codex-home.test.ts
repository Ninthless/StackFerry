import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { resolveCodexHome } from '../electron/main/codex/home'

describe('resolveCodexHome', () => {
  it('uses CODEX_HOME when set', () => {
    expect(resolveCodexHome({ CODEX_HOME: 'D:\\tmp\\codex' }, () => 'C:\\Users\\demo')).toBe(
      'D:\\tmp\\codex',
    )
  })

  it('falls back to the user home .codex directory', () => {
    const home = os.platform() === 'win32' ? 'C:\\Users\\demo' : '/home/demo'
    expect(resolveCodexHome({}, () => home)).toBe(path.join(home, '.codex'))
  })
})
