import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Puzzle } from "lucide-react"
import { cn } from "@/lib/utils"
import { CopyTextButton } from "./CopyTextButton"

/**
 * The repair request as people see it before copying: a header, the text in a
 * scrolling box, and Copy as the main action. The review's repair panel and
 * the "can't be read" canvas both use it, so the same request looks the same
 * wherever it appears.
 */
export function RepairRequest({
  text,
  copyValue = text,
  actions,
  className,
  textClassName,
  inert,
}: {
  /** What the box shows. */
  text: string
  /** What Copy puts on the clipboard, when it carries more than the box shows. */
  copyValue?: string
  /** Extra controls after Copy. */
  actions?: ReactNode
  className?: string
  textClassName?: string
  /** Set while something covers the request, so it leaves the tab order. */
  inert?: boolean
}) {
  const { t } = useLingui()
  return (
    <div inert={inert} className={cn("flex min-h-0 flex-col gap-3 text-left", className)}>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <Puzzle aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground"><Trans>Repair request</Trans></h3>
          <p className="text-xs text-muted-foreground">
            <Trans>Give it to your AI assistant together with the unzipped archive.</Trans>
          </p>
        </div>
      </div>
      <pre
        aria-label={t`Repair request`}
        tabIndex={0}
        className={cn(
          "min-h-[120px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/50 px-3.5 py-3 font-sans text-[12.5px] leading-relaxed text-foreground",
          textClassName,
        )}
      >
        {text}
      </pre>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <CopyTextButton value={copyValue} primary>
          <Trans>Copy repair request</Trans>
        </CopyTextButton>
        {actions}
      </div>
    </div>
  )
}
