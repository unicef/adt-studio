import { Trans, useLingui } from "@lingui/react/macro"
import { LandingPageWarning } from "./LandingPageWarning"
import {
  STAGE_LABEL_MESSAGES,
  getStageLabelI18n,
} from "../pipeline-i18n"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"

/**
 * Cascade warning shown on a stage's landing page when re-running the stage
 * would reset downstream stages with existing output. Lists only the stages
 * that actually have output to lose, formatted per locale via Intl.ListFormat.
 */
export function CascadeWarning({ stageSlug }: { stageSlug: string }) {
  const { i18n } = useLingui()
  const affected = useDownstreamWithOutput(stageSlug)
  if (affected.length === 0) return null

  const names = affected
    .filter((slug) => slug in STAGE_LABEL_MESSAGES)
    .map((slug) => getStageLabelI18n(slug))

  if (names.length === 0) return null

  let formatted: string
  try {
    const lf = new Intl.ListFormat(i18n.locale, {
      style: "long",
      type: "conjunction",
    })
    formatted = lf.format(names)
  } catch {
    formatted = names.join(", ")
  }

  return (
    <LandingPageWarning
      show
      variant="cascade"
      title={<Trans>Other stages may need attention</Trans>}
      description={
        <Trans>
          Review {formatted} after this run.
        </Trans>
      }
    />
  )
}
