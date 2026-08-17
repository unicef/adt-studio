import { useMemo } from "react"
import { BookOpen, Hash, List, Sparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export type TocModeKey = "extract" | "dynamic"

interface TocEntryPreview {
  level: 1 | 2
  title: string
  meta?: string
}

export function TocPreview({ mode }: { mode: TocModeKey }) {
  const { t } = useLingui()

  const extractEntries: TocEntryPreview[] = useMemo(
    () => [
      { level: 1, title: t`Chapter 1: Introduction`, meta: t`p. 1` },
      { level: 2, title: t`1.1 Background`, meta: t`p. 3` },
      { level: 2, title: t`1.2 Scope`, meta: t`p. 7` },
      { level: 1, title: t`Chapter 2: Methods`, meta: t`p. 12` },
      { level: 2, title: t`2.1 Data collection`, meta: t`p. 14` },
      { level: 2, title: t`2.2 Analysis`, meta: t`p. 21` },
      { level: 1, title: t`Chapter 3: Results`, meta: t`p. 28` },
      { level: 1, title: t`Chapter 4: Conclusion`, meta: t`p. 41` },
    ],
    [t],
  )

  const dynamicEntries: TocEntryPreview[] = useMemo(
    () => [
      { level: 1, title: t`Where it all begins`, meta: t`p. 1` },
      { level: 2, title: t`The world before us`, meta: t`p. 3` },
      { level: 2, title: t`A question worth asking`, meta: t`p. 7` },
      { level: 1, title: t`Gathering the evidence`, meta: t`p. 12` },
      { level: 2, title: t`Listening to the data`, meta: t`p. 14` },
      { level: 2, title: t`Patterns in the noise`, meta: t`p. 21` },
      { level: 1, title: t`What we discovered`, meta: t`p. 28` },
      { level: 1, title: t`Looking forward`, meta: t`p. 41` },
    ],
    [t],
  )

  const entries = mode === "extract" ? extractEntries : dynamicEntries

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <div className="flex w-full h-full flex-col gap-3 px-5 py-5 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <List className="h-3.5 w-3.5 text-amber-700" strokeWidth={2} aria-hidden />
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-amber-700 leading-none">
              <Trans>Table of Contents</Trans>
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-500/80 leading-none">
            <Trans>Sample</Trans>
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-2.5">
            <BookOpen className="h-3.5 w-3.5 text-amber-600" strokeWidth={2} aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Trans>Contents</Trans>
            </span>
            <span
              className={cn(
                "ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors",
                mode === "extract"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-amber-50 text-amber-700 ring-1 ring-border",
              )}
              style={{ viewTransitionName: "toc-mode-badge" }}
            >
              {mode === "extract" ? <Trans>Extract</Trans> : <Trans>Dynamic</Trans>}
            </span>
          </div>
          <ul className="mt-2.5 flex flex-col gap-0.5">
            {entries.map((entry, i) => (
              <li
                key={i}
                className={cn(
                  "group flex items-center gap-2 rounded px-2 py-1.5 transition-colors",
                  entry.level === 2 && "ml-4",
                )}
              >
                <span
                  className={cn(
                    "flex h-1 w-1 shrink-0 rounded-full",
                    entry.level === 1 ? "bg-amber-500" : "bg-amber-300",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex-1 truncate transition-colors",
                    entry.level === 1
                      ? "text-[12.5px] font-medium text-foreground"
                      : "text-[11.5px] text-muted-foreground",
                    mode === "dynamic" && "italic",
                  )}
                  style={{ viewTransitionName: `toc-entry-${i}` }}
                >
                  {entry.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tabular-nums text-[#a3a3a3] opacity-0 transition-opacity group-hover:opacity-100",
                    entry.level === 1 && "opacity-60",
                  )}
                >
                  {entry.meta}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-md bg-amber-50  dark:bg-background dark:text-amber-500 px-2.5 py-1.5 text-[10.5px] text-amber-800">
          {mode === "extract" ? (
            <Hash className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
          ) : (
            <Sparkles className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
          )}
          {mode === "extract" ? (
            <Trans>Titles taken verbatim from typed section headings.</Trans>
          ) : (
            <Trans>Titles generated by the model from section content.</Trans>
          )}
        </div>
      </div>
    </div>
  )
}
