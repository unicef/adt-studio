import type { ReactNode } from "react"
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
 * Language-specific copy: on fixed-layout books, translating the original into
 * additional languages is unsupported — running translation with only the
 * original language is fine.
 */
export function FixedLayoutExtraLanguagesDescription() {
  return (
    <Trans>
      Adding languages beyond the original is not compatible with Fixed Layout.
      If you proceed, you may get undesirable results.
    </Trans>
  )
}

/**
 * Inline warning banner shown when the book renders in fixed-layout mode.
 * Defaults to the generic feature-incompatibility copy; pass `title` /
 * `description` to override. Renders nothing unless `show` is true.
 */
export function FixedLayoutWarningBanner({
  show,
  title = <FixedLayoutWarningTitle />,
  description = <FixedLayoutWarningDescription />,
}: {
  show: boolean
  title?: ReactNode
  description?: ReactNode
}) {
  return (
    <LandingPageWarning
      show={show}
      variant="prereq"
      title={title}
      description={description}
    />
  )
}
