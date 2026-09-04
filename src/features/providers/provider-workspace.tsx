import { Plus } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ItemGroup } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DeleteProviderDialog } from "./delete-provider-dialog"
import { ProviderCard } from "./provider-card"
import { ProviderEditor } from "./provider-editor"
import type { ProvidersSession } from "./use-providers"

type Props = {
  session: ProvidersSession
}

export function ProviderWorkspace({ session }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
        {session.providers.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia>
                <BrandMark className="size-12 rounded-xl" />
              </EmptyMedia>
              <EmptyTitle>还没有供应商</EmptyTitle>
              <EmptyDescription>
                用预设添加 OpenAI、OpenRouter、DeepSeek，或切回官方登录。也可以直接编辑 config.toml 覆盖片段。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={session.openCreate}>
                <Plus data-icon="inline-start" />
                添加第一个
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <ItemGroup className="min-w-0 pr-3">
              {session.providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  busy={session.busyId === provider.id}
                  onEnable={() => void session.enableProvider(provider.id)}
                  onEdit={() => session.openEdit(provider)}
                  onDelete={() => session.setDeleting(provider)}
                />
              ))}
            </ItemGroup>
          </ScrollArea>
        )}
      </main>

      <ProviderEditor
        open={session.editorOpen}
        presets={session.presets}
        editing={session.editing}
        onOpenChange={(open) => {
          if (!open) session.closeEditor()
        }}
        onSubmit={session.saveProvider}
      />
      <DeleteProviderDialog
        provider={session.deleting}
        onOpenChange={(open) => {
          if (!open) session.setDeleting(null)
        }}
        onConfirm={session.confirmDelete}
      />
    </div>
  )
}
