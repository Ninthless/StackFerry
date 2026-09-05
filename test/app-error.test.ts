import { describe, expect, it } from 'vitest'
import {
  AppError,
  appErrorFromUnknown,
  decodeAppErrorMessage,
  encodeAppErrorMessage,
} from '../shared/app-error'

describe('app error', () => {
  it('round-trips code and params through the encoded message', () => {
    const error = new AppError('overlay_unsupported_top_level', { key: 'approval_policy' })
    expect(error.message).toBe(
      encodeAppErrorMessage('overlay_unsupported_top_level', { key: 'approval_policy' }),
    )
    expect(decodeAppErrorMessage(error.message)).toEqual({
      code: 'overlay_unsupported_top_level',
      params: { key: 'approval_policy' },
    })
    expect(appErrorFromUnknown(new Error(error.message))?.code).toBe(
      'overlay_unsupported_top_level',
    )
    expect(
      appErrorFromUnknown(
        new Error(`Error invoking remote method 'providers:add': ${error.message}`),
      )?.params,
    ).toEqual({ key: 'approval_policy' })
  })

  it('ignores ordinary error messages', () => {
    expect(decodeAppErrorMessage('TOML 无法解析')).toBeNull()
    expect(appErrorFromUnknown(new Error('useTheme must be used within a ThemeProvider'))).toBeNull()
  })
})
