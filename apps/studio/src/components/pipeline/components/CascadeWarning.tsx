import { Trans, useLingui } from "@lingui/react/macro"
import { LandingPageWarning } from "./LandingPageWarning"
import {
  STAGE_LABEL_MESSAGES,
  getStageLabelI18n,
} from "../pipeline-i18n"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { ReadingOrderResetWarning } from "./ReadingOrderResetWarning"

/**
 * Cascade warning shown on a stage's landing page when re-running the stage
 * would reset downstream stages with existing output. Lists only the stages
 * that actually have output to lose, formatted per locale via Intl.ListFormat.
 */
export function CascadeWarning({
  stageSlug,
  bookLabel,
}: {
  stageSlug: string
  /**
   * Optional so the shared `PrereqGuard` can keep using this without a label.
   * When given, the warning also says what the re-run does to the page order.
   */
  bookLabel?: string
}) {
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
      title={<Trans>Re-running clears later stages</Trans>}
      description={
        <>
          <Trans>
            {formatted} will be reset and need to run again before final outputs
            are available.
          </Trans>
          {bookLabel && (
            <ReadingOrderResetWarning bookLabel={bookLabel} stageSlug={stageSlug} />
          )}
        </>
      }
    />
  )
}
