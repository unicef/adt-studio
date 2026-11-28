import { useId, useRef, type CSSProperties, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, SlidersHorizontal, Sparkles } from "lucide-react"
import { FlowTopBar } from "@/components/FlowTopBar"
import { cn } from "@/lib/utils"
import { BetaTag } from "../core/BetaTag"
import { Illustration } from "../core/Illustration"
import { usePageScale } from "../core/usePageScale"
import "../core/look.css"

/**
 * One way to set the book up, as a card: the whole card picks it (its button's hit area covers the
 * card), while the button itself is only the action, described by the card's text.
 */
function Way({ art, fallback, title, tag, text, points, cta, primary, onPick }: { art: string; fallback: ReactNode; title: ReactNode; tag?: ReactNode; text: ReactNode; points: ReactNode[]; cta: ReactNode; primary?: boolean; onPick: () => void }) {
  const id = useId()
  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-[22px] bg-[var(--lc-bubble)] text-left shadow-[var(--lc-shadow)] ring-1 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500 active:translate-y-0 motion-reduce:transition-none",
        primary ? "ring-brand-300 hover:ring-brand-500" : "ring-border hover:ring-brand-300",
      )}
    >
      <span className="grid h-[clamp(140px,28vh,300px)] place-items-center bg-[var(--lc-stage)] p-5">
        <Illustration name={art} fallback={fallback} />
      </span>
      <span className="flex flex-1 flex-col gap-3 p-5 lg:gap-4 lg:p-7">
        <span id={`${id}-title`} className="flex flex-wrap items-center gap-2">
          <span className="text-[20px] font-semibold leading-tight tracking-[-0.01em] lg:text-[24px]">{title}</span>
          {tag}
        </span>
        <span id={`${id}-text`} className="text-[14.5px] leading-relaxed text-muted-foreground lg:text-[16px]">{text}</span>
        <ul className="flex flex-col gap-1.5 text-[13.5px] lg:text-[14.5px]">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 stroke-[2.5] text-brand-600" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onPick}
          aria-describedby={`${id}-title ${id}-text`}
          className={cn(
            "mt-auto inline-flex h-11 items-center justify-center gap-2 self-start rounded-[12px] px-5 text-[14.5px] font-semibold outline-none transition-colors after:absolute after:inset-0 after:rounded-[22px]",
            primary ? "bg-brand-600 text-white group-hover:bg-brand-700" : "bg-card text-foreground ring-1 ring-border group-hover:bg-brand-50 group-hover:ring-brand-300",
          )}
        >
          {cta}
          <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </button>
      </span>
    </div>
  )
}

/**
 * Before the first step: how to set up the book. With the assistant (Beta): it reads the PDF and
 * suggests every setting, checked one at a time. Or step by step in the classic wizard, every
 * setting by hand.
 */
export function ModeChoice({ onAuto, onManual }: { onAuto: () => void; onManual: () => void }) {
  const { t } = useLingui()
  // Like the assistant's pages: centred in the window, and scaled up on big windows (1 up to
  // 1440x920, then with the window, up to 1.5) instead of sitting small at the top.
  const scroller = useRef<HTMLDivElement>(null)
  const { scale } = usePageScale(scroller)
  return (
    <div className="lc-root flex h-full min-h-0 flex-1 flex-col">
      <FlowTopBar title={t`Add Book`} contentWidth={1040 * scale} />
      <div ref={scroller} className="flex flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-[1040px] flex-col gap-7 px-4 py-8 sm:px-6" style={{ zoom: scale } as CSSProperties}>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] lg:text-[34px]">
              <Trans>How do you want to set up this book?</Trans>
            </h1>
            <p className="text-[15px] text-muted-foreground lg:text-[16.5px]">
              <Trans>Either way you choose the PDF next, and nothing is converted until you set the book up.</Trans>
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
            <Way
              primary
              art="step-check-wizard"
              fallback={<Sparkles className="size-10 text-brand-500" />}
              title={<Trans>With the assistant</Trans>}
              tag={<BetaTag />}
              text={<Trans>The assistant reads your PDF and suggests every setting. You check them in a few quick screens.</Trans>}
              points={[<Trans key="a">A few seconds of reading, then one choice at a time</Trans>, <Trans key="b">Every suggestion says why, and you can change it</Trans>]}
              cta={<Trans>Start with the assistant</Trans>}
              onPick={onAuto}
            />
            <Way
              art="mode-manual"
              fallback={<SlidersHorizontal className="size-10 text-brand-500" />}
              title={<Trans>Step by step</Trans>}
              text={<Trans>Pick a preset and choose every setting yourself, in the classic wizard.</Trans>}
              points={[<Trans key="a">Every setting in view</Trans>, <Trans key="b">The way books were set up before</Trans>]}
              cta={<Trans>Set it up myself</Trans>}
              onPick={onManual}
            />
          </div>
          <p className="flex items-start gap-2 rounded-[14px] bg-amber-50 px-4 py-3 text-[13.5px] leading-relaxed text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25">
            <BetaTag className="mt-px shrink-0" />
            <span>
              <Trans>The assistant is new. It can get a suggestion wrong, so look over each one before you set the book up.</Trans>
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
