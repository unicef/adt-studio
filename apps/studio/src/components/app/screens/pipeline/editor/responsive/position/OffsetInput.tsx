import { useEffect, useRef, useState } from "react"

export function OffsetInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const skipBlur = useRef(false)
  useEffect(() => setDraft(String(value)), [value])
  function commit() {
    const next = Number(draft)
    if (draft.trim() && Number.isFinite(next) && Math.abs(next) <= 10000) {
      if (next !== value) onCommit(next)
    }
    // Keep the rendered value if the cascade rejects an edit. A successful
    // commit supplies the new measured value on the following layout pass.
    setDraft(String(value))
  }
  return <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <input aria-label={label} type="number" step="1" min="-10000" max="10000" disabled={disabled}
      className="h-8 min-w-0 w-full bg-transparent text-right outline-none disabled:opacity-40"
      value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (!skipBlur.current) commit(); skipBlur.current = false }}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); skipBlur.current = true; commit(); event.currentTarget.blur() }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); skipBlur.current = true; setDraft(String(value)); event.currentTarget.blur() }
      }} />
    <span className="text-[10px] text-muted-foreground/60">{/** CSS unit, not copy. */}{"px"}</span>
  </label>
}
