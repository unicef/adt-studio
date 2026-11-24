import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"

/** The pages behind a note; each one turns the book to it. */
export function PageChips({ pages, onShowPage }: { pages: number[]; onShowPage: (page: number) => void }) {
  const { t } = useLingui()
  if (!pages.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold opacity-70">
        <BookOpen aria-hidden className="size-3.5" />
        <Trans>See it on</Trans>
      </span>
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onShowPage(n)}
          aria-label={t`Turn to page ${n}`}
          className="h-6 min-w-6 rounded-full bg-stone-900/[0.07] px-2 text-[11.5px] font-semibold tabular-nums transition-colors hover:bg-brand-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:bg-white/10"
        >
          <Trans>p. {n}</Trans>
        </button>
      ))}
    </div>
  )
}
