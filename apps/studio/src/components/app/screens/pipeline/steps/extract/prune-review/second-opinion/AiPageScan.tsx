import { useLingui } from "@lingui/react/macro"
import { getPageThumbnailUrl } from "@/api/client"
import { cn } from "@/lib/utils"
import { thumbRect } from "../thumbRect"
import type { FilteredImage } from "../useFilteredImages"

export function AiPageScan({ label, pageId, items, className }: { label: string; pageId: string; items: readonly FilteredImage[]; className?: string }) {
  const { t } = useLingui()
  const aspect = 3 / 4
  const pageNumber = items[0]?.pageNumber
  return (
    <figure className={cn("relative flex flex-col gap-1.5 self-start", className)}>
      <span key={pageId} className="relative block w-full overflow-hidden rounded-md border bg-zinc-50 shadow-sm animate-in fade-in duration-300 motion-reduce:animate-none dark:bg-zinc-200" style={{ aspectRatio: aspect }}>
        <img src={getPageThumbnailUrl(label, pageId, 400)} alt="" className="size-full object-contain" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--chrome-hex)_18%,transparent)] to-transparent motion-safe:animate-[ai-scan_1.8s_ease-in-out_infinite]" />
        {items.map((item) => {
          const rect = thumbRect(item.bounds, item.pageSize, aspect, "contain")
          return rect ? (
            <span
              key={item.key}
              aria-hidden
              className="absolute rounded-[3px] border-2 border-[var(--chrome-hex)] bg-[color-mix(in_srgb,var(--chrome-hex)_22%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_25%,transparent)] motion-safe:animate-pulse"
              style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%`, minWidth: 6, minHeight: 6 }}
            />
          ) : null
        })}
      </span>
      <figcaption className="flex h-8 flex-col items-center text-center text-[11px] leading-4 text-muted-foreground tabular-nums">
        {pageNumber !== undefined && (
          <>
            <span>{t`Checking now`}</span>
            <span>{t`page ${pageNumber}`}</span>
          </>
        )}
      </figcaption>
    </figure>
  )
}
