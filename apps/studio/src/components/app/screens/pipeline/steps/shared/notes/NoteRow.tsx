import type { ReactNode } from "react"
import { ArrowRight, Info, Loader2, type LucideIcon } from "lucide-react"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { cn } from "@/lib/utils"

export interface NoteAction {
  label: ReactNode
  onClick: () => void
  disabled?: boolean
  disabledReason?: ReactNode
  primary?: boolean
  quiet?: boolean
}

export interface StepNote {
  id: string
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
  actions?: NoteAction[]
  extra?: ReactNode
  attention?: boolean
  busy?: boolean
}

export function NoteRow({ note, hex }: { note: StepNote; hex: string }) {
  const Icon = note.busy ? Loader2 : note.icon
  const reason = note.actions?.find((action) => action.disabled && action.disabledReason)?.disabledReason
  return (
    <div className="flex gap-3 px-4 py-3">
      <span
        className={cn("grid size-8 shrink-0 place-items-center rounded-lg", !note.attention && "bg-muted text-muted-foreground")}
        style={note.attention ? { background: tint(hex, 0.12), color: hex } : undefined}
      >
        <Icon className={cn("size-4", note.busy && "animate-spin motion-reduce:animate-none")} strokeWidth={2.1} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-semibold leading-snug text-foreground">{note.title}</p>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{note.body}</p>
        {note.extra}
        {note.actions && note.actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {note.actions.map((action, index) =>
              action.primary ? (
                <button
                  key={index}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className="flex h-7 items-center rounded-md px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                  style={{ background: hex }}
                >
                  {action.label}
                </button>
              ) : (
                <button
                  key={index}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    "flex items-center gap-1 rounded text-[12.5px] font-semibold underline-offset-4 transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50",
                    action.quiet && "font-medium text-muted-foreground hover:text-foreground",
                  )}
                  style={action.quiet ? undefined : { color: hex }}
                >
                  {action.label}
                  {!action.quiet && note.actions?.length === 1 && <ArrowRight className="size-3.5" />}
                </button>
              ),
            )}
          </div>
        )}
        {reason && (
          <p className="flex items-center gap-1.5 text-[11.5px] leading-snug text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
            <Info className="size-3 shrink-0" />
            {reason}
          </p>
        )}
      </div>
    </div>
  )
}
