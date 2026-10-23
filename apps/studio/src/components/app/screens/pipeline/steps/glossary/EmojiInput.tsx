import { useState } from "react"
import { cn } from "@/lib/utils"

export function EmojiInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  disabled = false,
  id,
}: {
  value: string[]
  onChange: (next: string[]) => void
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  id?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value.join(" ")

  const commit = () => {
    if (draft === null) return
    const parsed = Array.from(new Set(draft.split(/\s+/).filter(Boolean)))
    setDraft(null)
    if (parsed.length !== value.length || parsed.some((emoji, index) => emoji !== value[index])) onChange(parsed)
  }

  return (
    <input
      id={id}
      type="text"
      value={shown}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === "Escape" && draft !== null) {
          event.preventDefault()
          setDraft(null)
        }
      }}
      className={cn(
        "h-8 w-40 rounded-md border bg-background px-2 text-[15px] tracking-[2px] transition-[border-color,box-shadow] duration-150",
        "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:bg-muted/40",
      )}
    />
  )
}
