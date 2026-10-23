import { useId, type ReactNode } from "react"

const paperClassName = "fill-white dark:fill-zinc-800"
const inkClassName = "fill-zinc-900/[0.12] dark:fill-white/[0.16]"
const softInkClassName = "fill-zinc-900/[0.07] dark:fill-white/[0.09]"

interface ArtIds {
  shadowId: string
  tintId: string
  deepId: string
}

function Card({ x, y, w, h, r = 10, ids }: { x: number; y: number; w: number; h: number; r?: number; ids: ArtIds }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} className={paperClassName} filter={`url(#${ids.shadowId})`} />
}

function Line({ x, y, w, strong = false, h = 4 }: { x: number; y: number; w: number; strong?: boolean; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={strong ? inkClassName : softInkClassName} />
}

function Captions({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={30} y={18} w={96} h={86} ids={ids} />
      <rect x={38} y={26} width={80} height={52} rx={6} fill={`url(#${ids.tintId})`} />
      <circle cx={102} cy={38} r={6} fill="#fde68a" />
      <path d="M38 70 L62 48 L76 60 L88 50 L118 72 L118 72 a6 6 0 0 1 -6 6 H44 a6 6 0 0 1 -6 -6 Z" fill={`url(#${ids.deepId})`} />
      <Line x={38} y={86} w={54} strong />
      <Line x={38} y={94} w={38} />
      <path d="M136 30 h70 a10 10 0 0 1 10 10 v34 a10 10 0 0 1 -10 10 h-46 l-12 12 v-12 h-12 a10 10 0 0 1 -10 -10 v-34 a10 10 0 0 1 10 -10 z" className={paperClassName} filter={`url(#${ids.shadowId})`} />
      <rect x={140} y={38} width={22} height={9} rx={4.5} fill="currentColor" />
      <rect x={144} y={41.5} width={14} height={2} rx={1} fill="white" opacity={0.9} />
      <Line x={140} y={54} w={64} strong />
      <Line x={140} y={62} w={58} />
      <Line x={140} y={70} w={42} />
      <circle cx={206} cy={100} r={11} fill="currentColor" />
      <path d="M201 97 h3 l4 -3.5 v13 l-4 -3.5 h-3 z" fill="white" />
      <path d="M220 94 a8 8 0 0 1 0 12 M225 90 a14 14 0 0 1 0 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.55} />
    </>
  )
}

function Toc({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={62} y={10} w={116} h={106} ids={ids} />
      <path d="M156 10 h12 v24 l-6 -5 l-6 5 z" fill="currentColor" />
      <Line x={74} y={22} w={54} strong h={6} />
      {[0, 1, 2, 3, 4].map((row) => (
        <g key={row}>
          <circle cx={79} cy={44 + row * 14} r={4.5} fill="currentColor" opacity={row === 1 ? 1 : 0.22} />
          <Line x={89} y={42 + row * 14} w={[44, 36, 50, 30, 40][row]} strong={row === 1} />
          <rect x={89 + [44, 36, 50, 30, 40][row] + 4} y={44 + row * 14} width={154 - (89 + [44, 36, 50, 30, 40][row] + 4)} height={1.5} rx={0.75} className={softInkClassName} />
          <rect x={158} y={42 + row * 14} width={10} height={4} rx={2} className={row === 1 ? inkClassName : softInkClassName} />
        </g>
      ))}
    </>
  )
}

function EasyRead({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={18} y={20} w={84} h={86} ids={ids} />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
        <Line key={row} x={26} y={30 + row * 8} w={[66, 60, 68, 54, 64, 58, 66, 48, 40][row]} h={3} />
      ))}
      <circle cx={120} cy={63} r={11} fill="currentColor" opacity={0.15} />
      <path d="M115 63 h10 m-4 -4 l4 4 l-4 4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Card x={138} y={14} w={86} h={98} ids={ids} />
      <circle cx={160} cy={38} r={11} fill={`url(#${ids.tintId})`} />
      <path d="M155 40 q5 5 10 0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none" />
      <circle cx={156.5} cy={35} r={1.6} fill="currentColor" />
      <circle cx={163.5} cy={35} r={1.6} fill="currentColor" />
      <Line x={176} y={32} w={38} strong h={7} />
      <Line x={176} y={44} w={26} h={6} />
      <Line x={148} y={62} w={66} strong h={7} />
      <Line x={148} y={75} w={52} h={7} />
      <Line x={148} y={88} w={60} strong h={7} />
    </>
  )
}

function SignLanguage({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={16} y={22} w={92} h={84} ids={ids} />
      <Line x={26} y={34} w={58} strong />
      <rect x={22} y={44} width={80} height={22} rx={5} fill="currentColor" opacity={0.12} />
      <Line x={28} y={50} w={66} strong />
      <Line x={28} y={58} w={48} />
      <Line x={26} y={74} w={64} />
      <Line x={26} y={84} w={52} />
      <rect x={118} y={14} width={106} height={98} rx={12} fill={`url(#${ids.deepId})`} filter={`url(#${ids.shadowId})`} />
      <circle cx={171} cy={50} r={13} fill="white" opacity={0.92} />
      <path d="M154 96 q2 -22 17 -26 q15 4 17 26 z" fill="white" opacity={0.92} />
      <path d="M186 64 v-11 m4 11 v-13 m4 13 v-10 m4 12 v-6 c2 -3 5 -1 3 3 l-4 9 h-11" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x={126} y={100} width={90} height={3} rx={1.5} fill="white" opacity={0.35} />
      <rect x={126} y={100} width={38} height={3} rx={1.5} fill="white" />
      <circle cx={210} cy={24} r={3.5} fill="#ef4444" />
    </>
  )
}

