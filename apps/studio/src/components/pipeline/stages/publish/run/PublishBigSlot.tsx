import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PublishStepProgress } from "@/hooks/use-book-publication"
import { formatCount } from "./publish-format"

export function PublishCountLabel({
  progress,
  locale,
}: {
  progress: PublishStepProgress
  locale?: string
}) {
  const done = formatCount(progress.done, locale)
  const total = formatCount(progress.total, locale)

  /* Three messages rather than one with an interpolated unit: "of" and the noun agree differently
     in every locale this ships in, and a sentence assembled from parts is a sentence no translator
     can fix. */
  if (progress.unit === "pages") {
    return (
      <Trans>
        {done} of {total} pages
      </Trans>
    )
  }
  if (progress.unit === "bytes") {
    return (
      <Trans>
        {done} of {total} bytes
      </Trans>
    )
  }
  return (
    <Trans>
      {done} of {total} files
    </Trans>
  )
}

/**
 * The biggest thing on the screen, and the one place the two modes differ.
 *
 * At minute three the author has exactly one question — is it still moving — and a count answers
 * it in a way a percentage cannot: `184 → 187` is visibly different, `54% → 54%` is not. So when
 * the wire carries counts, the counts are the headline. When it does not, the headline is the name
 * of what is happening, promoted to fill the same slot, because the alternative is inventing a
 * number and that is the one thing this screen may never do.
 *
 * The digits never tween. A count-up animation would turn a true number into a decorative one, and
 * the whole argument for putting it here is that it is true.
 */
export function PublishBigSlot({
  progress,
  stepTitle,
}: {
  progress: PublishStepProgress | null
  stepTitle: ReactNode
}) {
  const { i18n } = useLingui()
  const counted = progress !== null && progress.total > 0

  return (
    /* A minimum rather than a fixed height: the two modes are the same height for every locale we
       ship, so nothing below moves on the crossfade, but a long French step title is allowed to
       take the second line it needs instead of being clipped. */
    <div className="grid min-h-12 w-full items-end">
      {counted ? (
        <p
          key="counted"
          data-testid="publish-big-count"
          className="text-4xl font-semibold leading-[1.15] tabular-nums text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          <PublishCountLabel progress={progress} locale={i18n.locale} />
        </p>
      ) : (
        <p
          key="uncounted"
          data-testid="publish-big-title"
          className="text-2xl font-medium leading-tight text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          {stepTitle}
        </p>
      )}
    </div>
  )
}
