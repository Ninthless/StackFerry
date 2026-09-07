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
import { GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import * as m from "@/paraglide/messages.js"

type RowContextValue = {
  setActivatorNodeRef?: (element: HTMLElement | null) => void
  listeners?: SyntheticListenerMap
}

const RowContext = createContext<RowContextValue>({})

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

type RowProps = HTMLAttributes<HTMLTableRowElement> & {
  "data-row-key": string
}

function Row(props: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props["data-row-key"] })

  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  }

  const contextValue = useMemo(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners],
  )

  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  )
}

type Props<T extends { id: string }> = {
  dataSource: T[]
  columns: TableColumnsType<T>
  onReorder: (next: T[]) => void
}

export function SortableAntdTable<T extends { id: string }>({
  dataSource,
  columns,
  onReorder,
}: Props<T>) {
  const tableColumns = useMemo<TableColumnsType<T>>(
    () => [{ key: "sort", align: "center", width: 48, render: () => <DragHandle /> }, ...columns],
    [columns],
  )

  function onDragEnd({ active, over }: DragEndEvent): void {
    if (!over || active.id === over.id) return
    const activeIndex = dataSource.findIndex((record) => record.id === active.id)
    const overIndex = dataSource.findIndex((record) => record.id === over.id)
    if (activeIndex < 0 || overIndex < 0) return
    onReorder(arrayMove(dataSource, activeIndex, overIndex))
  }

  return (
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
  )
}
