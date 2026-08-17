import { useEffect, useState } from "react";
import { KeyRound, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { settingsApi, type AppId } from "@/lib/api";
import { providersApi, type AgentInstance } from "@/lib/api/providers";
import type { Provider } from "@/types";
import { extractErrorMessage } from "@/utils/errorUtils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface AgentInstancesDialogProps {
  open: boolean;
  appId: AppId;
  provider: Provider | null;
  onOpenChange: (open: boolean) => void;
}

export function AgentInstancesDialog({
  open,
  appId,
  provider,
  onOpenChange,
}: AgentInstancesDialogProps) {
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!provider) return;
    setInstances(await providersApi.getAgentInstances(provider.id, appId));
  };

  useEffect(() => {
    if (!open || !provider) return;
    void load().catch((error) => toast.error(extractErrorMessage(error)));
  }, [open, provider?.id, appId]);

  const create = async () => {
    if (!provider || !name.trim() || !apiKey.trim()) return;
    setBusy(true);
    try {
      await providersApi.createAgentInstance({
        providerId: provider.id,
        appType: appId,
        name: name.trim(),
        apiKey: apiKey.trim(),
      });
      setName("");
      setApiKey("");
      await load();
      toast.success("实例已创建，API Key 已存入系统凭据库");
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await providersApi.deleteAgentInstance(id);
      await load();
      toast.success("实例已删除");
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const launch = async (instanceId: string) => {
    if (!provider) return;
    setBusy(true);
    try {
      const cwd = await settingsApi.pickDirectory();
      if (!cwd) return;
      await providersApi.openTerminal(provider.id, appId, { cwd, instanceId });
      toast.success("隔离实例终端已打开");
      onOpenChange(false);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>隔离实例</DialogTitle>
          <DialogDescription>
            每个实例使用独立 API Key；Codex 同时隔离配置、会话、历史和日志。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="实例名称"
            />
            <Input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="API Key"
              type="password"
              autoComplete="new-password"
            />
            <Button
              onClick={create}
              disabled={busy || !name.trim() || !apiKey.trim()}
            >
              <Plus className="mr-1 h-4 w-4" />
              创建
            </Button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {instances.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                暂无隔离实例
              </div>
            ) : (
              instances.map((instance) => (
                <div
                  key={instance.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{instance.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {instance.id}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => launch(instance.id)}
                    disabled={busy}
                  >
                    <Play className="mr-1 h-4 w-4" />
                    启动
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(instance.id)}
                    disabled={busy}
                    aria-label="删除实例"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
