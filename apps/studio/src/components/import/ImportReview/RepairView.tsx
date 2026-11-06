import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import type { AdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RepairGuide } from "./RepairGuide"
import { RepairRequest } from "./RepairRequest"
import { IssueList, Panel, StatusRow } from "./ReviewParts"
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
        <IssueList issues={issues} />
      </Panel>
      <div className="grid min-h-0 min-w-0 [&>*]:col-start-1 [&>*]:row-start-1">
        <Panel className={cn(SWAP, guideOpen ? "pointer-events-none -translate-x-2.5 opacity-0" : "opacity-100")}>
          <RepairRequest
            inert={guideOpen}
            text={shown.text}
            copyValue={request}
            className="flex-1"
            actions={(
              <>
                <Button type="button" variant="outline" size="sm" onClick={openGuide} className="h-9 text-sm">
                  <BookOpen className="size-3.5" />
                  <Trans>AI repair guide</Trans>
                </Button>
                {shown.withGuide ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    <Trans>The copy also includes the current guide, because this archive’s guide is missing or outdated.</Trans>
                  </span>
                ) : null}
              </>
            )}
          />
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
