import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, Copy, FileText, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProblemLevel, ProblemPage } from "./useDescribeProblem"

export interface ProblemAction {
  label: ReactNode
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
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
}: {
  level: ProblemLevel | "resume"
  hex: string
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
  details?: string | null
  pages?: ProblemPage[]
  onOpenPage?: (pageId: string) => void
  action?: ProblemAction
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const banner = level === "blocked" || level === "resume"
  const fill = level === "blocked" ? "#dc2626" : level === "resume" ? hex : "#b45309"

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
      className={cn(
        "overflow-hidden rounded-xl animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none",
        banner ? "text-white shadow-sm" : "border border-amber-200 bg-card dark:border-amber-500/30",
      )}
      style={banner ? { background: fill } : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-5 py-4">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            banner ? "bg-white/20" : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
          )}
        >
          <Icon className="size-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-[240px] flex-1">
          <p className={cn("text-[14px] font-semibold leading-snug", !banner && "text-foreground")}>{title}</p>
          <p className={cn("mt-0.5 text-[12.5px] leading-relaxed", banner ? "text-white/85" : "text-muted-foreground")}>{body}</p>
          {(pages.length > 0 || details) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {pages.map((page) => (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => onOpenPage?.(page.pageId)}
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-colors",
                    banner ? "bg-white/15 hover:bg-white/25" : "border bg-background hover:bg-muted",
                  )}
                >
                  <FileText className="size-3" />
                  <Trans>Open page {page.pageNumber}</Trans>
                </button>
              ))}
              {details && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((value) => !value)}
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium transition-colors",
                    banner ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Trans>Details</Trans>
                  <ChevronDown className={cn("size-3 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} />
                </button>
              )}
            </div>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-[background-color,opacity] disabled:pointer-events-none disabled:opacity-60",
              banner ? "bg-white hover:bg-white/90" : "text-white hover:opacity-90",
            )}
            style={banner ? { color: fill } : { background: fill }}
          >
            {action.icon && <action.icon className="size-3.5" />}
            {action.label}
          </button>
        )}
      </div>
      {details && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <div className={cn("flex items-start gap-3 border-t px-5 py-3", banner ? "border-white/20 bg-black/15" : "bg-muted/40")}>
              <pre className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed", banner ? "text-white/90" : "text-muted-foreground")}>
                {details}
              </pre>
              <button
                type="button"
                onClick={copy}
                aria-label={t`Copy details`}
                title={t`Copy details`}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md transition-colors",
                  banner ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
