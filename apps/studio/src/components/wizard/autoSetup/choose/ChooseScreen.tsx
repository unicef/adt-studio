import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { Plug, ShieldCheck } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { useApiKey } from "@/hooks/use-api-key"
import { BackButton, ENTER, PrimaryButton, ScreenShell } from "../ui"
import { AiPill, AutoScene, ManualScene } from "./scenes"
import { useSampledPages } from "./useSampledPages"


type SetupMode = "auto" | "manual"

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 bg-card transition-colors duration-200", checked ? "border-brand-600" : "border-muted-foreground/35 group-hover:border-muted-foreground/60")}>
      <span className={cn("size-3 rounded-full bg-brand-600 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", checked ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
    </span>
  )
}

/** One setup option as a radio card: the whole card selects it; Continue commits the choice. */
function OptionCard({ value, checked, onSelect, disabled, scene, badge, title, titleAddon, summary, footer, delay = 0 }: { titleAddon?: ReactNode; value: SetupMode; checked: boolean; onSelect: (value: SetupMode) => void; disabled?: boolean; scene: ReactNode; badge?: ReactNode; title: ReactNode; summary: ReactNode; footer?: ReactNode; delay?: number }) {
  return (
    <label
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group relative flex flex-col rounded-[30px] border-2 bg-card/70 p-3 text-left backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-200",
        ENTER,
        disabled ? "cursor-not-allowed border-border" : "cursor-pointer hover:-translate-y-1 active:scale-[0.99]",
        checked ? "border-brand-500 bg-brand-50/60 shadow-[0_30px_70px_-28px_rgba(43,127,255,0.6)] ring-4 ring-brand-100" : !disabled && "border-border shadow-[0_20px_50px_-30px_rgba(15,23,42,0.25)] hover:border-brand-200 hover:shadow-[0_26px_60px_-30px_rgba(43,127,255,0.35)]",
      )}
    >
      <input type="radio" name="setup-mode" value={value} checked={checked} disabled={disabled} onChange={() => onSelect(value)} className="sr-only" />
      <div className="relative h-[210px] overflow-hidden rounded-[22px]">
        <div className="absolute left-1/2 top-1/2 h-[calc(100%/1.3)] w-[calc(100%/1.3)] -translate-x-1/2 -translate-y-1/2 scale-[1.3]">{scene}</div>
        {!disabled && (
          <span className="absolute right-3 top-3 grid place-items-center rounded-full bg-card/90 p-1 shadow-[0_4px_12px_rgba(15,23,42,0.15)] backdrop-blur">
            <RadioDot checked={checked} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-0.5 text-[25px] font-bold tracking-[-0.02em]">{title}</p>
          {titleAddon}
          {badge}
        </div>
        <p className={cn("mt-2 text-[16px] leading-snug text-muted-foreground transition-opacity duration-300", disabled && "opacity-60")}>{summary}</p>
        {footer && <div className="mt-auto pt-4">{footer}</div>}
      </div>
    </label>
  )
}

/**
 * Choose — how the book gets set up. Two radio cards (AI recommended and preselected, manual a
 * real but quieter peer) and one Continue. Without an AI provider the AI card stays visible but
 * disabled, pointing to the provider settings, and manual is selected.
 */
export function ChooseScreen({ onAuto, onManual, onBack }: { onAuto: () => void; onManual: () => void; onBack: () => void }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const providerConnected = useApiKey().hasStructuredTextProvider
  const [picked, setPicked] = useState<SetupMode>("auto")
  const mode: SetupMode = providerConnected ? picked : "manual"
  const sampled = useSampledPages(file, { count: 3, width: 240 })

  return (
    <ScreenShell>
        <div className="m-auto flex w-full flex-col items-center gap-5 pb-8 pt-3">
          <div className={cn("flex flex-col items-center gap-3 pt-2 text-center", ENTER)}>
            <h1 className="text-[52px] font-bold leading-[1.05] tracking-[-0.035em]">
              <Trans>
                How should we{" "}
                <span className="bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent">set it up</span>?
              </Trans>
            </h1>
            <p className="max-w-[700px] text-[16px] leading-relaxed text-muted-foreground">
              <Trans>Let AI pick the settings, or choose them yourself.</Trans>
            </p>
          </div>

          <div role="radiogroup" aria-label={t`How to set up the book`} className="grid w-full max-w-[1120px] grid-cols-[1.25fr_1fr] gap-6">
            <OptionCard
              value="auto"
              checked={mode === "auto"}
              onSelect={setPicked}
              disabled={!providerConnected}
              delay={160}
              scene={<AutoScene pages={sampled.pages} loading={sampled.isLoading} disabled={!providerConnected} selected={mode === "auto"} />}
              badge={
                providerConnected ? (
                  <span className="inline-flex h-7 items-center rounded-full border border-brand-200 bg-card px-2.5 text-[11.5px] font-semibold text-brand-700">
                    <Trans>Recommended</Trans>
                  </span>
                ) : (
                  <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-[11.5px] font-semibold text-muted-foreground">
                    <Plug className="size-3" />
                    <Trans>Needs an AI provider</Trans>
                  </span>
                )
              }
              title={<Trans>Let AI set it up</Trans>}
              titleAddon={<AiPill key={mode} pulse={mode === "auto"} muted={!providerConnected} />}
              summary={<Trans>Reads your book and picks the settings for you.</Trans>}
              footer={
                !providerConnected && (
                  <Link to="/settings/providers" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-card px-4 text-[13.5px] font-semibold transition-colors hover:border-brand-300 hover:bg-brand-50/60">
                    <Plug className="size-4 text-brand-600" />
                    <Trans>Connect an AI provider</Trans>
                  </Link>
                )
              }
            />
            <OptionCard
              value="manual"
              checked={mode === "manual"}
              onSelect={setPicked}
              delay={230}
              scene={<ManualScene selected={mode === "manual"} />}
              title={<Trans>Set it up myself</Trans>}
              summary={<Trans>Choose every setting yourself, step by step.</Trans>}
            />
          </div>

          <p className={cn("-mt-1 inline-flex items-center gap-2 text-[13px] text-muted-foreground", ENTER)} style={{ animationDelay: "300ms" }}>
            <ShieldCheck className="size-4 shrink-0 text-brand-600" />
            <Trans>You&apos;ll review everything before the book is created.</Trans>
          </p>

          <div className={cn("-mt-2 flex items-center gap-3", ENTER)} style={{ animationDelay: "340ms" }}>
            <BackButton onClick={onBack} />
            <PrimaryButton onClick={mode === "auto" ? onAuto : onManual}>
              <Trans>Continue</Trans>
            </PrimaryButton>
          </div>
        </div>
    </ScreenShell>
  )
}
