import { Trans } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Prerequisite } from "./PluginEmptyState"

/**
 * What has to be true before a stage can run, carried over from the redesign's
 * empty state into the stage landing. The landing's own warnings explain a
 * blocking upstream in prose; this is the at-a-glance version.
 */
export function PreRunChecklist({ items }: { items: Prerequisite[] }) {
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Trans>Before running</Trans>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(
              "flex items-start gap-2.5 text-[12.5px] leading-relaxed",
              item.met ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-200 ease-out",
                item.met ? "bg-emerald-500 text-white" : "border-[1.5px] border-border",
              )}
            >
              {item.met && <Check className="size-2.5" strokeWidth={4} />}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
