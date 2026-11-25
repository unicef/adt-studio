import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { needsHistoryRecovery } from "@/lib/sectioning-error"

/** Links an error to the book's History recovery settings when recovery can
 * resolve it; renders nothing for every other error. */
export function HistoryRecoveryLink({ bookLabel, error, code }: { bookLabel?: string; error?: string | null; code?: string | null }) {
  if (!bookLabel || !needsHistoryRecovery(error, code)) return null
  return (
    <Link
      to="/books/$label/$step/settings"
      params={{ label: bookLabel, step: "book" }}
      search={{ tab: "history" }}
      className="font-medium underline underline-offset-2"
    >
      <Trans>Inspect history</Trans>
    </Link>
  )
}
