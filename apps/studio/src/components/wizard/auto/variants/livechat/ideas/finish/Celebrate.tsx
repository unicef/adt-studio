import { usePageThumb } from "../../../../../core/pdf/usePageThumb"
import { useWizardForm } from "../../../../../core/wizardForm"
import "./finish.css"

function Sheet({ file, page, i }: { file: File | null; page: number; i: number }) {
  const src = usePageThumb(file, page, 96)
  return (
    <div className="fx-sheet absolute inset-0 overflow-hidden rounded-[3px] bg-muted shadow-[0_1px_3px_rgba(15,23,42,0.3)] ring-1 ring-border" style={{ animationDelay: `${i * 0.12}s`, transform: `translate(${i * 2}px, ${-i * 2}px)` }}>
      {src && <img src={src} alt="" className="size-full object-cover" />}
    </div>
  )
}

/**
 * f27 · Pages gather into a book: the book's own first pages slide into a stack and a cover with the
 * name swings shut over them. Plays once, when the book is ready.
 */
export function BookGather({ name }: { name: string }) {
  const form = useWizardForm()
  const file = form.state.values.file ?? null
  const cover = usePageThumb(file, 1, 96)
  return (
    <div aria-hidden className="fx-book relative h-[118px] w-[88px] shrink-0">
      {[3, 2, 1].map((p, i) => (
        <Sheet key={p} file={file} page={p} i={2 - i} />
      ))}
      <div className="fx-cover absolute inset-0 flex items-end overflow-hidden rounded-[3px_7px_7px_3px] bg-gradient-to-br from-brand-500 to-brand-800 p-2 shadow-[inset_4px_0_0_rgba(0,0,0,0.18),0_10px_24px_-10px_rgba(15,23,42,0.6)]">
        {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-25 mix-blend-luminosity" />}
        <span className="relative line-clamp-3 text-[11px] font-bold leading-tight text-white">{name}</span>
      </div>
    </div>
  )
}

const SPARKS = ["#f59e0b", "#22b8cf", "#ec4899", "#a3e635", "#6d64f5", "#f59e0b", "#22b8cf", "#ec4899"]

/**
 * f28 · A small sparkle burst: a check that draws itself and eight dots that burst and fade. Once,
 * at the end, under 600 ms; never on errors.
 */
export function Sparkle() {
  return (
    <span aria-hidden className="relative grid size-12 shrink-0 place-items-center">
      {SPARKS.map((c, i) => (
        <span key={i} className="fx-spark absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-1.5 rounded-full" style={{ background: c, ["--a" as string]: `${i * 45}deg` }} />
      ))}
      <span className="fx-check grid size-12 place-items-center rounded-full bg-emerald-500 shadow-[0_10px_24px_-10px_rgba(16,185,129,0.9)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
    </span>
  )
}
