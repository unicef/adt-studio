import { Trans } from "@lingui/react/macro"
import { getPipelineStages } from "@/components/pipeline/stage-config"
import { cn } from "@/lib/utils"

const STAGES = getPipelineStages()

/**
 * A lightweight, non-interactive mockup of the Studio interface shown beneath
 * the welcome copy — the same "here's what you're stepping into" preview Aside
 * uses. Purely decorative; hidden from assistive tech.
 */
export function AppPreview({ className }: { className?: string }) {
  const previewStages = STAGES.slice(0, 6)

  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-t-xl border border-white/10 border-b-0 bg-[#0e1119]",
        "shadow-[0_-20px_60px_-30px_rgba(43,127,255,0.5)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <div className="ml-3 h-3.5 w-28 rounded-md bg-white/[0.06]" />
        <div className="ml-auto h-3.5 w-16 rounded-md bg-white/[0.06]" />
      </div>

      <div className="flex">
        <aside className="hidden w-40 shrink-0 flex-col gap-1 border-r border-white/[0.06] p-3 sm:flex">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-[#2b7fff] text-[9px] font-black text-white">
              A
            </span>
            <span className="text-[10px] font-semibold text-zinc-300">
              ADT Studio
            </span>
          </div>
          {previewStages.map((stage, i) => {
            const Icon = stage.icon
            return (
              <div
                key={stage.slug}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5",
                  i === 2 && "bg-white/[0.06]",
                )}
              >
                <Icon
                  className="h-3 w-3 shrink-0"
                  style={{ color: stage.hex }}
                  strokeWidth={2.2}
                />
                <span
                  className="h-1.5 rounded-full bg-white/10"
                  style={{ width: `${52 + ((i * 13) % 34)}%` }}
                />
              </div>
            )
          })}
        </aside>

        <div className="flex-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-3 w-24 rounded-md bg-white/[0.08]" />
            <div className="h-6 w-20 rounded-lg bg-[#2b7fff]/80" />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
              >
                <div
                  className={cn(
                    "mb-2 aspect-[3/4] rounded-md bg-gradient-to-br from-white/[0.07] to-white/[0.02]",
                    i === 0 &&
                      "animate-onboarding-shimmer bg-[linear-gradient(110deg,transparent_20%,rgba(43,127,255,0.18)_40%,transparent_60%)] bg-[length:200%_100%]",
                  )}
                />
                <div className="mb-1.5 h-1.5 w-3/4 rounded-full bg-white/10" />
                <div className="flex gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/50" />
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-400/50" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/50" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[10px] text-zinc-400">
              <Trans>Generating accessible edition…</Trans>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
