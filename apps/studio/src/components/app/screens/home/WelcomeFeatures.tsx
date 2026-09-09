import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALL_FEATURES } from "./welcomeFeatures.data"

function DocsLink() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/onboarding" })}
      className="inline-flex w-fit items-center gap-1.5 rounded-md px-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      <Trans>Read the docs</Trans>
      <ArrowUpRight className="size-3" />
    </button>
  )
}

/**
 * The reader-experience band, as a bento: the copy occupies a cell of the same grid
 * as the outputs rather than a column of its own, so a four-column, three-row grid
 * holds the copy plus all nine outputs with no leftover track. Rows take at least
 * their content height and share whatever is left, so the band fills the screen
 * without squeezing any card.
 */
export function WelcomeFeatures() {
  return (
    <div className="mt-10 grid min-h-0 flex-1 auto-rows-[minmax(max-content,1fr)] grid-cols-2 gap-3.5 lg:grid-cols-4">
      <div className="flex flex-col justify-between gap-6 px-1 py-1 lg:row-span-3">
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-brand-600">
            <Trans>The reader experience</Trans>
          </div>
          <h2 className="mt-2.5 text-[30px] font-bold leading-[1.05] tracking-[-0.025em]">
            <Trans>One book.</Trans>
            <br />
            <span className="text-brand-700">
              <Trans>Every way to read.</Trans>
            </span>
          </h2>
          <p className="mt-3.5 text-[14px] leading-relaxed text-muted-foreground">
            <Trans>From a single PDF, every edition gains the ways different readers need to reach it.</Trans>
          </p>
        </div>
        <DocsLink />
      </div>

      {ALL_FEATURES.map((f) => {
        const Icon = f.icon
        return (
          <div
            key={f.key}
            className="flex flex-col justify-center gap-2.5 rounded-2xl border bg-card/60 px-4 py-4 transition-colors duration-200 hover:bg-card"
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", f.soft)}>
              <Icon className="size-[19px]" />
            </span>
            <div>
              <div className="text-[14px] font-semibold">{f.label}</div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{f.blurb}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
