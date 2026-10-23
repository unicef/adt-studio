import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Copy, FileText, ListFilter, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapseChevron } from "../list/Collapsible"
import { ProblemActionButton } from "./ProblemActionButton"
import { problemTone, TONE_BORDER, TONE_BUTTON, TONE_TILE } from "./problemTone"
import type { ProblemLevel, ProblemPage } from "./useDescribeProblem"

export interface ProblemAction {
  label: ReactNode
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
  disabledReason?: ReactNode
}

const QUIET_BUTTON =
  "flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted"

export function ProblemNotice({
  level,
  icon: Icon,
  title,
  body,
  details,
  pages = [],
  onOpenPage,
  action,
  onShowItems,
}: {
  level: ProblemLevel | "resume"
  hex?: string
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
  details?: string | null
  pages?: ProblemPage[]
  onOpenPage?: (pageId: string) => void
  action?: ProblemAction
  onShowItems?: () => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const tone = problemTone(level)

  const copy = () => {
    if (!details) return
    void navigator.clipboard?.writeText(details).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section
      role={level === "blocked" ? "alert" : "status"}
      data-tone={tone}
      className={cn(
        "overflow-hidden rounded-xl border bg-card animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none",
        TONE_BORDER[tone],
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-5 py-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONE_TILE[tone])}>
          <Icon className="size-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-[240px] flex-1">
          <p className="text-[14px] font-semibold leading-snug text-foreground">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
          {(pages.length > 0 || details || onShowItems) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {onShowItems && (
                <button type="button" onClick={onShowItems} className={QUIET_BUTTON}>
                  <ListFilter className="size-3" />
                  <Trans>Show them</Trans>
                </button>
              )}
              {pages.map((page) => (
                <button key={page.pageId} type="button" onClick={() => onOpenPage?.(page.pageId)} className={QUIET_BUTTON}>
                  <FileText className="size-3" />
                  <Trans>Open page {page.pageNumber}</Trans>
                </button>
              ))}
              {details && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((value) => !value)}
                  className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Trans>Details</Trans>
                  <CollapseChevron open={open} />
                </button>
              )}
            </div>
          )}
        </div>
        {action && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ProblemActionButton
              action={action}
              className={cn(
                "h-8 rounded-lg px-3 text-[12.5px] font-semibold aria-disabled:cursor-default aria-disabled:bg-muted! aria-disabled:text-muted-foreground!",
                TONE_BUTTON[tone],
              )}
            />
            {action.disabled && action.disabledReason && (
              <p aria-hidden className="max-w-[240px] text-right text-[11.5px] leading-snug text-foreground/75 animate-in fade-in duration-200 motion-reduce:animate-none">
                {action.disabledReason}
              </p>
            )}
          </div>
        )}
      </div>
      {details && (
        <Collapsible open={open}>
          <div className="flex items-start gap-3 border-t bg-muted/40 px-5 py-3">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-muted-foreground">{details}</pre>
            <button
              type="button"
              onClick={copy}
              aria-label={t`Copy details`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </Collapsible>
      )}
    </section>
  )
}
