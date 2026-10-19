import type { Note } from "../../lib/comparison"

export function Notes({ notes }: { notes: Note[] }) {
  if (notes.length === 0) return null
  const warnings = notes.filter((n) => n.tone === "warn")
  const infos = notes.filter((n) => n.tone === "info")
  return (
    <div className="flex flex-col gap-2">
      {warnings.length > 0 && <NoteGroup tone="warn" notes={warnings} />}
      {infos.length > 0 && <NoteGroup tone="info" notes={infos} />}
    </div>
  )
}

function NoteGroup({ tone, notes }: { tone: Note["tone"]; notes: Note[] }) {
  const warn = tone === "warn"
  return (
    <ul className={`flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-sm leading-relaxed ${warn ? "border-warn/25 bg-warn-bg" : "border-line bg-surface"}`}>
      {notes.map((note, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden="true" className={`mt-px shrink-0 ${warn ? "text-warn" : "text-muted"}`}>{warn ? "⚠" : "ℹ"}</span>
          <span className={warn ? "text-ink" : "text-ink-2"}>
            <span className="sr-only">{warn ? "Warning: " : "Note: "}</span>
            {note.text}
          </span>
        </li>
      ))}
    </ul>
  )
}
