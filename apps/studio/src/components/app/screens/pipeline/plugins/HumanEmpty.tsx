import { Trans } from "@lingui/react/macro"
import { Layers, MousePointerClick } from "lucide-react"

export function HumanEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center animate-in fade-in duration-300 motion-reduce:animate-none">
      <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-brand-500/10 text-brand-700">
        <MousePointerClick aria-hidden className="size-5" />
      </span>
      <p className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
        <Trans>Nothing selected</Trans>
      </p>
      <p className="mt-1.5 max-w-[240px] text-[12.5px] leading-relaxed text-muted-foreground">
        <Trans>Click any text or image on the page to change how it looks.</Trans>
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Layers aria-hidden className="size-3.5" />
        <Trans>Or pick it in Layers, on the left.</Trans>
      </p>
    </div>
  )
}
