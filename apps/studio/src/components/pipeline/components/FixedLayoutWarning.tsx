import { Trans } from "@lingui/react/macro"
import { LandingPageWarning } from "./LandingPageWarning"

/**
 * Shared copy for stages whose feature does not support the fixed-layout
 * rendering mode. Kept in one place so the inline banner and the pre-run
 * confirmation modal stay in sync (and translate once).
 */
export function FixedLayoutWarningTitle() {
  return <Trans>Not compatible with Fixed Layout</Trans>
}

export function FixedLayoutWarningDescription() {
  return (
    <Trans>
      This feature is not compatible with Fixed Layout. If you proceed, you may
      get undesirable results.
    </Trans>
  )
}

/**
 * Inline warning banner shown on a stage landing page when the book renders in
 * fixed-layout mode. Renders nothing unless `show` is true.
 */
export function FixedLayoutWarningBanner({ show }: { show: boolean }) {
  return (
    <LandingPageWarning
      show={show}
      variant="prereq"
      title={<FixedLayoutWarningTitle />}
      description={<FixedLayoutWarningDescription />}
    />
  )
}
