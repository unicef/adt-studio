import { Trans, useLingui } from "@lingui/react/macro"
import { PanelRightClose, Sparkles } from "lucide-react"
import type { AiEditHistoryTurn } from "@/api/client"
import { cn } from "@/lib/utils"

function Composer({ placeholder }: { placeholder: string }) {
  return (
    <div className="border-t p-3">
      <div className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-2.5 transition-[border-color,box-shadow] focus-within:border-brand-400 focus-within:shadow-[0_0_0_3px_var(--brand-50)]">
        <Sparkles className="size-3.5 shrink-0 text-brand-600" />
        <input
          type="text"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}

export function Shell({
  title,
  meta,
  children,
  composerPlaceholder,
  composer,
  onCollapse,
}: {
  title: React.ReactNode
  meta: React.ReactNode
  children: React.ReactNode
  composerPlaceholder: string
  composer?: React.ReactNode
  onCollapse: () => void
}) {
  const { t } = useLingui()
  return (
    <div className="flex h-full w-[326px] flex-col border-l bg-card">
      <div className="flex items-center gap-2 border-b px-3.5 py-3">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{meta}</span>
        <button
          type="button"
          onClick={onCollapse}
          title={t`Hide the AI panel`}
          aria-label={t`Hide the AI panel`}
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>
      {children}
      {composer ?? <Composer placeholder={composerPlaceholder} />}
    </div>
  )
}

export function HistoryTurn({ turn }: { turn: AiEditHistoryTurn }) {
  const { t, i18n } = useLingui()
  const applied = turn.verify?.applied ?? true
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[250px] rounded-[11px] rounded-br-[3px] border border-brand-200 bg-brand-50 px-3 py-2 text-[12.5px] leading-relaxed text-brand-900">
          {turn.instruction}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(turn.timestamp).toLocaleTimeString(i18n.locale, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="max-w-[260px] rounded-[11px] rounded-bl-[3px] border bg-muted px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
          {turn.attempts.at(-1)?.reasoning ?? turn.verify?.reason ?? t`No reasoning recorded.`}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-[10px]",
              applied ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-700",
            )}
          >
            {applied ? t`applied` : t`not applied`}
          </span>
          <button type="button" className="text-[10px] font-semibold text-brand-700 hover:underline">
            <Trans>View diff</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}
