import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ArrowUpRight } from "lucide-react"

export function DocsLink() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/onboarding" })}
      className="inline-flex items-center gap-1.5 rounded-md px-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      <Trans>Read the docs</Trans>
      <ArrowUpRight className="size-3" />
    </button>
  )
}

export function SectionHeading({ title, subtitle }: { title: ReactNode; subtitle: ReactNode }) {
  return (
    <div className="mb-4 mt-[26px] flex items-baseline gap-4">
      <div>
        <div className="text-[15px] font-bold">{title}</div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</div>
      </div>
      <div className="ml-auto shrink-0">
        <DocsLink />
      </div>
    </div>
  )
}
