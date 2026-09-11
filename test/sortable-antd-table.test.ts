import { describe, expect, it } from 'vitest'
import { reorderUnlockedRows } from '../src/features/providers/sortable-antd-table'

const rows = [
  { id: 'official', kind: 'official' },
  { id: 'a', kind: 'custom' },
  { id: 'b', kind: 'custom' },
]

describe('reorderUnlockedRows', () => {
  it('ignores drags that start on or land on official login', () => {
    expect(reorderUnlockedRows(rows, 'official', 'a')).toBeNull()
    expect(reorderUnlockedRows(rows, 'a', 'official')).toBeNull()
    expect(reorderUnlockedRows(rows, 'a', 'a')).toBeNull()
  })

  it('reorders custom rows without moving official login', () => {
    expect(reorderUnlockedRows(rows, 'a', 'b')?.map((row) => row.id)).toEqual(['official', 'b', 'a'])
    expect(
      reorderUnlockedRows(
        [
          { id: 'a', kind: 'custom' },
          { id: 'official', kind: 'official' },
          { id: 'b', kind: 'custom' },
        ],
        'a',
        'b',
      )?.map((row) => row.id),
    ).toEqual(['b', 'official', 'a'])
  })
})
