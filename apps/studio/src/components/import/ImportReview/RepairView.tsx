import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import type { AdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CopyTextButton } from "./CopyTextButton"
import { RepairGuide } from "./RepairGuide"
import { Panel, StatusRow, StepList } from "./ReviewParts"
import type { Issue, Status } from "./use-review-model"

const SWAP = "transition-[opacity,translate] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:translate-x-0 motion-reduce:transition-opacity"

/**
 * The repair layout: the problems on the left, how to repair on the right.
 * Opening the guide widens the right column from a third to two thirds while
 * "How to repair" fades out and the guide fades in, so the problems stay
 * readable beside the rules.
 */
export function RepairView({
  preview,
  status,
  issues,
}: {
  preview: AdtBundleImportPreview
  status: Status
  issues: Issue[]
}) {
  const { t } = useLingui()
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideMounted, setGuideMounted] = useState(false)
  const openGuide = () => {
    setGuideMounted(true)
    setGuideOpen(true)
  }

  return (
    <div
      className={cn(
        "grid min-h-[320px] flex-1 gap-4 transition-[grid-template-columns] duration-[360ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none lg:grid-cols-[2fr_1fr]",
        guideOpen && "lg:grid-cols-[1fr_2fr]",
      )}
    >
      <Panel title={<Trans>To fix</Trans>}>
        <StatusRow status={status} />
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {issues.map((issue, index) => (
            <li key={`${issue.code}:${issue.file}:${index}`} className="px-3.5 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <code className="truncate font-mono text-xs font-semibold text-foreground">{issue.file}</code>
                <code className="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.code}</code>
              </div>
              <p className="mt-1 break-words text-[13px] text-foreground">{issue.text}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid min-h-0 min-w-0 [&>*]:col-start-1 [&>*]:row-start-1">
        <Panel
          title={<Trans>How to repair</Trans>}
          className={cn(SWAP, guideOpen ? "pointer-events-none -translate-x-2.5 opacity-0" : "opacity-100")}
        >
          <div inert={guideOpen} className="flex min-h-0 flex-1 flex-col gap-4">
            <StepList
              steps={[
                { title: t`Copy the repair request`, text: t`It lists the problems and the editing rules.` },
                { title: t`Let your AI assistant fix it`, text: t`Then zip the folder again.` },
                { title: t`Choose the repaired ZIP`, text: t`ADT Studio checks it again right away.` },
              ]}
            />
            <div className="mt-auto flex flex-col gap-2 [&>button]:w-full">
              <CopyTextButton value={preview.agentGuide.repairPrompt}><Trans>Copy repair request</Trans></CopyTextButton>
              <Button type="button" variant="outline" size="sm" onClick={openGuide} className="h-8 text-xs">
                <BookOpen className="size-3.5" />
                <Trans>AI repair guide</Trans>
              </Button>
            </div>
          </div>
        </Panel>
        {guideMounted ? (
          <RepairGuide
            guide={preview.agentGuide}
            onClose={() => setGuideOpen(false)}
            inert={!guideOpen}
            className={cn(SWAP, guideOpen ? "translate-x-0 opacity-100 delay-100" : "pointer-events-none translate-x-4 opacity-0")}
          />
        ) : null}
      </div>
    </div>
  )
}
