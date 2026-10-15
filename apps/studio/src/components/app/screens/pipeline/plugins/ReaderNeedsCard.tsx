import { useEffect, useState } from "react"
import { toast } from "@/components/ui/sonner"
import { SETUP_FINISHED_TOAST, setReaderCardShown } from "@/components/app/lab/outputs"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"

const NEEDS: { slug: string; title: MessageDescriptor; body: MessageDescriptor }[] = [
  { slug: "captions", title: msg`Readers who can't see the pictures`, body: msg`Image descriptions, read out by screen readers.` },
  { slug: "speech", title: msg`Readers who listen`, body: msg`The whole book read aloud, with words highlighted.` },
  { slug: "easy-read", title: msg`Readers who need simpler text`, body: msg`An easier version of every text they can switch on.` },
  { slug: "translate", title: msg`Readers of another language`, body: msg`The book translated, for example into Portuguese.` },
  { slug: "sign-language", title: msg`Deaf readers who sign`, body: msg`Sign-language videos next to each section. You upload them.` },
  { slug: "validation", title: msg`You, before sharing`, body: msg`An accessibility check of the finished book.` },
]

export function ReaderNeedsCard({
  available,
  onAddMany,
  onDismiss,
  hidden = false,
}: {
  available: DockItem[]
  onAddMany: (slugs: string[]) => void
  onDismiss: () => void
  hidden?: boolean
}) {
  const { i18n } = useLingui()
  const options = NEEDS.map((need) => ({ ...need, item: available.find((item) => item.slug === need.slug) })).filter(
    (need): need is (typeof NEEDS)[number] & { item: DockItem } => !!need.item,
  )
  const [picked, setPicked] = useState<string[]>([])
  const [leaving, setLeaving] = useState(false)
  const leave = (then: () => void) => {
    setLeaving(true)
    window.setTimeout(() => {
      then()
      document.querySelector<HTMLButtonElement>("[data-outputs-trigger]")?.focus()
    }, 200)
  }
  useEffect(() => {
    setReaderCardShown(true)
    toast.dismiss(SETUP_FINISHED_TOAST)
    return () => setReaderCardShown(false)
  }, [])
  if (options.length === 0) return null
  const toggle = (slug: string) =>
    setPicked((previous) => (previous.includes(slug) ? previous.filter((item) => item !== slug) : [...previous, slug]))

  return (
    <div
      role="dialog"
      aria-labelledby="reader-needs-title"
      aria-hidden={hidden || undefined}
      inert={hidden || leaving}
      className={cn(
        "w-[640px] rounded-2xl border bg-card p-4 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)] transition-[opacity,translate] duration-200 ease-out animate-in fade-in slide-in-from-bottom-2 [animation-duration:500ms] motion-reduce:transition-none",
        (hidden || leaving) && "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div id="reader-needs-title" className="text-[14px] font-semibold">
            <Trans>Your pages are ready. Who will read this book?</Trans>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            <Trans>Pick what your readers need — we add it to the book for you to set up. Nothing runs until you press Run.</Trans>
          </p>
        </div>
        <button type="button" onClick={() => leave(onDismiss)} aria-label={i18n._(msg`Not now`)} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {options.map((need) => {
          const on = picked.includes(need.slug)
          return (
            <button
              key={need.slug}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(need.slug)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-[border-color,background-color] duration-150",
                on ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "hover:bg-muted",
              )}
            >
              <span
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white transition-transform duration-150"
                style={{ background: need.item.hex }}
              >
                {on ? <Check className="size-3.5" strokeWidth={3} /> : <need.item.icon className="size-3.5" strokeWidth={2.4} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold leading-snug">{i18n._(need.title)}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{i18n._(need.body)}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={() => leave(onDismiss)} className="rounded-full px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Trans>Not now</Trans>
        </button>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => leave(() => onAddMany(picked))}
          className="rounded-full bg-foreground px-4 py-1.5 text-[12.5px] font-semibold text-background transition-[opacity,transform] duration-150 hover:scale-[1.02] active:scale-95 disabled:opacity-40"
        >
          {picked.length > 1 ? <Trans>Add {picked.length}</Trans> : <Trans>Add</Trans>}
        </button>
      </div>
    </div>
  )
}