function Quizzes({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={46} y={8} w={148} h={110} ids={ids} />
      <circle cx={62} cy={24} r={8} fill="currentColor" />
      <path d="M59.5 21.5 a2.6 2.6 0 1 1 3.6 2.4 c-0.8 0.4 -1.1 0.9 -1.1 1.6 M62 28.6 v0.2" stroke="white" strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <Line x={76} y={20} w={86} strong h={6} />
      <Line x={76} y={30} w={60} />
      {[0, 1, 2].map((row) => {
        const chosen = row === 1
        return (
          <g key={row}>
            <rect x={56} y={44 + row * 23} width={128} height={18} rx={9} fill="currentColor" opacity={chosen ? 0.16 : 0.05} />
            {chosen ? (
              <>
                <circle cx={67} cy={53 + row * 23} r={5} fill="currentColor" />
                <path d="M64.6 53.2 l1.7 1.7 l3.2 -3.4" stroke="white" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </>
            ) : (
              <circle cx={67} cy={53 + row * 23} r={4.5} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} />
            )}
            <Line x={78} y={51 + row * 23} w={[64, 76, 52][row]} strong={chosen} />
          </g>
        )
      })}
    </>
  )
}

function Glossary({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={14} y={26} w={128} h={82} ids={ids} />
      <Line x={24} y={38} w={108} />
      <Line x={24} y={48} w={30} />
      <rect x={58} y={45} width={34} height={10} rx={3} fill="currentColor" opacity={0.18} />
      <rect x={60} y={48} width={30} height={4} rx={2} fill="currentColor" />
      <rect x={58} y={56} width={34} height={1.6} rx={0.8} fill="currentColor" />
      <Line x={96} y={48} w={36} />
      <Line x={24} y={62} w={98} />
      <Line x={24} y={72} w={108} />
      <Line x={24} y={82} w={86} />
      <Line x={24} y={92} w={70} />
      <path d="M92 50 C 118 50, 128 36, 146 36" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="2 3" fill="none" />
      <Card x={146} y={14} w={80} h={62} ids={ids} />
      <rect x={146} y={14} width={80} height={14} rx={10} fill="currentColor" opacity={0.14} />
      <rect x={154} y={19} width={34} height={5} rx={2.5} fill="currentColor" />
      <Line x={154} y={36} w={62} strong />
      <Line x={154} y={45} w={56} />
      <Line x={154} y={54} w={60} />
      <Line x={154} y={63} w={40} />
    </>
  )
}

function Translate({ ids }: { ids: ArtIds }) {
  return (
    <>
      <Card x={18} y={22} w={88} h={80} ids={ids} />
      <rect x={18} y={22} width={88} height={18} rx={10} className={softInkClassName} />
      <path d="M28 36 l5 -11 l5 11 m-8 -3.8 h6" stroke="currentColor" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Line x={28} y={50} w={68} strong />
      <Line x={28} y={60} w={56} />
      <Line x={28} y={70} w={64} />
      <Line x={28} y={80} w={44} />
      <circle cx={121} cy={62} r={13} fill="currentColor" />
      <path d="M115 58 h11 m-3 -3 l3 3 l-3 3 M127 66 h-11 m3 -3 l-3 3 l3 3" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Card x={136} y={22} w={88} h={80} ids={ids} />
      <rect x={136} y={22} width={88} height={18} rx={10} fill={`url(#${ids.tintId})`} />
      <path d="M146 27 h10 m-5 -2 v2 m-4 3 l8 7 m0 -7 l-8 7" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Line x={146} y={50} w={60} strong />
      <Line x={146} y={60} w={68} />
      <Line x={146} y={70} w={50} />
      <Line x={146} y={80} w={58} />
    </>
  )
}

function Speech({ ids }: { ids: ArtIds }) {
  const bars = [8, 14, 22, 12, 28, 18, 34, 24, 14, 30, 20, 26, 12, 18, 10, 22, 14, 8]
  return (
    <>
      <Card x={20} y={12} w={200} h={38} ids={ids} />
      <Line x={32} y={23} w={30} />
      <rect x={66} y={19} width={40} height={12} rx={4} fill="currentColor" opacity={0.18} />
      <rect x={70} y={23} width={32} height={4} rx={2} fill="currentColor" />
      <Line x={110} y={23} w={44} />
      <Line x={158} y={23} w={50} />
      <Line x={32} y={35} w={120} />
      <Card x={20} y={60} w={200} h={52} ids={ids} />
      <circle cx={44} cy={86} r={13} fill="currentColor" />
      <path d="M40.5 80 v12 l10 -6 z" fill="white" />
      {bars.map((height, index) => (
        <rect key={index} x={66 + index * 8.2} y={86 - height / 2} width={4} height={height} rx={2} fill="currentColor" opacity={index < 7 ? 0.9 : 0.25} />
      ))}
      <rect x={122} y={66} width={1.6} height={40} rx={0.8} fill="currentColor" />
    </>
  )
}

const ART: Record<string, (props: { ids: ArtIds }) => ReactNode> = {
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
  const id = useId().replace(/:/g, "")
  const Art = ART[slug]
  if (!Art) return null
  const ids: ArtIds = { shadowId: `${id}-shadow`, tintId: `${id}-tint`, deepId: `${id}-deep` }
  return (
    <svg viewBox="0 0 240 126" className="h-full w-full" fill="none" aria-hidden style={{ color: hex }}>
      <defs>
        <filter id={ids.shadowId} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.13" />
        </filter>
        <linearGradient id={ids.tintId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hex} stopOpacity="0.18" />
          <stop offset="1" stopColor={hex} stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id={ids.deepId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hex} stopOpacity="0.75" />
          <stop offset="1" stopColor={hex} />
        </linearGradient>
      </defs>
      <Art ids={ids} />
    </svg>
  )
}
