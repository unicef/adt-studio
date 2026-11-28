import { Trans } from "@lingui/react/macro"
import { SCOPE_LINK, ScopeField } from "../../../core/fields/ScopeField"

/** The wizard's page choice, with the Split option said in plain words for a first-time user. */
export function GuidedScopeField({ className }: { className?: string }) {
  return (
    <ScopeField
      className={className}
      splitPrompt={(split) => (
        <Trans>
          Several people converting this book together?{" "}
          <button type="button" onClick={split} className={SCOPE_LINK}>
            Split it into parts
          </button>{" "}
          so each person converts some of the pages.
        </Trans>
      )}
    />
  )
}
