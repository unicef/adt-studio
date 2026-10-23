import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { EyeOff, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "./CanvasEditing"

function PrunedOverlay({ sectionNumber, sectionIndex }: { sectionNumber: number; sectionIndex: number }) {
  const { t } = useLingui()
  const { togglePruned, locked, saving } = useCanvasEditing()
  const blocked = locked || saving
  return (
    <div className="absolute inset-0 z-10 bg-background/40 bg-[repeating-linear-gradient(135deg,transparent_0_11px,color-mix(in_oklab,var(--foreground)_5%,transparent)_11px_12px)] animate-in fade-in duration-300 motion-reduce:animate-none">
      <div className="sticky top-6 mx-auto my-6 flex w-fit items-center gap-3 rounded-full border bg-card/95 py-1 pl-1 pr-1 shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none">
        <span className="grid size-8 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <EyeOff className="size-4" />
        </span>
        <span className="flex flex-col pr-1 leading-tight">
          <span className="text-[12.5px] font-medium">
            <Trans>Section pruned from flow</Trans>
          </span>
          <span className="text-[11px] text-muted-foreground">
            <Trans>Section {sectionNumber} stays out of the book</Trans>
          </span>
        </span>
        <button
          type="button"
          onClick={() => togglePruned(sectionIndex)}
          disabled={blocked}
          title={locked ? t`Wait for the storyboard to finish building` : undefined}
          className="flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold text-background transition-transform duration-150 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 motion-reduce:transition-none"
        >
          <RotateCcw className="size-3.5" />
          <Trans>Restore</Trans>
        </button>
      </div>
    </div>
  )
}

export function SectionFrame({
  sectionIndex,
  pruned,
  highlighted,
  children,
}: {
  sectionIndex: number
  pruned: boolean
  highlighted: boolean
  children: ReactNode
}) {
  return (
    <div data-canvas-section={sectionIndex} className="relative scroll-mt-6 border-b last:border-b-0">
      <div
        inert={pruned}
        aria-hidden={pruned || undefined}
        className={cn(
          "transition-[opacity,filter] duration-300 ease-out motion-reduce:transition-none",
          pruned && "opacity-40 grayscale",
        )}
      >
        {children}
      </div>
      {pruned && <PrunedOverlay sectionNumber={sectionIndex + 1} sectionIndex={sectionIndex} />}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-[5] shadow-[inset_0_0_0_2px_var(--brand-400)] transition-opacity duration-500 motion-reduce:transition-none",
          highlighted ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}
