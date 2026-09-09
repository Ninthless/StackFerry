import { describe, expect, it } from 'vitest'
import { buildTrayMenuTemplate } from '../electron/main/tray-menu'

const labels = {
  open: 'Open StackFerry',
  empty: 'No providers',
  quit: 'Quit',
  clis: {
    codex: 'Codex',
    'claude-code': 'Claude',
    'grok-build': 'Grok',
  },
}

describe('buildTrayMenuTemplate', () => {
  it('groups each CLI into a radio submenu', () => {
    const template = buildTrayMenuTemplate(
      {
        codex: [
          { id: 'codex-official', name: 'Codex Official', enabled: true },
          { id: 'codex-custom', name: 'Gateway', enabled: false },
        ],
        'claude-code': [{ id: 'claude-official', name: 'Claude Official', enabled: true }],
        'grok-build': [],
      },
      labels,
    )

    expect(template[0]).toMatchObject({ type: 'normal', label: 'Open StackFerry', click: { kind: 'show' } })
    expect(template.at(-1)).toMatchObject({ type: 'normal', label: 'Quit', click: { kind: 'quit' } })

    const [codex, claude, grok] = template.filter((node) => node.type === 'submenu')
    expect(codex.label).toBe('Codex')
    expect(codex.submenu).toEqual([
      {
        type: 'radio',
        label: 'Codex Official',
        checked: true,
        click: { kind: 'enable', cliId: 'codex', providerId: 'codex-official' },
      },
      {
        type: 'radio',
        label: 'Gateway',
        checked: false,
        click: { kind: 'enable', cliId: 'codex', providerId: 'codex-custom' },
      },
    ])
    expect(claude.label).toBe('Claude')
    expect(claude.submenu).toEqual([
      {
        type: 'radio',
        label: 'Claude Official',
        checked: true,
        click: { kind: 'enable', cliId: 'claude-code', providerId: 'claude-official' },
      },
    ])
    expect(grok).toEqual({
      type: 'submenu',
      label: 'Grok',
      submenu: [{ type: 'normal', label: 'No providers', enabled: false }],
    })
  })
})
