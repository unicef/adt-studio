import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, Copy } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/** The technical message behind an error (what the provider or the server said), folded away but always one click from view. */
export function ErrorDetails({ detail, className }: { detail: string; className?: string }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <div className={cn("flex w-full max-w-[520px] flex-col items-center", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        {open ? <Trans>Hide details</Trans> : <Trans>Show details</Trans>}
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Collapsible shown={open} className="w-full">
        <div inert={!open} className="pt-2">
          <div className="relative rounded-xl border bg-muted/50 py-2.5 pl-3 pr-10 text-left">
            <code className="block whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">{detail}</code>
            <button
              type="button"
              aria-label={t`Copy details`}
              onClick={() => {
                void navigator.clipboard?.writeText(detail)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1400)
              }}
              className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      </Collapsible>
    </div>
  )
}

/** What went wrong, what it means for the user, and what they can do next — the shape every auto-mode error uses. */
export function ErrorState({ title, body, actions, detail, status, className }: { title: ReactNode; body: ReactNode; actions: ReactNode; detail?: string; status?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 animate-[am-fade-up_0.4s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none", className)}>
      <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">{title}</h1>
      <p className="max-w-[540px] text-[16px] leading-relaxed text-muted-foreground">{body}</p>
      {status}
      <div className="mt-4 flex items-center gap-3">{actions}</div>
      {detail && <ErrorDetails detail={detail} className="mt-1" />}
    </div>
  )
}

export function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-5 text-[14px] font-medium transition-[background-color,transform] duration-150 hover:bg-muted/70 active:scale-[0.97]">
      {children}
    </button>
  )
}
