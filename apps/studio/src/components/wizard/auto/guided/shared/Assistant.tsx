import { useId, type CSSProperties } from "react"
import { useLingui } from "@lingui/react"
import { cn } from "@/lib/utils"
import { LOOK_NAME, useAssistantStyle, type AssistantColor, type AssistantLookId } from "./assistantLook"

export type AssistantMood = "idle" | "talking" | "thinking"

/** The face every look shares: eyes that blink (and read), a smile, and a mouth that moves while it talks. */
function Face({ x = 32, y = 36, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="gd-ai-eyes">
        <ellipse cx="-6.5" cy="-2" rx="3" ry="3.9" />
        <ellipse cx="6.5" cy="-2" rx="3" ry="3.9" />
      </g>
      <path className="gd-ai-smile" d="M-5.5 6 Q0 10.5 5.5 6" />
      <ellipse className="gd-ai-mouth" cx="0" cy="7.5" rx="4" ry="2" />
    </g>
  )
}

/** The body's colour: a soft sphere-like gradient in the chosen colour. */
function Shade({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={id} cx="35%" cy="30%" r="75%">
        <stop offset="0%" style={{ stopColor: "var(--ai-300)" }} />
        <stop offset="45%" style={{ stopColor: "var(--ai-500)" }} />
        <stop offset="100%" style={{ stopColor: "var(--ai-700)" }} />
      </radialGradient>
    </defs>
  )
}

function Orb({ fill }: { fill: string }) {
  return (
    <>
      <circle className="gd-ai-body" cx="32" cy="34" r="22" fill={fill} />
      <ellipse cx="24" cy="24" rx="7" ry="4.5" fill="white" opacity="0.35" transform="rotate(-25 24 24)" />
      <Face />
    </>
  )
}

function Wizard({ fill }: { fill: string }) {
  return (
    <>
      <g className="gd-ai-body">
        <circle cx="30" cy="40" r="18" fill={fill} />
        <ellipse cx="23" cy="32" rx="5.5" ry="3.5" fill="white" opacity="0.3" transform="rotate(-25 23 32)" />
        <Face x={30} y={42} scale={0.85} />
        {/* A starry hat, a little tilted. */}
        <g transform="rotate(-8 30 22)">
          <ellipse cx="30" cy="25" rx="19" ry="4" style={{ fill: "var(--ai-800)" }} />
          <path d="M16 25 C20 18 26 6 34 2 C33 10 38 18 44 25 Z" style={{ fill: "var(--ai-700)" }} />
          <path d="M17.5 22.5 C25 24 36 24 42.5 22.5 L44 25 C36 26.5 25 26.5 16 25 Z" fill="#F5B83D" />
          <path d="M29 11 l1.2 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.5 -1.4 -2.5 1.4 .6 -2.8 -2.1 -1.9 2.8 -.3z" fill="#FDE68A" />
        </g>
      </g>
      {/* The wand: its tip sparkles while it talks. */}
      <g className="gd-ai-wand">
        <path d="M48 56 L58 42" stroke="#5B4636" strokeWidth="2.6" strokeLinecap="round" />
        <path className="gd-ai-spark" d="M58 37 l1.4 3 3.2 .4 -2.4 2.2 .7 3.2 -2.9 -1.6 -2.9 1.6 .7 -3.2 -2.4 -2.2 3.2 -.4z" fill="#F5B83D" />
      </g>
    </>
  )
}

function Buddy({ fill }: { fill: string }) {
  return (
    <g className="gd-ai-body">
      {/* An open book: the cover behind, two pages, a face across them. */}
      <path d="M6 18 Q32 10 58 18 L58 52 Q32 46 6 52 Z" fill={fill} />
      <path className="gd-ai-page-l" d="M9 19 Q20 15 31 19 L31 49 Q20 45 9 49 Z" fill="white" />
      <path className="gd-ai-page-r" d="M33 19 Q44 15 55 19 L55 49 Q44 45 33 49 Z" fill="white" />
      <path d="M32 19 L32 49" style={{ stroke: "var(--ai-700)" }} strokeWidth="1.2" />
      <g className="gd-ai-ink">
        <Face x={32} y={34} scale={0.9} />
      </g>
    </g>
  )
}

function Bot({ fill }: { fill: string }) {
  return (
    <>
      {/* The antenna: its light glows while it talks. */}
      <path d="M32 14 L32 6" style={{ stroke: "var(--ai-700)" }} strokeWidth="2.4" strokeLinecap="round" />
      <circle className="gd-ai-light" cx="32" cy="5" r="3.4" />
      <g className="gd-ai-body">
        <rect x="9" y="14" width="46" height="40" rx="15" fill={fill} />
        <rect x="4" y="29" width="6" height="12" rx="3" style={{ fill: "var(--ai-700)" }} />
        <rect x="54" y="29" width="6" height="12" rx="3" style={{ fill: "var(--ai-700)" }} />
        <rect x="15" y="21" width="34" height="27" rx="10" style={{ fill: "var(--ai-900)" }} opacity="0.85" />
        <Face x={32} y={35} scale={0.85} />
      </g>
    </>
  )
}

const DRAW: Record<AssistantLookId, (p: { fill: string }) => React.ReactNode> = { orb: Orb, wizard: Wizard, buddy: Buddy, bot: Bot }

/**
 * The assistant, in the look and colour the user picked (`look` / `color` override that, for
 * previews). Idle, it breathes and blinks now and then; talking, its mouth moves (and the wand
 * sparkles, the pages flap, the antenna glows); thinking, its eyes read from side to side.
 * Decoration only; still with reduced motion.
 */
export function Assistant({ mood = "idle", size = 36, look, color, className }: { mood?: AssistantMood; size?: number; look?: AssistantLookId; color?: AssistantColor; className?: string }) {
  const style = useAssistantStyle()
  const id = `ai${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const Draw = DRAW[look ?? style.look]
  return (
    <span aria-hidden data-mood={mood} data-color={color ?? style.color} className={cn("gd-ai relative inline-grid shrink-0 place-items-center", className)} style={{ "--ai": `${size}px` } as CSSProperties}>
      <span className="gd-ai-ring" />
      <svg viewBox="0 0 64 64" className="gd-ai-svg relative h-full w-full overflow-visible">
        <Shade id={id} />
        <Draw fill={`url(#${id})`} />
      </svg>
    </span>
  )
}

/** The assistant's name, which follows its look ("ADT Wizard"). */
export function useAssistantName(): string {
  const { i18n } = useLingui()
  return i18n._(LOOK_NAME[useAssistantStyle().look])
}
