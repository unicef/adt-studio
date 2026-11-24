import { useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NoteTone } from "../notes/Note"

export type Flag = { key: string; number: number; topic: string; tone: NoteTone }

const COLOR: Record<NoteTone, string> = {
  plain: "bg-[#ffe98a] text-stone-800",
  ask: "bg-brand-600 text-white",
  done: "bg-emerald-500 text-white",
}

/**
 * The notes' flags stuck to the top of a page, like sticky index flags: one per note that points
 * to this page, numbered as in the margin. The active note's flag stands taller. Clicking a flag
 * opens its note.
 */
export function Flags({ flags, active, side, edge = "top", onPick }: { flags: Flag[]; active: string | null; side: "left" | "right" | "single"; edge?: "top" | "bottom"; onPick: (key: string) => void }) {
  const { t } = useLingui()
  if (!flags.length) return null
  return (
    <div className={cn("absolute z-20 flex gap-1", edge === "top" ? "bottom-[calc(100%-14px)] items-end" : "top-[calc(100%-14px)] items-start", side === "left" ? "left-4" : "right-4")}>
      {flags.map((f) => {
        const on = f.key === active
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onPick(f.key)}
            aria-label={t`Note ${f.number}: ${f.topic}`}
            aria-pressed={on}
            className={cn(
              "grid w-7 justify-center text-[11.5px] font-bold shadow-[0_2px_6px_-2px_rgba(0,0,0,0.35)] outline-none transition-[height,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1",
              edge === "top" ? "place-items-start rounded-t-[4px] pt-1 hover:-translate-y-0.5" : "place-items-end rounded-b-[4px] pb-1 hover:translate-y-0.5",
              COLOR[f.tone],
              on ? "h-[42px]" : "h-[30px]",
            )}
          >
            {f.tone === "done" ? <Check aria-hidden className="size-3.5 stroke-[3]" /> : f.number}
          </button>
        )
      })}
    </div>
  )
}
