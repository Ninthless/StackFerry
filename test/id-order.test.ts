import { describe, expect, it } from 'vitest'
import { orderByIds } from '../shared/id-order'

describe('orderByIds', () => {
  it('reorders by a complete unique id list', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(orderByIds(items, ['c', 'a', 'b'])).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
    expect(orderByIds(items, ['a', 'b', 'c'])).toEqual(items)
    expect(orderByIds([], [])).toEqual([])
  })

  it('rejects missing, extra, or duplicate ids', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(orderByIds(items, ['c', 'a'])).toBeNull()
    expect(orderByIds(items, ['c', 'a', 'b', 'd'])).toBeNull()
    expect(orderByIds(items, ['a', 'a', 'b'])).toBeNull()
    expect(orderByIds(items, ['a', 'b', 'd'])).toBeNull()
    expect(orderByIds(items, 'a' as unknown as string[])).toBeNull()
  })
})
