import { Fragment, useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ChevronDown, StickyNote } from "lucide-react"
import { cn } from "@/lib/utils"
import { NoteRow, type StepNote } from "./NoteRow"

export function NotesStrip({ notes, hex, defaultOpen = false }: { notes: StepNote[]; hex: string; defaultOpen?: boolean }) {
  const { t } = useLingui()
  const attention = notes.filter((note) => note.attention).length
  const [open, setOpen] = useState(attention > 0 || defaultOpen)
  const lastAttention = useRef(attention)
  useEffect(() => {
    if (attention > lastAttention.current) setOpen(true)
    lastAttention.current = attention
  }, [attention])

  if (notes.length === 0) return null
  const ordered = [...notes.filter((note) => note.attention), ...notes.filter((note) => !note.attention)]
  return (
    <div className="overflow-hidden rounded-xl border bg-card animate-in fade-in duration-300 motion-reduce:animate-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <span className="relative">
          <StickyNote className="size-4 shrink-0 text-muted-foreground" />
          {attention > 0 && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-card" style={{ background: hex }} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          <span className="font-semibold text-foreground">{t`${plural(notes.length, { one: "# note", other: "# notes" })}`}</span>
          <span aria-hidden> · </span>
          {ordered.map((note, index) => (
            <Fragment key={note.id}>
              {index > 0 && ", "}
              <span className={note.attention ? "font-medium" : undefined} style={note.attention ? { color: hex } : undefined}>
                {note.title}
              </span>
            </Fragment>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground">
          {open ? <Trans>Hide</Trans> : <Trans>Show</Trans>}
          <ChevronDown className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} />
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none",
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="divide-y border-t">
            {ordered.map((note) => (
              <NoteRow key={note.id} note={note} hex={hex} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
