import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { BookOpen, Check, ChevronLeft, ChevronRight, Languages, LayoutGrid, Lightbulb, List, Settings, ShoppingCart, Sparkles, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"

const PIP = "/previews/two-column-story.png"
const AISLE = "/previews/supermarket-aisle.jpg"

/** The ADT reader's bottom bar, as it looks in a real exported book (computer vs phone variant). */
export function ReaderBar({ phone }: { phone?: boolean }) {
  const icon = "size-[18px] text-white/90"
  return (
    <div className={cn("flex shrink-0 items-center justify-between bg-[#2f2f2f] text-white", phone ? "h-[52px] px-5" : "h-[44px] px-5")}>
      {phone ? (
        <List className={icon} />
      ) : (
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
          <List className={icon} />
          <Trans>Contents</Trans>
        </span>
      )}
      <span className="inline-flex items-center gap-4 text-[13px] font-semibold tabular-nums">
        <ChevronLeft className={icon} />
        <span>
          3<span className="text-white/50">/12</span>
        </span>
        <ChevronRight className={icon} />
      </span>
      {phone ? (
        <LayoutGrid className={icon} />
      ) : (
        <span className="inline-flex items-center gap-4">
          <BookOpen className={icon} />
          <Languages className={icon} />
          <Settings className={icon} />
        </span>
      )}
    </div>
  )
}

function Speaker() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/90 text-sky-700 shadow-sm">
      <Volume2 className="size-3.5" />
    </span>
  )
}

/** Example for "Text over the artwork": a picture-book page, art as background, text in readable boxes. */
export function OverlayExample({ phone }: { phone?: boolean }) {
  if (phone)
    return (
      <div className="flex size-full flex-col bg-white">
        <img src={PIP} alt="" className="h-[300px] w-full shrink-0 object-cover object-[50%_40%]" />
        <div className="flex flex-1 flex-col gap-3 bg-[#fffaf2] px-5 py-5">
          <div className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
            <Speaker />
            <p className="text-[19px] font-semibold leading-snug text-slate-800">
              <Trans>This is Pip! He is a happy little dog with a very wiggly tail.</Trans>
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
            <Speaker />
            <p className="text-[19px] font-semibold leading-snug text-slate-800">
              <Trans>Pip loves the green grass and the bright yellow sun.</Trans>
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
            <Speaker />
            <p className="text-[19px] font-semibold leading-snug text-slate-800">
              <Trans>Every morning he says hello to the flowers in the garden.</Trans>
            </p>
          </div>
        </div>
      </div>
    )
  return (
    <div className="relative size-full overflow-hidden">
      <img src={PIP} alt="" className="absolute inset-0 size-full object-cover object-[50%_45%]" />
      <div className="absolute left-6 top-6 flex max-w-[330px] items-start gap-3 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <Speaker />
        <p className="text-[22px] font-semibold leading-snug text-slate-800">
          <Trans>This is Pip! He is a happy little dog.</Trans>
        </p>
      </div>
      <div className="absolute bottom-6 right-6 flex max-w-[340px] items-start gap-3 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <Speaker />
        <p className="text-[22px] font-semibold leading-snug text-slate-800">
          <Trans>Pip loves the green grass and the bright yellow sun.</Trans>
        </p>
      </div>
    </div>
  )
}

function Activity({ compact }: { compact?: boolean }) {
  const options: ReactNode[] = [<Trans key="a">Milk</Trans>, <Trans key="b">Cereal</Trans>, <Trans key="c">Shoes</Trans>]
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-brand-700">
        <Sparkles className="size-3.5" />
        <Trans>Activity</Trans>
      </p>
      <p className="mt-1.5 text-[15px] font-semibold text-slate-800">
        <Trans>Which of these is not sold in this aisle?</Trans>
      </p>
      <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-1" : "grid-cols-3")}>
        {options.map((o, i) => (
          <span key={i} className={cn("flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-[14px] font-medium", i === 2 ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700")}>
            <span className={cn("grid size-5 place-items-center rounded-full border-2", i === 2 ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300")}>{i === 2 && <Check className="size-3 stroke-[3]" />}</span>
            {o}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Example for "Designed for any screen": a lesson page the AI lays out fresh, reflowing for phones. */
export function DynamicExample({ phone }: { phone?: boolean }) {
  const heading = (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
        <ShoppingCart className="size-5" />
      </span>
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-brand-700">
          <Trans>Lesson 3</Trans>
        </p>
        <h2 className={cn("font-bold leading-tight text-slate-900", phone ? "text-[24px]" : "text-[28px]")}>
          <Trans>At the supermarket</Trans>
        </h2>
      </div>
    </div>
  )
  const intro = (
    <p className="text-[15px] leading-relaxed text-slate-700">
      <Trans>Supermarkets put similar things together in aisles, so shoppers can find what they need quickly.</Trans>
    </p>
  )
  const figure = (
    <figure className="overflow-hidden rounded-2xl bg-slate-100">
      <img src={AISLE} alt="" className={cn("w-full object-cover", phone ? "h-[170px]" : "h-[190px]")} />
      <figcaption className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-500">
        <Lightbulb className="size-3.5 text-amber-500" />
        <Trans>Cereal on the left, milk on the right.</Trans>
      </figcaption>
    </figure>
  )
  if (phone)
    return (
      <div className="flex size-full flex-col gap-4 overflow-hidden bg-white px-5 pt-6">
        {heading}
        {figure}
        {intro}
        <Activity compact />
        <p className="text-[15px] leading-relaxed text-slate-700">
          <Trans>Look at the picture. What can you find on each side of the aisle?</Trans>
        </p>
      </div>
    )
  return (
    <div className="flex size-full flex-col gap-4 overflow-hidden bg-white px-8 pt-7">
      {heading}
      <div className="grid grid-cols-[1.1fr_1fr] gap-6">
        <div className="flex flex-col gap-3">
          {intro}
          <p className="text-[15px] leading-relaxed text-slate-700">
            <Trans>Look at the picture. What can you find on each side of the aisle?</Trans>
          </p>
        </div>
        {figure}
      </div>
      <Activity />
      <p className="text-[15px] leading-relaxed text-slate-700">
        <Trans>Next time you visit a supermarket, look at the signs above each aisle.</Trans>
      </p>
    </div>
  )
}
