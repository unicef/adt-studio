import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Puzzle } from "lucide-react"
import type { AdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CopyTextButton } from "./CopyTextButton"
import { RepairGuide } from "./RepairGuide"
import { Panel, StatusRow } from "./ReviewParts"
import type { Issue, Status } from "./use-review-model"

const SWAP = "transition-[opacity,translate] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:translate-x-0 motion-reduce:transition-opacity"

/** Where the repair request appends the full guide for an archive whose own
 * guide is missing or outdated. The panel shows the request up to here: the
 * guide has its own view, and copying still includes it. */
const GUIDE_APPENDIX = "\n\n<current_adt_agent_guide>"

/**
 * The repair layout: the problems on the left, the repair request itself on
 * the right, readable before it is copied. Opening the guide widens the right
 * column to two thirds while the request fades out and the guide fades in, so
 * the problems stay readable beside the rules.
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
  const request = preview.agentGuide.repairPrompt
  const shown = useMemo(() => {
    const at = request.indexOf(GUIDE_APPENDIX)
    return at === -1 ? { text: request, withGuide: false } : { text: request.slice(0, at), withGuide: true }
  }, [request])
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideMounted, setGuideMounted] = useState(false)
  const openGuide = () => {
    setGuideMounted(true)
    setGuideOpen(true)
  }

  return (
    <div
      className={cn(
        "grid min-h-[320px] flex-1 gap-4 transition-[grid-template-columns] duration-[360ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none lg:grid-cols-[1fr_1.3fr]",
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
        <Panel className={cn(SWAP, guideOpen ? "pointer-events-none -translate-x-2.5 opacity-0" : "opacity-100")}>
          <div inert={guideOpen} className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <Puzzle aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground"><Trans>Repair request</Trans></h3>
                <p className="text-xs text-muted-foreground">
                  <Trans>Give it to your AI assistant together with the unzipped archive.</Trans>
                </p>
              </div>
            </div>
            <pre
              aria-label={t`Repair request`}
              tabIndex={0}
              className="min-h-[120px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/50 px-3.5 py-3 font-sans text-[12.5px] leading-relaxed text-foreground"
            >
              {shown.text}
            </pre>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <CopyTextButton value={request} primary>
                <Trans>Copy repair request</Trans>
              </CopyTextButton>
              <Button type="button" variant="outline" size="sm" onClick={openGuide} className="h-9 text-sm">
                <BookOpen className="size-3.5" />
                <Trans>AI repair guide</Trans>
              </Button>
              {shown.withGuide ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  <Trans>The copy also includes the current guide, because this archive’s guide is missing or outdated.</Trans>
                </span>
              ) : null}
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
