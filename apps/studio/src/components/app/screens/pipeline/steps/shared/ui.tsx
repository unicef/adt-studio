import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { RailCollapseButton } from "@/components/app/screens/pipeline/rail/SideRail"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"

export function StepBody({
  title,
  meta,
  actions,
  children,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto flex w-[820px] flex-col gap-4 py-7">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h1>
          {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
        {children}
      </div>
    </ScrollArea>
  )
}

export function StepCard({
  children,
  muted,
  accent,
  className,
}: {
  children: React.ReactNode
  muted?: boolean
  accent?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3.5 transition-opacity",
        muted && "opacity-50",
        className,
      )}
      style={accent ? { borderColor: tint(accent, 0.3) } : undefined}
    >
      {children}
    </div>
  )
}

export function StepGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  )
}

export interface EditableTextProps {
  value: string
  onSave: (next: string) => void
  isSaving?: boolean
  placeholder?: string
  multiline?: boolean
  ariaLabel: string
  className?: string
}

export function EditableText({
  value,
  onSave,
  isSaving,
  placeholder,
  multiline = true,
  ariaLabel,
  className,
}: EditableTextProps) {
  const { t } = useLingui()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onSave(next)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={t`Edit ${ariaLabel}`}
        className={cn(
          "group flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted",
          className,
        )}
      >
        <span className={cn("flex-1", !value && "text-muted-foreground")}>{value || placeholder}</span>
        {isSaving ? (
          <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    )
  }

  const shared = {
    ref: ref as never,
    value: draft,
    "aria-label": ariaLabel,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") cancel()
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        commit()
      }
    },
    className: cn(
      "w-full resize-y rounded-md border bg-background px-1.5 py-1 outline-none focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--brand-50)]",
      className,
    ),
  }

  return multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />
}

export function RowAction({
  icon: Icon,
  label,
  onClick,
  active,
  tone = "default",
}: {
  icon: typeof Check
  label: string
  onClick: () => void
  active?: boolean
  tone?: "default" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md border transition-colors",
        active && "border-brand-300 bg-brand-50 text-brand-700",
        !active && tone === "danger" && "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        !active && tone === "default" && "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-3" />
    </button>
  )
}

export interface RailEntry {
  key: string | null
  title: string
  count: number
}

export function StepRail({
  heading,
  hex,
  entries,
  activeKey,
  onSelect,
  footer,
}: {
  heading: React.ReactNode
  hex: string
  entries: RailEntry[]
  activeKey?: string | null
  onSelect?: (key: string | null) => void
  footer?: React.ReactNode
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {heading}
        </span>
        <RailCollapseButton className="-mr-1 -my-1" />
      </div>

      <ScrollArea className="-mx-1 min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 px-1">
          {entries.map((entry) => {
            const active = entry.key === activeKey
            return (
              <button
                key={entry.key ?? "__unassigned"}
                type="button"
                onClick={() => onSelect?.(entry.key)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[11px] transition-colors",
                  active ? "font-semibold" : "text-muted-foreground hover:bg-muted",
                )}
                style={active ? { background: tint(hex, 0.12), color: hex } : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                <span className="font-mono text-[10px] opacity-70">{entry.count}</span>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {footer && (
        <div className="border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">{footer}</div>
      )}
    </>
  )
}

export function StepEmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-12 text-[12.5px] text-muted-foreground">
      {children}
    </div>
  )
}

export function SaveError({ error }: { error: Error | null }) {
  if (!error) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
      <X className="size-3.5 shrink-0" />
      <Trans>Could not save your change: {error.message}</Trans>
    </div>
  )
}
