import { FlaskConical, Sparkles, ShieldCheck, RefreshCw, ArrowUpCircle } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { OB_LOGO_SRC } from "../theme"

const POINTS = [
  {
    Icon: Sparkles,
    title: <Trans>New features first</Trans>,
    body: (
      <Trans>
        Beta builds ship from our <code>develop</code> staging branch — the
        newest tools land here long before the stable release.
      </Trans>
    ),
  },
  {
    Icon: ShieldCheck,
    title: <Trans>Safe to explore</Trans>,
    body: (
      <Trans>
        It's a preview, so expect the odd rough edge. Your books stay on this
        device and every result is versioned — nothing is overwritten.
      </Trans>
    ),
  },
  {
    Icon: RefreshCw,
    title: <Trans>Switch builds anytime</Trans>,
    body: (
      <Trans>
        Open <b>Software update</b> in the top bar to browse the beta library
        and install — or roll back to — any staging build.
      </Trans>
    ),
  },
] as const

/**
 * Explains the beta program: what a beta build is, that it's safe to explore,
 * and how to install / roll back to any staging build via the update dialog's
 * beta library. Informational (no demo) — matches the light onboarding card.
 */
export function BetaScene() {
  return (
    <div className="animate-onboarding-fade-in flex h-full w-full flex-col items-center justify-center px-14 text-center">
      <img
        src={OB_LOGO_SRC}
        alt=""
        aria-hidden
        className="h-16 w-16 rounded-[22%] object-contain drop-shadow-[0_14px_36px_rgba(var(--ob-accent-rgb),0.4)]"
      />

      <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--ob-accent-tint)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ob-accent-strong)]">
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={2.4} />
        <Trans>How the beta works</Trans>
      </span>

      <h2 className="mt-4 text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-[#0a0a0a]">
        <Trans>You're testing an early build.</Trans>
      </h2>
      <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-[#737373]">
        <Trans>
          Here's what that means — and how to try out the very latest staging
          builds as they land.
        </Trans>
      </p>

      <div className="mt-8 grid w-full max-w-[760px] grid-cols-3 gap-4 text-left">
        {POINTS.map(({ Icon, title, body }, i) => (
          <div
            key={i}
            className="rounded-2xl border border-black/[0.07] bg-white/70 p-4 shadow-[0_10px_30px_-18px_rgba(var(--ob-accent-rgb),0.5)]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--ob-accent-tint)]">
              <Icon className="h-[18px] w-[18px] text-[var(--ob-accent-strong)]" strokeWidth={2.2} />
            </span>
            <div className="mt-3 text-[14px] font-semibold text-[#0a0a0a]">{title}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#737373] [&_code]:rounded [&_code]:bg-[var(--ob-accent-tint)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-semibold [&_code]:text-[var(--ob-accent-strong)] [&_b]:font-semibold [&_b]:text-[#0a0a0a]">
              {body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-7 inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ob-accent-strong)]">
        <ArrowUpCircle className="h-4 w-4" strokeWidth={2.2} />
        <Trans>Look for the update badge in the top bar to grab newer builds.</Trans>
      </div>
    </div>
  )
}
