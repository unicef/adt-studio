import { memo, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { CATEGORY_KEYS } from "./translateState"

export interface TranslateCategoryFilterProps {
  counts: Map<CatalogCategory, number>
  total: number
  active: CatalogCategory
  hex: string
  onSelect: (category: CatalogCategory) => void
}

export const TranslateCategoryFilter = memo(function TranslateCategoryFilter({
  counts,
  total,
  active,
  hex,
  onSelect,
}: TranslateCategoryFilterProps) {
  const { t } = useLingui()

  const pills = useMemo(() => {
    const labels: Record<(typeof CATEGORY_KEYS)[number], string> = {
      text: t`Text`,
      captions: t`Captions`,
      answers: t`Answers`,
      glossary: t`Glossary`,
      "easy-read": t`Easy Read`,
    }
    const out: Array<{ key: CatalogCategory; label: string; count: number }> = [
      { key: "all", label: t`All`, count: total },
    ]
    for (const key of CATEGORY_KEYS) {
      const count = counts.get(key) ?? 0
      // A category the book has none of is noise, not information.
      if (count === 0) continue
      out.push({ key, label: labels[key], count })
    }
    return out
  }, [counts, total, t])

  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill) => {
        const isActive = pill.key === active
        return (
          <button
            key={pill.key}
            type="button"
            onClick={() => onSelect(pill.key)}
            aria-pressed={isActive}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors",
              isActive ? "font-semibold" : "bg-muted text-muted-foreground hover:bg-accent",
            )}
            style={isActive ? { background: tint(hex, 0.14), color: hex } : undefined}
          >
            {pill.label}
            <span className="font-mono text-[10px] tabular-nums opacity-70">{pill.count}</span>
          </button>
        )
      })}
    </div>
  )
})
