import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import { formatAppError } from '../shared/format-app-error'

describe('format app error', () => {
  it('calls the matching message function with params', () => {
    const error = new AppError('overlay_unsupported_top_level', { key: 'approval_policy' })
    expect(
      formatAppError(error, {
        error_overlay_unsupported_top_level: (params: { key: string }) => `key:${params.key}`,
      }),
    ).toBe('key:approval_policy')
  })

  it('falls back to the original message for unknown errors', () => {
    expect(formatAppError(new Error('useTheme must be used within a ThemeProvider'), {})).toBe(
      'useTheme must be used within a ThemeProvider',
    )
  })
})
