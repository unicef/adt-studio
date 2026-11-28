import { SCREEN, ScreenContent, type Shown } from "./screens/layouts"

/** One screen of the book as it would come out, drawn like a page on the board: no device frame. */
export function Screen({ shown, srcs, width }: { shown: Shown; srcs: (string | undefined)[]; width: number }) {
  const s = SCREEN.desktop
  const scale = width / s.w
  return (
    <span className="qd18-pg relative block overflow-hidden rounded-[5px] bg-white" style={{ width, height: s.h * scale }}>
      <span className="absolute left-0 top-0 block origin-top-left" style={{ transform: `scale(${scale})` }}>
        <ScreenContent shown={shown} device="desktop" srcs={srcs} />
      </span>
    </span>
  )
}
