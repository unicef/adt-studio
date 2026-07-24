/**
 * Sign-language clip for glossary surfaces (term popover, glossary list,
 * term details). Muted looping autoplay — the sign starts the moment the
 * element appears and repeats for re-watching; sign videos are visual, so
 * no controls and no audio.
 *
 * Play is driven from a ref callback: React sets `muted` only as a DOM
 * property (never the attribute), which browsers' autoplay policies don't
 * always honour in time — an explicit mute-then-play makes it reliable.
 */
export function SignLanguageVideo({ src, className }: { src: string; className?: string }) {
  return (
    <video
      src={src}
      muted
      loop
      playsInline
      className={className}
      ref={(el) => {
        if (!el) return
        el.muted = true
        const p = el.play()
        if (p) p.catch(() => {})
      }}
    />
  )
}
