import { Sparkles } from "lucide-react"

/** c17: the assistant's mark keeps changing shape while it reads; still, it is a plain circle. Decoration only. */
export function MorphMark() {
  return (
    <span aria-hidden className="relative grid size-[76px] shrink-0 place-items-center">
      <span className="lcl-morph absolute inset-0 overflow-hidden shadow-[0_14px_30px_-12px_rgba(43,127,255,0.8)]">
        <span className="lcl-turn absolute inset-[-20%] bg-[conic-gradient(from_0deg,var(--color-brand-400),var(--color-brand-700),#22b8cf,var(--color-brand-400))]" />
      </span>
      <Sparkles className="relative size-7 text-white" />
    </span>
  )
}
