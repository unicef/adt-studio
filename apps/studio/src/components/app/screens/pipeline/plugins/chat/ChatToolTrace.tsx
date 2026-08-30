import { useLingui } from "@lingui/react/macro"
import { AgentActivity } from "@/components/agents/agent-activity"
import type { AgentActivityItem } from "@/components/agents/agent-activity/types"
import type { ToolPart } from "./message-parts"

export interface ChatToolTraceProps {
  parts: ToolPart[]
}

function describeInput(input: unknown): string {
  if (!input || typeof input !== "object") return ""
  const { pageId, language, node, itemId, category, stage } = input as Record<
    string,
    unknown
  >
  for (const value of [pageId, language, node, itemId, category, stage]) {
    if (typeof value === "string" && value) return value
  }
  return ""
}

/**
 * Compact trace of the read tools the assistant used. Transparency is a core
 * principle here: the user should always be able to see what the assistant
 * looked at before it answered.
 */
export function ChatToolTrace({ parts }: ChatToolTraceProps) {
  const { t } = useLingui()
  if (parts.length === 0) return null

  const working = parts.some(
    (part) => part.state !== "output-available" && part.state !== "output-error",
  )

  const items: AgentActivityItem[] = parts.map((part) => ({
    id: part.toolCallId,
    type: "tool",
    action: "read",
    target: describeInput(part.input)
      ? `${part.toolName} · ${describeInput(part.input)}`
      : part.toolName,
  }))

  return (
    <AgentActivity
      items={items}
      status={working ? "working" : "complete"}
      activeLabel={t`Reading the book…`}
      summary={t`Read ${parts.length} source(s)`}
      collapseOnComplete
      maxHeight={140}
      className="w-full"
    />
  )
}
