import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALL_FEATURES } from "./welcomeFeatures.data"

function DocsLink() {
  return (
    <Link
      to="/onboarding"
      className="inline-flex items-center gap-1.5 rounded-md px-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      <Trans>Read the docs</Trans>
      <ArrowUpRight className="size-3" />
    </Link>
  )
}

export function WelcomeFeatures() {
  return (
    <div className="mt-[26px] grid min-h-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col justify-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
          <Trans>The reader experience</Trans>
        </div>
        <h2 className="mt-2 text-[26px] font-bold leading-[1.12] tracking-[-0.02em]">
          <Trans>One book.</Trans>
          <br />
          <span className="text-brand-700">
            <Trans>Every way to read.</Trans>
          </span>
        </h2>
        <p className="mt-3 max-w-[38ch] text-[13px] leading-relaxed text-muted-foreground">
          <Trans>From a single PDF, every edition gains the ways different readers need to reach it.</Trans>
        </p>
        <div className="mt-4">
          <DocsLink />
        </div>
      </div>

      <div className="grid grid-cols-1 content-between gap-x-8 gap-y-4 sm:grid-cols-2">
        {ALL_FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.key} className="flex items-start gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", f.soft)}>
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{f.label}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{f.blurb}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
