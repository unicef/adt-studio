import { useLingui } from "@lingui/react/macro"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { cn } from "@/lib/utils"

export function QuizThumbs({
  label,
  pageIds,
  pageNumbers,
  ratio,
  size,
  onOpen,
}: {
  label: string
  pageIds: string[]
  pageNumbers: ReadonlyMap<string, number>
  ratio: number
  size: "sm" | "lg"
  onOpen: (pageId: string) => void
}) {
  const { t } = useLingui()
  return (
    <span className="flex items-center gap-1.5">
      {pageIds.slice(0, size === "sm" ? 3 : undefined).map((pageId) => {
        const number = pageNumbers.get(pageId)
        return (
          <button
            key={pageId}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(pageId)
            }}
            aria-label={number != null ? t`Enlarge page ${number}` : t`Enlarge page`}
            className="flex flex-col items-center gap-1 rounded-md p-0.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PageThumb
              label={label}
              pageId={pageId}
              sectionIndex={null}
              className={cn(size === "sm" ? "h-10" : "h-28", "w-auto")}
              style={{ aspectRatio: ratio }}
            />
            {size === "lg" && number != null && <span className="font-mono text-[10px] text-muted-foreground">{t`p${number}`}</span>}
          </button>
        )
      })}
    </span>
  )
}
