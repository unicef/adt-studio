import { useAtomValue } from "jotai"
import { useMemo } from "react"
import { currentSectionIdAtom, pagesAtom, type PageEntry } from "@/features/navigation/state/nav.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { cn } from "@/shared/lib/utils"
import { ScrollArea } from "@/shared/ui/scroll-area"
import { DockContent } from "@/features/dock/components/DockLayout"
import { navigateToPage } from "@/features/navigation/lib/page-swap"

function isActivitySectionId(id: string): boolean {
  return id.startsWith("qz")
}

export function ActivityListContent() {
  const pages = useAtomValue(pagesAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const { t } = useTranslation()

  const activities = useMemo<PageEntry[]>(
    () => pages.filter((p) => isActivitySectionId(p.section_id)),
    [pages],
  )

  const title = t("activity-list-title") || "Activities"
  const empty = t("activity-list-empty") || "No activities yet"
  const itemPrefix = t("activity-item-label") || "Activity"

  return (
    <DockContent className="gap-3 h-auto">
      <DockContent.Title>{title}</DockContent.Title>
      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1 py-3">{empty}</p>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <ol className="py-1">
              {activities.map((page, index) => {
              const active = page.section_id === currentSectionId
              const label = `${itemPrefix} ${index + 1}`
              return (
                <li key={page.section_id}>
                  <button
                    type="button"
                    onClick={() => {
                      navigateToPage(page.href)
                    }}
                    aria-current={active ? "page" : undefined}
                    title={label}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-sm text-left",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      active && "bg-accent text-accent-foreground font-medium",
                    )}
                  >
                    <span className="truncate">{label}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {page.section_id}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </ScrollArea>
      )}
    </DockContent>
  )
}
