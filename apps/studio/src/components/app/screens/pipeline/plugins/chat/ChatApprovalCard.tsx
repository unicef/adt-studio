import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import {
  ToolApproval,
  type ToolApprovalParameter,
  type ToolApprovalStatus,
} from "@/components/agents/tool-approval"
import { FileDiff } from "@/components/agents/file-diff"
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer"
import { useChatToolPreview } from "@/hooks/use-chat"
import type { ChatToolPreviewBody } from "@/api/client"
import { ChatApprovalCode } from "./ChatApprovalCode"
import { diffLines } from "./diff-lines"

export interface ChatApprovalCardProps {
  label: string
  toolName: string
  toolCallId: string
  input: unknown
  inputReady: boolean
  status: ToolApprovalStatus
  onApprove: () => void
  onDeny: () => void
}

function PreviewBody({ preview }: { preview: ChatToolPreviewBody }) {
  const { t } = useLingui()
  const lines = useMemo(
    () =>
      preview.kind === "diff" && preview.after !== null
        ? diffLines(preview.before, preview.after)
        : [],
    [preview],
  )

  if (preview.kind === "diff") {
    if (preview.after === null) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-pretty text-[11.5px] leading-relaxed text-muted-foreground">
            <Trans>
              The AI editor will rewrite this section from the instruction below, then save
              the result as a new version. The current content is:
            </Trans>
          </p>
          {preview.note ? <ChatApprovalCode code={preview.note} /> : null}
          <ChatApprovalCode code={preview.before || t`(empty)`} />
        </div>
      )
    }
    return (
      <FileDiff
        file={preview.target}
        lines={lines}
        status="complete"
        language="text"
        defaultOpen
        collapseOnComplete={false}
        maxHeight={200}
      />
    )
  }

  if (preview.kind === "config") {
    return (
      <ul className="flex flex-col gap-1.5">
        {preview.changes.map((change) => (
          <li key={change.key} className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-muted-foreground">{change.key}</span>
            <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px]">
              <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 line-through dark:text-rose-400">
                {JSON.stringify(change.before)}
              </span>
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">
                {JSON.stringify(change.after)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (preview.kind === "stage-run") {
    return (
      <div className="flex flex-col gap-2 text-[11.5px] leading-relaxed">
        <p className="text-pretty">
          <Trans>
            Runs {preview.stagesInRange.length} stage(s): {preview.stagesInRange.join(" → ")}.
          </Trans>
        </p>
        {preview.clearsExtractedData ? (
          <p className="flex items-start gap-1.5 rounded-[8px] bg-rose-500/10 px-2 py-1.5 text-rose-700 dark:text-rose-400">
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span className="text-pretty">
              <Trans>
                Restarting from Extract deletes every extracted page and all downstream
                output. Manual edits to sections and translations are lost.
              </Trans>
            </span>
          </p>
        ) : null}
        {preview.clearedNodes.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Trans>Output that will be deleted</Trans>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {preview.clearedNodes.join(", ")}
            </span>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Trans>Stages reset to not-run</Trans>
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {preview.resetStages.join(", ")}
          </span>
        </div>
      </div>
    )
  }

  return <ChatApprovalCode code={JSON.stringify(preview.input, null, 2)} language="json" />
}

export function ChatApprovalCard({
  label,
  toolName,
  toolCallId,
  input,
  inputReady,
  status,
  onApprove,
  onDeny,
}: ChatApprovalCardProps) {
  const { t } = useLingui()
  const preview = useChatToolPreview(label, toolName, toolCallId, input, inputReady)

  const titles: Record<string, string> = {
    run_stages: t`Run pipeline stages?`,
    update_stage_config: t`Change the book settings?`,
    edit_storyboard_section: t`Replace this section's content?`,
    edit_translation: t`Replace this translation?`,
    rerun_with_instructions: t`Let the AI editor rewrite this section?`,
  }

  const inProgress = status === "approving" || status === "running"
  const running = preview.data?.runningSteps ?? []
  const parameters: ToolApprovalParameter[] = running.length
    ? [
        {
          id: "blocked",
          label: t`Blocked`,
          value: t`Pipeline running: ${running.join(", ")}`,
        },
      ]
    : []

  return (
    <ToolApproval
      tool={<span className="font-mono">{toolName}</span>}
      title={titles[toolName] ?? t`Allow this action?`}
      status={running.length > 0 && status === "pending" ? "error" : status}
      parameters={parameters}
      defaultOpen
      onApprove={running.length > 0 || !inputReady ? undefined : onApprove}
      onDeny={onDeny}
      description={
        !inputReady || preview.isPending ? (
          <ThinkingShimmer className="text-[11.5px]">
            <Trans>Checking what this would change…</Trans>
          </ThinkingShimmer>
        ) : preview.isError ? (
          <span className="text-[11.5px] text-amber-700 dark:text-amber-400">
            <Trans>Could not preview this change. Approve only if you are sure.</Trans>
          </span>
        ) : preview.data ? (
          <span className="flex flex-col gap-2">
            {inProgress ? (
              <ThinkingShimmer className="text-[11.5px]">
                <Trans>Running this now — the result appears when it finishes…</Trans>
              </ThinkingShimmer>
            ) : null}
            <PreviewBody preview={preview.data.preview} />
          </span>
        ) : null
      }
    />
  )
}
