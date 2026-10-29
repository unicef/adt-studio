import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Check, GripVertical, PencilLine } from "lucide-react"
import type { ACTIVITY_PRESETS } from "./activity-presets"

/** Decorative thumbnails; the adjacent template name supplies the accessible label. */
export function ActivityTemplateIllustration({ presetKey }: { presetKey: typeof ACTIVITY_PRESETS[number]["key"] }) {
  const line = <span className="block h-1.5 w-6 rounded-full bg-current opacity-25" />
  const slot = <span className="h-5 w-8 rounded border border-dashed border-current bg-background/70" />
  return (
    <div aria-hidden="true" className="flex h-16 items-center justify-center gap-2 rounded-lg bg-primary/5 p-3 text-primary">
      {presetKey === "replicate" ? <><BookOpen className="size-9" /><ArrowRight className="size-4" /><PencilLine className="size-6" /></>
        : presetKey === "matching" ? <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">{line}<ArrowUpRight className="size-3" />{line}{line}<ArrowDownRight className="size-3" />{line}</div>
        : presetKey === "sorting" ? <>{[0, 1].map((id) => <span key={id} className="flex h-10 w-14 items-end gap-1 rounded border border-current/40 p-2"><span className="size-3 rounded-sm bg-current/50" /><span className="size-3 rounded-full bg-current/30" /></span>)}</>
        : presetKey === "ordering" ? <><div className="space-y-1">{[0, 1, 2].map((id) => <span key={id} className="flex items-center gap-2 rounded border border-current/30 px-2"><GripVertical className="size-3" />{line}</span>)}</div><ArrowDown className="size-4" /></>
        : presetKey === "table" ? <div className="grid grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((id) => <span key={id} className="h-4 w-7 rounded-sm border border-current/30 even:bg-current/10" />)}</div>
        : presetKey === "open-ended" ? <span className="flex h-11 w-28 flex-col gap-2 rounded border border-current/30 p-2">{line}{line}<PencilLine className="-mt-5 ml-auto size-4" /></span>
        : presetKey === "fill-in-the-blank" ? <>{line}{slot}{line}</>
        : presetKey === "underline" ? <>{line}<span className="border-b-2 border-current pb-1">{line}</span>{line}</>
        : presetKey === "true-false" ? <><span className="rounded-md border border-current bg-background p-2"><Check className="size-4" /></span><span className="rounded-md border border-current/30 p-2"><span className="block size-4 rounded-full border border-current/40" /></span></>
        : <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((id) => <span key={id} className="flex items-center gap-2 rounded border border-current/30 px-2 py-1"><span className={`flex size-3 items-center justify-center border border-current ${presetKey === "multi-select" ? "rounded-sm" : "rounded-full"}`}>{id === 0 && <Check className="size-3" />}</span>{line}</span>)}</div>}
    </div>
  )
}
