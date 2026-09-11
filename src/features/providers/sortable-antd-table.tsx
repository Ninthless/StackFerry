import { createContext, useContext, useMemo, type CSSProperties, type HTMLAttributes } from "react"
import type { DragEndEvent } from "@dnd-kit/core"
import { DndContext } from "@dnd-kit/core"
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Table } from "antd"
import type { TableColumnsType } from "antd"
import { GripVertical, Pin } from "lucide-react"
import { Button } from "@/components/ui/button"
import * as m from "@/paraglide/messages.js"

type SortableRecord = {
  id: string
  kind?: string
}

type RowContextValue = {
  setActivatorNodeRef?: (element: HTMLElement | null) => void
  listeners?: SyntheticListenerMap
}

const RowContext = createContext<RowContextValue>({})
const LockedIdsContext = createContext<ReadonlySet<string>>(new Set())

export function reorderUnlockedRows<T extends SortableRecord>(
  records: T[],
  activeId: string | number,
  overId: string | number,
): T[] | null {
  if (activeId === overId) return null
  const lockedIds = lockedRecordIds(records)
  if (lockedIds.has(String(activeId)) || lockedIds.has(String(overId))) return null
  const activeIndex = records.findIndex((record) => record.id === activeId)
  const overIndex = records.findIndex((record) => record.id === overId)
  if (activeIndex < 0 || overIndex < 0) return null
  const locked = records.flatMap((record, index) => (record.kind === "official" ? [{ record, index }] : []))
  const unlocked = arrayMove(records, activeIndex, overIndex).filter((record) => record.kind !== "official")
  const next = [...unlocked]
  for (const item of locked) next.splice(item.index, 0, item.record)
  return next
}

function lockedRecordIds(records: SortableRecord[]): Set<string> {
  return new Set(records.filter((record) => record.kind === "official").map((record) => record.id))
}

function DragHandle() {
  const { setActivatorNodeRef, listeners } = useContext(RowContext)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="cursor-grab text-muted-foreground"
      aria-label={m.routing_queue_drag()}
      ref={setActivatorNodeRef}
      {...listeners}
    >
      <GripVertical />
    </Button>
  )
}

function LockedHandle() {
  return (
    <Button type="button" variant="ghost" size="icon-sm" disabled tabIndex={-1} aria-hidden>
      <Pin />
    </Button>
  )
}

type RowProps = HTMLAttributes<HTMLTableRowElement> & {
  "data-row-key": string
}

function Row(props: RowProps) {
  const lockedIds = useContext(LockedIdsContext)
  const disabled = lockedIds.has(props["data-row-key"])
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props["data-row-key"], disabled })

  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  }

  const contextValue = useMemo(
    () => (disabled ? {} : { setActivatorNodeRef, listeners }),
    [disabled, listeners, setActivatorNodeRef],
  )

  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...(disabled ? undefined : attributes)} />
    </RowContext.Provider>
  )
}

type Props<T extends SortableRecord> = {
  dataSource: T[]
  columns: TableColumnsType<T>
  onReorder: (next: T[]) => void
}

export function SortableAntdTable<T extends SortableRecord>({
  dataSource,
  columns,
  onReorder,
}: Props<T>) {
  const lockedIds = useMemo(() => lockedRecordIds(dataSource), [dataSource])
  const tableColumns = useMemo<TableColumnsType<T>>(
    () => [
      {
        key: "sort",
        align: "center",
        width: 48,
        render: (_value, record) => (record.kind === "official" ? <LockedHandle /> : <DragHandle />),
      },
      ...columns,
    ],
    [columns],
  )

  function onDragEnd({ active, over }: DragEndEvent): void {
    if (!over) return
    const next = reorderUnlockedRows(dataSource, active.id, over.id)
    if (next) onReorder(next)
  }

  return (
    <LockedIdsContext.Provider value={lockedIds}>
      <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={dataSource.map((record) => record.id)} strategy={verticalListSortingStrategy}>
          <Table<T>
            rowKey="id"
            pagination={false}
            showHeader={false}
            columns={tableColumns}
            dataSource={dataSource}
            components={{ body: { row: Row } }}
            className="bg-background [&_.ant-table]:bg-background! [&_.ant-table-container]:overflow-visible! [&_.ant-table-content]:overflow-visible! [&_.ant-table-body]:overflow-visible! [&_.ant-table-tbody>tr>td]:border-border [&_.ant-table-tbody>tr:first-child>td]:border-t [&_.ant-table-tbody>tr:hover>td]:bg-background! [&_.ant-table-tbody>tr.ant-table-row-selected>td]:bg-background! [&_.ant-table-tbody>tr:active>td]:bg-background!"
          />
        </SortableContext>
      </DndContext>
    </LockedIdsContext.Provider>
  )
}
