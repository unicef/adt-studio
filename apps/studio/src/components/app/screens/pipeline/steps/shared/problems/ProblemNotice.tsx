import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Copy, FileText, Info, ListFilter, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapseChevron } from "../list/Collapsible"
import { ProblemActionButton } from "./ProblemActionButton"
import { problemTone, type ProblemTone } from "./problemTone"
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

const LOOK: Record<ProblemTone, { box: string; icon: string; button: string }> = {
  attention: {
    box: "border-[color-mix(in_srgb,var(--tint,#d97706)_35%,transparent)]",
    icon: "text-[var(--tint,#d97706)]",
    button: "bg-[var(--tint,#d97706)] text-white hover:opacity-90",
  },
  critical: {
    box: "border-destructive/40",
    icon: "text-destructive",
    button: "bg-destructive text-white hover:bg-destructive/90",
  },
}

export function ProblemNotice({
  level,
  hex,
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
  const look = LOOK[tone]

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
      style={hex ? { ["--tint" as string]: hex } : undefined}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none",
        look.box,
      )}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 pr-2 pl-3">
        <Icon className={cn("size-4 shrink-0", look.icon)} strokeWidth={2.3} />
        <p className="min-w-[200px] flex-1 text-[13px] leading-snug">
          <span className="font-semibold text-foreground">{title}</span>
          <span className="text-muted-foreground"> · {body}</span>
        </p>
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
        {action && (
          <ProblemActionButton
            action={action}
            className={cn(
              "h-7 rounded-lg px-2.5 text-[12px] font-semibold aria-disabled:cursor-default aria-disabled:bg-muted! aria-disabled:text-muted-foreground!",
              look.button,
            )}
          />
        )}
        {action?.disabled && action.disabledReason && (
          <span aria-hidden className="flex basis-full items-center gap-1 pl-6.5 text-[11.5px] leading-snug text-foreground/70 animate-in fade-in duration-200 motion-reduce:animate-none">
            <Info className="size-3 shrink-0" />
            {action.disabledReason}
          </span>
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
