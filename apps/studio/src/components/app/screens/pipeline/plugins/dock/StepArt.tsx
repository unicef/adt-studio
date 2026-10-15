import type { ReactNode } from "react"

const paperClassName = "fill-white dark:fill-zinc-800"

function Frame({ hex, children }: { hex: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 160 84" className="h-full w-full" fill="none" aria-hidden>
      <g style={{ color: hex }}>{children}</g>
    </svg>
  )
}

function Lines({ x, y, widths, gap = 7, opacity = 0.35 }: { x: number; y: number; widths: number[]; gap?: number; opacity?: number }) {
  return (
    <>
      {widths.map((width, index) => (
        <rect key={index} x={x} y={y + index * gap} width={width} height={3} rx={1.5} fill="currentColor" opacity={opacity} />
      ))}
    </>
  )
}

function Captions() {
  return (
    <>
      <rect x={22} y={14} width={62} height={52} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.35} />
      <circle cx={40} cy={32} r={6} fill="currentColor" opacity={0.35} />
      <path d="M26 62 L46 44 L58 54 L66 47 L80 62 Z" fill="currentColor" opacity={0.5} />
      <path d="M92 26 h46 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-30 l-8 8 v-8 h-8 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z" className={paperClassName} stroke="currentColor" strokeOpacity={0.6} />
      <Lines x={98} y={34} widths={[36, 28, 32]} opacity={0.6} />
    </>
  )
}

function Toc() {
  return (
    <>
      <rect x={40} y={10} width={80} height={64} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.35} />
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          <rect x={50} y={22 + row * 12} width={7} height={5} rx={2} fill="currentColor" opacity={0.7} />
          <rect x={61} y={23 + row * 12} width={row % 2 ? 30 : 40} height={3} rx={1.5} fill="currentColor" opacity={0.35} />
          <rect x={104} y={23 + row * 12} width={8} height={3} rx={1.5} fill="currentColor" opacity={0.5} />
        </g>
      ))}
    </>
  )
}

function EasyRead() {
  return (
    <>
      <rect x={14} y={14} width={58} height={56} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.3} />
      <Lines x={22} y={24} widths={[42, 38, 44, 30, 40, 26]} gap={6} opacity={0.3} />
      <path d="M78 42 h10 m-4 -4 l4 4 -4 4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
      <rect x={94} y={14} width={52} height={56} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.6} />
      <Lines x={102} y={26} widths={[30, 22]} gap={11} opacity={0.75} />
      <circle cx={136} cy={56} r={6} fill="currentColor" opacity={0.6} />
    </>
  )
}

function SignLanguage() {
  return (
    <>
      <rect x={20} y={14} width={70} height={56} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.3} />
      <Lines x={28} y={24} widths={[50, 44, 52, 36, 46]} gap={8} opacity={0.3} />
      <rect x={96} y={22} width={46} height={44} rx={8} fill="currentColor" opacity={0.18} />
      <path d="M112 54 v-16 m5 16 v-18 m5 18 v-15 m5 17 v-10 c3 -4 7 -2 5 3 l-6 12 h-14" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={136} cy={28} r={2.5} fill="#ef4444" />
    </>
  )
}

function Quizzes() {
  return (
    <>
      <rect x={36} y={8} width={88} height={68} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.35} />
      <rect x={46} y={17} width={60} height={4} rx={2} fill="currentColor" opacity={0.55} />
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x={46} y={28 + row * 14} width={68} height={10} rx={5} fill="currentColor" opacity={row === 1 ? 0.18 : 0.07} />
          <circle cx={52} cy={33 + row * 14} r={2.6} fill="currentColor" opacity={row === 1 ? 0.9 : 0.35} />
          <rect x={58} y={31.5 + row * 14} width={row === 1 ? 34 : 40} height={3} rx={1.5} fill="currentColor" opacity={0.4} />
        </g>
      ))}
    </>
  )
}

function Glossary() {
  return (
    <>
      <rect x={16} y={14} width={78} height={56} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.3} />
      <Lines x={24} y={24} widths={[26, 50, 40, 56, 34]} gap={8} opacity={0.3} />
      <rect x={52} y={22} width={22} height={6} rx={3} fill="currentColor" opacity={0.5} />
      <path d="M74 26 C 88 26, 90 34, 100 34" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="2 3" />
      <rect x={100} y={22} width={46} height={40} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.6} />
      <rect x={107} y={30} width={22} height={4} rx={2} fill="currentColor" opacity={0.8} />
      <Lines x={107} y={40} widths={[32, 26, 30]} gap={6} opacity={0.4} />
    </>
  )
}

function Translate() {
  return (
    <>
      <rect x={14} y={18} width={54} height={48} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.35} />
      <path d="M22 37 l5 -13 l5 13 m-8 -4.5 h6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      <Lines x={22} y={44} widths={[38, 30, 34]} gap={6} opacity={0.3} />
      <path d="M74 36 h14 m-4 -4 l4 4 -4 4 M88 50 h-14 m4 -4 l-4 4 4 4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      <rect x={94} y={18} width={54} height={48} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.6} />
      <path d="M102 27 h12 m-6 -3 v3 m-5 3 l10 9 m0 -9 l-10 9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Lines x={102} y={44} widths={[34, 38, 26]} gap={6} opacity={0.45} />
    </>
  )
}

function Speech() {
  const bars = [10, 18, 28, 16, 34, 22, 12, 26, 38, 20, 30, 14, 24, 10, 18]
  return (
    <>
      <rect x={18} y={14} width={124} height={22} rx={8} className={paperClassName} stroke="currentColor" strokeOpacity={0.35} />
      <rect x={26} y={23} width={22} height={4} rx={2} fill="currentColor" opacity={0.3} />
      <rect x={52} y={21} width={30} height={8} rx={3} fill="currentColor" opacity={0.25} />
      <rect x={56} y={23} width={22} height={4} rx={2} fill="currentColor" opacity={0.85} />
      <rect x={86} y={23} width={40} height={4} rx={2} fill="currentColor" opacity={0.3} />
      {bars.map((height, index) => (
        <rect key={index} x={26 + index * 7.6} y={60 - height / 2} width={4} height={height} rx={2} fill="currentColor" opacity={index > 3 && index < 8 ? 0.85 : 0.35} />
      ))}
    </>
  )
}

const ART: Record<string, () => ReactNode> = {
  captions: Captions,
  toc: Toc,
  "easy-read": EasyRead,
  "sign-language": SignLanguage,
  quizzes: Quizzes,
  glossary: Glossary,
  translate: Translate,
  speech: Speech,
}

export function StepArt({ slug, hex }: { slug: string; hex: string }) {
  const Art = ART[slug]
  if (!Art) return null
  return (
    <Frame hex={hex}>
      <Art />
    </Frame>
  )
}
