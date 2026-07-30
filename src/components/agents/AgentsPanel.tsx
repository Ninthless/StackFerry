import { Bot } from "lucide-react";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";

interface AgentsPanelProps {
  onOpenChange: (open: boolean) => void;
}

export function AgentsPanel({}: AgentsPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
      <WorkbenchEmptyState
        icon={<Bot className="h-5 w-5" />}
        title="Agents"
        description="Agent management is not available in this build."
      />
    </div>
  );
}
