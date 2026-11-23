import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ChevronDown, Lock } from "lucide-react"
import { PagesStrip } from "./PagesStrip"

/**
 * One pick, explained: what was picked, what it means for the finished book,
 * why, and the pages that show it. Locked picks say they can't change later.
 */
export function PickRow({
  name,
  value,
  means,
  why,
  pages,
  images,
  locked,
  changed,
  extra,
}: {
  name: string
  value: string
  means: string
  why: string
  pages: number[]
  images: Record<number, string>
  locked: boolean
  /** The user's answer to a question changed this pick. */
  changed?: boolean
  extra?: ReactNode
}) {
  return (
    <details className="group rounded-lg border border-border bg-background">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {name}
            {locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal">
                <Lock className="h-3 w-3" aria-hidden />
                <Trans>Fixed once the book is created</Trans>
              </span>
            )}
            {changed && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 normal-case tracking-normal text-primary">
                <Trans>Changed by your answer</Trans>
              </span>
            )}
          </span>
          <span className="text-[15px] font-semibold text-foreground">{value}</span>
          <span className="text-sm text-muted-foreground">{why}</span>
        </span>
        <ChevronDown
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">
        <p className="text-sm text-foreground">
          <span className="font-medium">
            <Trans>What this means:</Trans>
          </span>{" "}
          {means}
        </p>
        {extra}
        {pages.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              <Trans>Seen on these pages:</Trans>
            </p>
            <PagesStrip pages={pages} images={images} />
          </div>
        )}
      </div>
    </details>
  )
}
