import { Trans, useLingui } from "@lingui/react/macro"
import { Play, Image as ImageIcon, Languages, Hand, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Capability } from "./capabilities"

export function Equalizer({ className }: { className?: string }) {
  const bars = [6, 11, 8, 13, 7, 10, 5]
  return (
    <span className={cn("flex items-center gap-[3px]", className)} aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-current motion-safe:animate-eq"
          style={{ height: h, animationDelay: `${i * 90}ms`, animationDuration: `${0.9 + (i % 3) * 0.25}s` }}
        />
      ))}
    </span>
  )
}

export function PreviewArt({ className }: { className?: string }) {
  const { t } = useLingui()
  return (
    <div className={cn("relative", className)} aria-hidden>
      <div className="relative mx-auto w-[248px] rounded-2xl border bg-card p-4 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <img src="/logo.png" className="size-5" alt="" />
          <div className="h-2 w-24 rounded-full bg-foreground/80" />
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[8px] text-muted-foreground">
            <Trans>ES</Trans>
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="h-1.5 w-[92%] rounded-full bg-muted" />
          <div className="h-1.5 w-[80%] rounded-full bg-muted" />
        </div>
        <div className="my-2.5 grid h-16 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ImageIcon className="size-5" />
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-2.5 py-2">
          <span className="grid size-6 place-items-center rounded-full bg-stage-speech text-white">
            <Play className="size-3" />
          </span>
          <span className="text-stage-speech">
            <Equalizer />
          </span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">0:42</span>
        </div>
        <div className="mt-1.5 space-y-1.5">
          <div className="h-1.5 w-[88%] rounded-full bg-muted" />
          <div className="h-1.5 w-[64%] rounded-full bg-muted" />
        </div>
      </div>

      <Chip className="-left-6 top-8 motion-safe:animate-float-y" icon={<ImageIcon className="size-3.5 text-stage-captions" />} label={t`AI caption`} />
      <Chip className="-right-4 top-24 [animation-delay:1.2s] motion-safe:animate-float-y" icon={<Languages className="size-3.5 text-stage-translate" />} label={t`Español · Français`} />
      <Chip className="-left-2 bottom-6 [animation-delay:0.6s] motion-safe:animate-float-y" icon={<Hand className="size-3.5 text-stage-sign" />} label={t`Sign language`} />
      <Chip className="-right-6 bottom-20 [animation-delay:1.8s] motion-safe:animate-float-y" icon={<ShieldCheck className="size-3.5 text-stage-validation" />} label={t`WCAG`} />
    </div>
  )
}

function Chip({ className, icon, label }: { className?: string; icon: React.ReactNode; label: string }) {
  return (
    <span className={cn("absolute inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[10.5px] font-semibold shadow-md", className)}>
      {icon}
      {label}
    </span>
  )
}

export function CapCard({ cap }: { cap: Capability }) {
  const { i18n } = useLingui()
  const Icon = cap.icon
  return (
    <div className="rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("mb-2.5 grid size-9 place-items-center rounded-[10px]", cap.tint)}>
        <Icon className="size-[18px]" />
      </div>
      <div className="text-[13.5px] font-semibold">{i18n._(cap.title)}</div>
      <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{i18n._(cap.blurb)}</div>
    </div>
  )
}

export function CapChip({ cap }: { cap: Capability }) {
  const { i18n } = useLingui()
  const Icon = cap.icon
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-brand-300">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", cap.tint)}>
        <Icon className="size-4" />
      </span>
      <span className="truncate text-[12.5px] font-semibold">{i18n._(cap.title)}</span>
    </div>
  )
}
