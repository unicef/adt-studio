import { memo, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export interface TranslateFieldProps {
  value: string
  onCommit: (next: string) => void
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  lang?: string
  className?: string
}

const FIELD = cn(
  "block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] leading-relaxed text-foreground",
  "transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
  "placeholder:italic placeholder:text-muted-foreground",
  "hover:bg-muted/60 focus:bg-background focus:outline-none",
  "focus:border-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_55%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_22%,transparent)]",
  "disabled:cursor-default disabled:hover:bg-transparent",
)

export const TranslateField = memo(function TranslateField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  disabled = false,
  lang,
  className,
}: TranslateFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const shown = disabled ? value : (draft ?? value)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + 2}px`
  }, [shown])

  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (next !== value.trim()) onCommit(next)
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={shown}
      disabled={disabled}
      lang={lang}
      dir="auto"
      spellCheck
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && draft !== null) {
          event.preventDefault()
          event.stopPropagation()
          setDraft(null)
        }
        if ((event.key === "Home" || event.key === "End") && !event.metaKey && !event.ctrlKey) {
          event.preventDefault()
          const el = event.currentTarget
          const at = event.key === "Home" ? 0 : el.value.length
          el.setSelectionRange(event.shiftKey ? Math.min(at, el.selectionStart) : at, event.shiftKey ? Math.max(at, el.selectionEnd) : at)
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          commit()
        }
      }}
      className={cn(FIELD, className)}
    />
  )
})
