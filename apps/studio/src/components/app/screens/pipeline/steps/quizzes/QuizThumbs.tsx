import { useLingui } from "@lingui/react/macro"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { cn } from "@/lib/utils"

const STACK = 3

export function QuizThumbs({
  label,
  pageIds,
  pageNumbers,
  ratio,
  size,
  range,
  onOpen,
}: {
  label: string
  pageIds: string[]
  pageNumbers: ReadonlyMap<string, number>
  ratio: number
  size: "sm" | "lg"
  range?: string
  onOpen: (pageId: string) => void
}) {
  const { t } = useLingui()
  const stacked = size === "sm"
  const shown = stacked ? pageIds.slice(0, STACK) : pageIds
  return (
    <span className={cn("flex items-center", stacked ? "gap-2" : "flex-wrap gap-1.5")}>
      <span className={cn("flex items-center", stacked ? "isolate" : "flex-wrap gap-1.5")}>
        {shown.map((pageId, index) => {
          const number = pageNumbers.get(pageId)
          const enlarge = number != null ? t`Enlarge page ${number}` : t`Enlarge page`
          return (
            <button
              key={pageId}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpen(pageId)
              }}
              aria-label={enlarge}
              title={enlarge}
              style={stacked ? { zIndex: STACK - index } : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-md transition-[transform,background-color] duration-150 ease-out focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none",
                stacked ? "not-first:-ml-5 hover:z-10! hover:-translate-y-0.5" : "p-0.5 hover:bg-muted",
              )}
            >
              <PageThumb
                label={label}
                pageId={pageId}
                sectionIndex={null}
                className={cn(stacked ? "h-10 shadow-[0_0_0_2px_var(--card)]" : "h-28", "w-auto")}
                style={{ aspectRatio: ratio }}
              />
              {!stacked && number != null && <span className="font-mono text-[10px] text-muted-foreground">{t`p${number}`}</span>}
            </button>
          )
        })}
      </span>
      {stacked && range && (
        <span title={t`Made from pages ${range}`} className="font-mono text-[10.5px] whitespace-nowrap tabular-nums text-muted-foreground">
          {t`p. ${range}`}
        </span>
      )}
    </span>
  )
}
