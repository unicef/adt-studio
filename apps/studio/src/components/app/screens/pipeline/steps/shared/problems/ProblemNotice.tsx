import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Copy, FileText, Info, ListFilter, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { NoticeStrip, type NoticePresentation } from "@/components/ui/notice-strip"
import { TONE_BUTTON, type NoticeTone } from "@/components/ui/notice-tone"
import { Collapsible, CollapseChevron } from "../list/Collapsible"
import { ProblemActionButton } from "./ProblemActionButton"
import { problemTone } from "./problemTone"
import type { ProblemLevel, ProblemPage } from "./useDescribeProblem"

export interface ProblemAction {
  label: ReactNode
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
  disabledReason?: ReactNode
}

interface ProblemControls {
  quiet: string
  toggle: string
  action: (tone: NoticeTone) => string
  reason: string
  panel: string
  pre: string
  copy: string
}

const FOCUS_RING = cn("outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--tint,var(--chrome-hex,#d97706))_55%,transparent)]")
const ON_COLOR_FOCUS = cn("outline-none focus-visible:ring-2 focus-visible:ring-white/70")

const CONTROLS: Record<NoticePresentation, ProblemControls> = {
  strip: {
    quiet: cn("flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted", FOCUS_RING),
    toggle: cn("flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", FOCUS_RING),
    action: (tone) =>
      cn(
        "h-7 rounded-lg px-2.5 text-[12px] font-semibold aria-disabled:cursor-default aria-disabled:bg-muted! aria-disabled:text-muted-foreground!",
        FOCUS_RING,
        TONE_BUTTON[tone],
      ),
    reason: cn("pl-6.5 text-foreground/70"),
    panel: cn("flex items-start gap-3 border-t bg-muted/40 px-5 py-3"),
    pre: cn("text-muted-foreground"),
    copy: cn("text-muted-foreground hover:bg-muted hover:text-foreground"),
  },
  inline: {
    quiet: cn("flex h-6 items-center gap-1 rounded-md bg-white/15 px-2 text-[11.5px] font-semibold text-white transition-colors hover:bg-white/25", ON_COLOR_FOCUS),
    toggle: cn("flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white", ON_COLOR_FOCUS),
    action: () =>
      cn(
        "ml-auto h-6 rounded-md bg-white px-2 text-[11.5px] font-semibold text-[color:var(--next-hex,#0f172a)] hover:bg-white/90",
        ON_COLOR_FOCUS,
        "aria-disabled:cursor-default aria-disabled:bg-white/20! aria-disabled:text-white/70!",
      ),
    reason: cn("pl-7 text-white/80"),
    panel: cn("mt-2 flex items-start gap-3 rounded-lg bg-black/15 px-3 py-2.5"),
    pre: cn("text-white/85"),
    copy: cn("text-white/80 hover:bg-white/15 hover:text-white"),
  },
}

export function ProblemNotice({
  level,
  hex,
  icon,
  title,
  body,
  details,
  pages = [],
  onOpenPage,
  action,
  onShowItems,
  presentation = "strip",
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
  presentation?: NoticePresentation
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const tone = problemTone(level)
  const controls = CONTROLS[presentation]

  const copy = () => {
    if (!details) return
    void navigator.clipboard?.writeText(details).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <NoticeStrip
      tone={tone}
      presentation={presentation}
      hex={hex}
      icon={icon}
      title={title}
      body={body}
      role={level === "blocked" ? "alert" : "status"}
      footer={
        details ? (
          <Collapsible open={open}>
            <div className={controls.panel}>
              <pre className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed", controls.pre)}>{details}</pre>
              <button
                type="button"
                onClick={copy}
                aria-label={t`Copy details`}
                className={cn("grid size-7 shrink-0 place-items-center rounded-md transition-colors", controls.copy)}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          </Collapsible>
        ) : null
      }
    >
      {onShowItems && (
        <button type="button" onClick={onShowItems} className={controls.quiet}>
          <ListFilter className="size-3" />
          <Trans>Show them</Trans>
        </button>
      )}
      {pages.map((page) => (
        <button key={page.pageId} type="button" onClick={() => onOpenPage?.(page.pageId)} className={controls.quiet}>
          <FileText className="size-3" />
          <Trans>Open page {page.pageNumber}</Trans>
        </button>
      ))}
      {details && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={controls.toggle}>
          <Trans>Details</Trans>
          <CollapseChevron open={open} />
        </button>
      )}
      {action && <ProblemActionButton action={action} className={controls.action(tone)} />}
      {action?.disabled && action.disabledReason && (
        <span
          aria-hidden
          className={cn(
            "flex basis-full items-center gap-1 text-[11.5px] leading-snug animate-in fade-in duration-200 motion-reduce:animate-none",
            controls.reason,
          )}
        >
          <Info className="size-3 shrink-0" />
          {action.disabledReason}
        </span>
      )}
    </NoticeStrip>
  )
}
