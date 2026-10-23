import { BookOpen } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { TocEntry } from "@/api/client"
import { cn } from "@/lib/utils"

export function TocReaderMenu({ entries, hex }: { entries: readonly TocEntry[]; hex: string }) {
  return (
    <aside aria-hidden className="flex flex-col gap-2 rounded-xl border bg-card p-4 xl:sticky xl:top-14">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Trans>What readers see</Trans>
      </p>
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2 border-b pb-2">
          <BookOpen className="size-3.5" style={{ color: hex }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Trans>Contents</Trans>
          </span>
        </div>
        <ul className="mt-2 flex flex-col gap-0.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 py-1 transition-[padding] duration-200 motion-reduce:transition-none"
              style={{ paddingInlineStart: (entry.level - 1) * 14 }}
            >
              <span className="size-1 shrink-0 rounded-full" style={{ background: hex, opacity: entry.level === 1 ? 1 : 0.5 }} />
              <span className={cn("truncate", entry.level === 1 ? "text-[12.5px] font-medium text-foreground" : "text-[11.5px] text-muted-foreground")}>
                {entry.title || <Trans>Untitled entry</Trans>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
