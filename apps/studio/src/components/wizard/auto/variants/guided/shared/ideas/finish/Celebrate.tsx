import { usePageThumb } from "../../../../../../core/pdf/usePageThumb"
import { useWizardForm } from "../../../../../../core/wizardForm"
import "./finish.css"

function Sheet({ file, page, i }: { file: File | null; page: number; i: number }) {
  const src = usePageThumb(file, page, 112)
  return (
    <div className="fx-sheet absolute inset-0 overflow-hidden rounded-[3px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.2)]" style={{ animationDelay: `${i * 0.12}s` }}>
      {src && <img src={src} alt="" className="size-full object-cover" />}
    </div>
  )
}

/**
 * f27 · Pages gather into a book: the book's own first three pages slide into a stack and a
 * brand-blue cover, with the real first page faint under the name, swings shut over them. Plays
 * once, when the book is ready.
 */
export function BookGather({ name }: { name: string }) {
  const form = useWizardForm()
  const file = form.state.values.file ?? null
  const cover = usePageThumb(file, 1, 112)
  return (
    <div aria-hidden className="fx-book relative h-[146px] w-[112px] shrink-0">
      {[3, 2, 1].map((p, i) => (
        <Sheet key={p} file={file} page={p} i={i} />
      ))}
      <div className="fx-cover absolute inset-0 flex items-end overflow-hidden rounded-[3px_8px_8px_3px] bg-gradient-to-br from-brand-500 to-brand-800 p-2.5 text-white shadow-[inset_5px_0_0_rgba(0,0,0,0.18),0_12px_26px_-12px_rgba(15,23,42,0.55)] dark:from-brand-400 dark:to-brand-200">
        {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-20 mix-blend-luminosity" />}
        <span className="relative line-clamp-3 text-[13px] font-semibold leading-tight">{name}</span>
      </div>
    </div>
  )
}

/** The burst's dots, in the brand ramp (they flip with the theme). */
// eslint-disable-next-line lingui/no-unlocalized-strings -- CSS custom property names
const SPARKS = ["--brand-300", "--brand-500", "--brand-700", "--brand-400", "--brand-300", "--brand-500", "--brand-700", "--brand-400"]

/**
 * f28 · A small sparkle burst: a brand-blue check springs in and draws itself while eight dots burst
 * out and fade. Once, at the end, under 600 ms; never on errors.
 */
export function Sparkle() {
  return (
    <span aria-hidden className="relative grid size-[120px] shrink-0 place-items-center">
      {SPARKS.map((c, i) => (
        <span key={i} className="fx-spark absolute left-1/2 top-1/2 -ml-1 -mt-1 size-2 rounded-full" style={{ background: `var(${c})`, ["--a" as string]: `${i * 45}deg` }} />
      ))}
      <span className="fx-check grid size-16 place-items-center rounded-full bg-brand-600 text-primary-foreground">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
    </span>
  )
}
