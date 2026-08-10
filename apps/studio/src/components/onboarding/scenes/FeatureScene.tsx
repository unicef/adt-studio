import type { ReactNode } from "react"
import { FEATURE_META, type FeatureSlug } from "./shared/featureMeta"

/**
 * Split feature page: left = eyebrow (exact stage icon+color) + heading + copy,
 * right = a blue demo panel hosting an auto-playing cursor demo. The flow chrome
 * (Back · dots · Next) is rendered by OnboardingFlow, so this fills the content
 * area only and never collides with the footer.
 */
export function FeatureScene({
  slug,
  eyebrow,
  title,
  desc,
  panelLabel,
  caption,
  children,
}: {
  slug: FeatureSlug
  eyebrow: ReactNode
  title: ReactNode
  desc: ReactNode
  panelLabel: ReactNode
  caption: ReactNode
  children: ReactNode
}) {
  const { Icon, hex, panel } = FEATURE_META[slug]
  return (
    <div className="animate-onboarding-fade-in flex h-full w-full items-stretch gap-7 px-10 py-9">
      <div className="flex w-[45%] flex-col justify-center">
        <div
          className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: hex }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.4} />
          {eyebrow}
        </div>
        <h2 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--ob-fg)]">
          {title}
        </h2>
        <p className="mt-4 max-w-[330px] text-[15px] leading-relaxed text-[var(--ob-muted)]">
          {desc}
        </p>
      </div>

      <div
        className="relative flex-1 overflow-hidden rounded-[22px]"
        style={{ background: panel }}
      >
        <span className="absolute left-6 top-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
          {panelLabel}
        </span>
        <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
          {children}
        </div>
        <div className="absolute inset-x-6 bottom-6 text-[17px] font-semibold leading-snug text-white">
          {caption}
        </div>
      </div>
    </div>
  )
}
