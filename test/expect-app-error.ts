import { expect } from 'vitest'
import { AppError, type AppErrorCode, type AppErrorParams } from '../shared/app-error'

export function expectAppError(
  fn: () => unknown,
  code: AppErrorCode,
  params?: AppErrorParams,
): void {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(code)
    if (params) expect((error as AppError).params).toEqual(params)
    return
  }
  expect.fail(`expected AppError ${code}`)
}
