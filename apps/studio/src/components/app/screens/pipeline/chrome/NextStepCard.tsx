import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { ArrowRight } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isQuietNextStep, useNextStep, type NextStep } from "@/components/app/screens/pipeline/shared/useNextStep"
import { NextStepQuiet } from "./NextStepQuiet"

export interface NextStepConfirm {
  title: ReactNode
  body: ReactNode
  reviewLabel: ReactNode
  onReview: () => void
}

const WHY: Record<string, MessageDescriptor> = {
  sectioning: msg`Group each page's text and images into sections. The storyboard is built from them.`,
  storyboard: msg`Turn the sections into the pages your readers will see.`,
  translate: msg`Translate the book's text, descriptions and extras into your readers' languages.`,
  speech: msg`Read every passage aloud, in each language, with words highlighted as they are spoken.`,
  validation: msg`Package the book and check it against accessibility guidelines.`,
  preview: msg`See it in your book.`,
  export: msg`Download the finished book to share or publish.`,
}

interface NextStepCardViewProps {
  next: NextStep | null
  slug: string
  ready?: boolean
  confirm?: NextStepConfirm | null
  aside?: ReactNode
  bold?: boolean
}

export function NextStepCard({
  label,
  slug,
  partial = false,
  ...view
}: Omit<NextStepCardViewProps, "next"> & { label: string; partial?: boolean }) {
  const next = useNextStep(label, slug, { partial })
  return <NextStepCardView next={next} slug={slug} {...view} />
}

export function NextStepCardView({ next, slug, ready = true, confirm, aside, bold = false }: NextStepCardViewProps) {
  const { i18n } = useLingui()
  const [asking, setAsking] = useState(false)
  if (!next) return null
  if (!ready) {
    const stage = getStageLabelI18n(slug)
    return (
      <p className="flex h-12 items-center rounded-xl border bg-card px-4 text-[12.5px] text-muted-foreground animate-in fade-in duration-300 motion-reduce:animate-none">
        <Trans>Nothing from {stage} reaches the book yet.</Trans>
      </p>
    )
  }
  const whyMessage = WHY[next.slug]
  const why = whyMessage ? i18n._(whyMessage) : null
  if (!bold && isQuietNextStep(next)) return <NextStepQuiet slug={slug} next={next} why={why} aside={aside} />

  const goButton = (
    <button
      type="button"
      onClick={confirm ? undefined : next.open}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[12.5px] font-semibold transition-colors hover:bg-white/90"
      style={{ color: next.hex }}
    >
      <Trans>Go to {next.name}</Trans>
      <ArrowRight className="size-3.5" />
    </button>
  )

  return (
    <section
      className="overflow-hidden rounded-xl text-white shadow-sm animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none"
      style={{ background: next.hex, ["--next-hex" as string]: next.hex }}
    >
      <div className="flex items-center gap-3.5 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20">
          <next.icon className="size-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug">
            <Trans>Next: {next.name}</Trans>
          </p>
          {why && <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/85">{why}</p>}
        </div>
        {confirm ? (
          <Popover open={asking} onOpenChange={setAsking}>
            <PopoverTrigger asChild>{goButton}</PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[340px] p-4">
              <p className="text-[13px] font-semibold">{confirm.title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{confirm.body}</p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAsking(false)
                    next.open()
                  }}
                  className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Trans>Continue anyway</Trans>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAsking(false)
                    confirm.onReview()
                  }}
                  className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: next.hex }}
                >
                  {confirm.reviewLabel}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          goButton
        )}
      </div>
      {aside && <div className="border-t border-white/15 bg-black/10 px-5 py-2.5 text-[12.5px] text-white/90 empty:hidden animate-in fade-in duration-300 motion-reduce:animate-none">{aside}</div>}
    </section>
  )
}
