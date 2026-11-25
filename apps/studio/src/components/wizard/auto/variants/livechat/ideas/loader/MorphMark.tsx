/**
 * c17: a soft brand-blue shape that keeps turning and changing between blob, circle, squircle and
 * rounded square while it reads; still, it is a plain circle. Decoration only.
 */
export function MorphMark() {
  return (
    <span aria-hidden className="relative grid size-[96px] shrink-0 place-items-center">
      <span className="lcl-morph size-[84px]" />
    </span>
  )
}
