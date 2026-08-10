import { FlaskConical, DownloadCloud, Check } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { OB_PANEL_GRADIENT } from "../theme"

/* eslint-disable lingui/no-unlocalized-strings -- version identifiers, not UI copy */
const BUILDS = [
  { version: "v0.9.0-beta.2", current: true },
  { version: "v0.9.0-beta.1", current: false },
  { version: "v0.8.4-beta.6", current: false },
]
/* eslint-enable lingui/no-unlocalized-strings */

/** Mock of the in-app beta library — the panel demo for the beta page. */
function BetaLibraryDemo() {
  return (
    <div className="w-[300px] rounded-2xl bg-white p-5 shadow-[0_18px_44px_-12px_rgba(60,10,90,0.45)]">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--ob-accent-tint)]">
          <DownloadCloud className="h-4 w-4 text-[var(--ob-accent-strong)]" strokeWidth={2.2} />
        </span>
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-[#0a0a0a]">
            <Trans>Software update</Trans>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa0aa]">
            <Trans>Beta library</Trans>
          </div>
        </div>
      </div>

      <div className="mt-3.5 space-y-1.5">
        {BUILDS.map((b) => (
          <div
            key={b.version}
            className={
              "flex items-center justify-between rounded-lg px-2.5 py-2 " +
              (b.current ? "bg-[var(--ob-accent-tint)]" : "bg-[#f6f7f9]")
            }
          >
            <span className="text-[12px] font-semibold tabular-nums text-[#0a0a0a]">
              {b.version}
            </span>
            {b.current ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ob-accent-strong)]">
                <Check className="h-3 w-3" strokeWidth={3} />
                <Trans>Current</Trans>
              </span>
            ) : (
              <span className="rounded-md border border-black/[0.12] px-2 py-0.5 text-[10px] font-semibold text-[#0a0a0a]">
                <Trans>Install</Trans>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Explains the beta program using the same split layout as the feature pages:
 * left = eyebrow + heading + copy, right = a purple panel showing the in-app
 * beta library so users see how to test / roll back staging builds.
 */
export function BetaScene() {
  return (
    <div className="animate-onboarding-fade-in flex h-full w-full items-stretch gap-7 px-10 py-9">
      <div className="flex w-[45%] flex-col justify-center">
        <div
          className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--ob-accent-strong)" }}
        >
          <FlaskConical className="h-4 w-4" strokeWidth={2.4} />
          <Trans>How the beta works</Trans>
        </div>
        <h2 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-[#0a0a0a]">
          <Trans>You're testing an early build.</Trans>
        </h2>
        <p className="mt-4 max-w-[340px] text-[15px] leading-relaxed text-[#737373] [&_code]:rounded [&_code]:bg-[var(--ob-accent-tint)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:font-semibold [&_code]:text-[var(--ob-accent-strong)]">
          <Trans>
            New tools land here first, straight from our <code>develop</code>{" "}
            staging branch. It's a preview — so expect the odd rough edge, while
            your books stay on this device and every result stays versioned.
          </Trans>
        </p>
      </div>

      <div
        className="relative flex-1 overflow-hidden rounded-[22px]"
        style={{ background: OB_PANEL_GRADIENT }}
      >
        <span className="absolute left-6 top-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
          <Trans>Beta channel</Trans>
        </span>
        <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
          <BetaLibraryDemo />
        </div>
        <div className="absolute inset-x-6 bottom-6 text-[17px] font-semibold leading-snug text-white">
          <Trans>Switch or roll back builds anytime.</Trans>
        </div>
      </div>
    </div>
  )
}
