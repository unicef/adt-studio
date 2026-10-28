import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import type { StageName } from "@adt/types"
import { useStageStatus } from "@/hooks/use-stage-status"
import { getStageLabelI18n } from "../pipeline-i18n"
import { CascadeWarning } from "./CascadeWarning"
import { LandingPageWarning } from "./LandingPageWarning"

/**
 * Pairs the standard prereq warning and the cascade warning for a stage.
 * Shows "Run {upstream} first" until the upstream completes, then surfaces
 * the cascade warning if downstream stages have committed output.
 */
export function PrereqGuard({
  upstreamSlug,
  stageSlug,
  description,
}: {
  upstreamSlug: StageName
  stageSlug: StageName
  description: ReactNode
}) {
  const upstreamStatus = useStageStatus(upstreamSlug)
  const upstreamReady = upstreamStatus.isCompleted
  const upstreamLabel = getStageLabelI18n(upstreamSlug)

  return (
    <>
      <LandingPageWarning
        stageSlug={stageSlug}
        show={!upstreamReady}
        variant="prereq"
        title={<Trans>Run {upstreamLabel} first</Trans>}
        description={description}
      />
      {upstreamReady && <CascadeWarning stageSlug={stageSlug} />}
    </>
  )
}
