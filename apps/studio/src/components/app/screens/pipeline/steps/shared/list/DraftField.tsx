import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface DraftFieldProps {
  value: string
  onCommit: (next: string) => void
  ariaLabel: string
  placeholder?: string
  multiline?: boolean
  disabled?: boolean
  required?: boolean
  requiredMessage?: string
  id?: string
  className?: string
}

const FIELD =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-[13px] leading-relaxed text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:bg-muted/40 disabled:text-muted-foreground"

export function DraftField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  multiline = false,
  disabled = false,
  required = false,
  requiredMessage,
  id,
  className,
}: DraftFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const messageId = useId()

  useEffect(() => {
    if (!warning) return
    const timer = window.setTimeout(() => setWarning(null), 4000)
    return () => window.clearTimeout(timer)
  }, [warning])
  const ref = useRef<HTMLTextAreaElement>(null)
  const shown = draft ?? value

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + 2}px`
  }, [shown])

  useEffect(() => {
    if (disabled) setDraft(null)
  }, [disabled])

  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (required && !next) {
      if (requiredMessage) setWarning(requiredMessage)
      return
    }
    if (next !== value.trim()) onCommit(next)
  }

  const shared = {
    id,
    value: shown,
    disabled,
    placeholder,
    "aria-label": ariaLabel,
    "aria-describedby": warning ? messageId : undefined,
    "aria-invalid": warning ? true : undefined,
    onBlur: commit,
    className: cn(FIELD, className),
  }

  const note: ReactNode = warning ? (
    <p id={messageId} role="status" className="mt-1 text-[11.5px] text-destructive animate-in fade-in duration-200 motion-reduce:animate-none">
      {warning}
    </p>
  ) : null

  if (multiline) {
    return (
      <>
      <textarea
        ref={ref}
        rows={2}
        {...shared}
        className={cn(shared.className, "resize-none overflow-hidden")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft !== null) {
            event.preventDefault()
            setDraft(null)
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            commit()
          }
        }}
      />
      {note}
      </>
    )
  }

  return (
    <>
    <input
      type="text"
      {...shared}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && draft !== null) {
          event.preventDefault()
          setDraft(null)
        }
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
      }}
    />
    {note}
    </>
  )
}
