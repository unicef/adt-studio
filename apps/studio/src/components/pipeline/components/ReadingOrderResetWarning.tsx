import { Trans } from "@lingui/react/macro"
import { rebuildsSectionIds, type StageName } from "@adt/types"
import { useReadingOrder } from "@/hooks/use-reading-order"

/**
 * Warn that a re-run is about to invalidate the reader's page order.
 *
 * A rebuild that re-mints section ids leaves the saved arrangement naming ids
 * that now hold other content, so the backend stops honouring it and refuses to
 * restore it. That is the right behaviour, but it is silent — the book simply
 * comes back in PDF order — so it has to be said before the run rather than
 * discovered after it.
 *
 * Renders nothing unless both halves are true: the run really does rebuild the
 * ids (`rebuildsSectionIds`, the same predicate the backend acts on, so the
 * warning cannot drift from what actually happens), and the book has an
 * arrangement to lose. Safe to drop into any stage's re-run flow for that
 * reason.
 */
export function ReadingOrderResetWarning({
  bookLabel,
  stageSlug,
}: {
  bookLabel: string
  stageSlug: string
}) {
  const { data: readingOrder } = useReadingOrder(bookLabel)

  // A landing-page re-run starts and ends at its own stage.
  const stage = stageSlug as StageName
  if (!rebuildsSectionIds(stage, stage)) return null
  // No saved arrangement means nothing to lose — every book is in PDF order
  // until its first reorder, and saying this then would be noise.
  if (readingOrder?.version == null) return null

  // The two rebuilds differ in what survives, and saying the wrong one is worse
  // than saying nothing: re-extract runs `clearExtractedData`, which deletes the
  // reading order outright, history included. Every other rebuild leaves the
  // rows in place and merely stops honouring them.
  const historySurvives = stage !== "extract"

  return (
    <p className="text-[13px] leading-relaxed">
      {historySurvives ? (
        <Trans>
          This also replaces the sections the current page order refers to, so
          the book returns to PDF order. Earlier page orders stay in the history
          but can no longer be restored.
        </Trans>
      ) : (
        <Trans>
          This also deletes the book's page order and its history, so the book
          returns to PDF order.
        </Trans>
      )}
    </p>
  )
}
