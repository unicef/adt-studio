import { X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { GlossaryItem } from "@/api/client"

export function SeedTermRow({
  term,
  onRemove,
}: {
  term: GlossaryItem
  onRemove: () => void
}) {
  const { t } = useLingui()
  return (
    <li className="group flex items-start gap-2.5 rounded-md border border-[#e5e5e5] bg-white px-3 py-2 transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa] dark:border-border dark:bg-card dark:hover:border-border dark:hover:bg-muted/50">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold text-[#0a0a0a] truncate dark:text-foreground">
            {term.word}
          </span>
          {term.emojis.length > 0 && (
            <span className="text-[11px] leading-none">
              {term.emojis.join(" ")}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[11.5px] leading-snug text-[#737373] dark:text-muted-foreground">
          {term.definition}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title={t`Remove term`}
        aria-label={t`Remove ${term.word}`}
        className="-mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#a3a3a3] opacity-0 transition-opacity duration-150 hover:bg-[#f5f5f5] hover:text-[#525252] dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    </li>
  )
}
