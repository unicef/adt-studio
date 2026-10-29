import { useLingui } from "@lingui/react/macro"
import { Search, X } from "lucide-react"

export function RailSearch({
  query,
  onQuery,
  matches,
  onSubmit,
}: {
  query: string
  onQuery: (value: string) => void
  matches: number | null
  onSubmit: () => void
}) {
  const { t } = useLingui()
  return (
    <label className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-muted/70 px-2.5 transition-[background-color,box-shadow] duration-150 focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-inset motion-reduce:transition-none">
      <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onSubmit()
          } else if (event.key === "Escape" && query) {
            event.preventDefault()
            event.stopPropagation()
            onQuery("")
          }
        }}
        placeholder={t`Go to page or find text`}
        aria-label={t`Go to page or find text`}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
      />
      {matches != null && (
        <>
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">{matches}</span>
          <button
            type="button"
            aria-label={t`Clear`}
            onClick={() => onQuery("")}
            className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </label>
  )
}
