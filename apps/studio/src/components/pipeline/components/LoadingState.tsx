import type { ReactNode } from "react"
import { STAGES, type StageDefinition } from "../stage-config"
import { useDelayedFlag } from "@/hooks/use-delayed-flag"

const SHOW_DELAY_MS = 200

export type StageSlug = keyof typeof STAGE_SVGS

interface LoadingStateProps {
  label: ReactNode
  stageSlug?: StageSlug
}

interface SvgProps {
  hex: string
}

function ExtractSvg({ hex }: SvgProps) {
  const gradId = "scan-glow"
  const clipId = "scan-clip"
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hex} stopOpacity="0" />
          <stop offset="40%" stopColor={hex} stopOpacity="0.15" />
          <stop offset="50%" stopColor={hex} stopOpacity="0.55" />
          <stop offset="60%" stopColor={hex} stopOpacity="0.15" />
          <stop offset="100%" stopColor={hex} stopOpacity="0" />
        </linearGradient>
        {/* Clip path matches the page interior so the scanner never overflows */}
        <clipPath id={clipId}>
          <rect x="12" y="7" width="32" height="42" rx="2" />
        </clipPath>
      </defs>
      <rect x="11" y="6" width="34" height="44" rx="3" fill="none" stroke={hex} strokeWidth="2" />
      <rect x="15" y="14" width="26" height="2" rx="1" fill={hex} opacity="0.18" />
      <rect x="15" y="20" width="22" height="2" rx="1" fill={hex} opacity="0.18" />
      <rect x="15" y="28" width="16" height="10" rx="1.5" fill={hex} opacity="0.18" />
      <rect x="15" y="42" width="20" height="2" rx="1" fill={hex} opacity="0.18" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="15" y="-22" width="26" height="22" fill={`url(#${gradId})`}>
          <animate
            attributeName="y"
            values="-22;3;3;9;9;17;17;31;31;40"
            keyTimes="0;0.12;0.2;0.3;0.38;0.5;0.58;0.78;0.86;1"
            dur="4.8s"
            repeatCount="indefinite"
          />
        </rect>
      </g>
      <rect x="15" y="14" width="26" height="2" rx="1" fill={hex}>
        <animate
          attributeName="opacity"
          values="0;0;1;1;0.6;0.6;0.6;0.6;0.6;0.6;0"
          keyTimes="0;0.18;0.22;0.26;0.32;0.5;0.6;0.78;0.86;0.96;1"
          dur="4.8s" repeatCount="indefinite"
        />
      </rect>
      <rect x="15" y="20" width="22" height="2" rx="1" fill={hex}>
        <animate
          attributeName="opacity"
          values="0;0;0;0;0;1;1;0.6;0.6;0.6;0"
          keyTimes="0;0.18;0.26;0.32;0.38;0.4;0.5;0.6;0.78;0.96;1"
          dur="4.8s" repeatCount="indefinite"
        />
      </rect>
      <rect x="15" y="28" width="16" height="10" rx="1.5" fill={hex}>
        <animate
          attributeName="opacity"
          values="0;0;0;0;0;0;0;0.65;0.65;0.4;0.4;0"
          keyTimes="0;0.18;0.3;0.4;0.5;0.55;0.6;0.65;0.78;0.86;0.96;1"
          dur="4.8s" repeatCount="indefinite"
        />
      </rect>
      <rect x="15" y="42" width="20" height="2" rx="1" fill={hex}>
        <animate
          attributeName="opacity"
          values="0;0;0;0;0;0;0;0;0;1;1;0"
          keyTimes="0;0.18;0.3;0.4;0.5;0.6;0.7;0.78;0.86;0.88;0.96;1"
          dur="4.8s" repeatCount="indefinite"
        />
      </rect>
    </svg>
  )
}

function SectioningSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <rect x="10" y="6" width="36" height="44" rx="3" fill="none" stroke={hex} strokeWidth="2" />
      <rect x="13" y="10" width="30" height="10" rx="1.5" fill={hex} opacity="0.1" />
      <rect x="13" y="22" width="30" height="14" rx="1.5" fill={hex} opacity="0.1" />
      <rect x="13" y="38" width="30" height="8" rx="1.5" fill={hex} opacity="0.1" />
      <rect x="13" y="10" width="30" height="10" rx="1.5" fill={hex}>
        <animate attributeName="opacity" values="0;0.6;0.6;0" keyTimes="0;0.2;0.85;1" dur="2.4s" repeatCount="indefinite" />
      </rect>
      <rect x="13" y="22" width="30" height="14" rx="1.5" fill={hex}>
        <animate attributeName="opacity" values="0;0;0.45;0.45;0" keyTimes="0;0.3;0.5;0.85;1" dur="2.4s" repeatCount="indefinite" />
      </rect>
      <rect x="13" y="38" width="30" height="8" rx="1.5" fill={hex}>
        <animate attributeName="opacity" values="0;0;0;0.55;0.55;0" keyTimes="0;0.55;0.65;0.75;0.85;1" dur="2.4s" repeatCount="indefinite" />
      </rect>
      <line x1="13" y1="21" x2="43" y2="21" stroke={hex} strokeWidth="0.6" opacity="0.4" strokeDasharray="2 1.5" />
      <line x1="13" y1="37" x2="43" y2="37" stroke={hex} strokeWidth="0.6" opacity="0.4" strokeDasharray="2 1.5" />
    </svg>
  )
}

function StoryboardSvg({ hex }: SvgProps) {
  const cells: Array<{ x: number; y: number; begin: string }> = [
    { x: 10, y: 10, begin: "0s" },
    { x: 30, y: 10, begin: "0.15s" },
    { x: 10, y: 30, begin: "0.3s" },
    { x: 30, y: 30, begin: "0.45s" },
  ]
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      {cells.map(({ x, y, begin }, i) => (
        <rect key={i} x={x} y={y} width="16" height="16" rx="2" fill={hex}>
          <animate attributeName="opacity" values="0.15;1;1;0.15" keyTimes="0;0.25;0.85;1" dur="1.8s" begin={begin} repeatCount="indefinite" />
        </rect>
      ))}
    </svg>
  )
}

function CaptionsSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <rect x="6" y="8" width="44" height="30" rx="3" fill="none" stroke={hex} strokeWidth="2" />
      <path d="M9 35 L20 22 L28 30 L34 24 L47 35 Z" fill={hex} opacity="0.25" />
      <circle cx="40" cy="16" r="2.5" fill={hex} opacity="0.6" />
      <rect x="6" y="44" width="0" height="3" rx="1.5" fill={hex}>
        <animate attributeName="width" values="0;36;36;0" keyTimes="0;0.4;0.85;1" dur="1.8s" repeatCount="indefinite" />
      </rect>
      <rect x="6" y="50" width="0" height="3" rx="1.5" fill={hex} opacity="0.6">
        <animate attributeName="width" values="0;0;24;24;0" keyTimes="0;0.3;0.6;0.85;1" dur="1.8s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

function QuizzesSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <circle cx="10" cy="11" r="4.5" fill={hex} opacity="0.15" />
      <text x="10" y="14" textAnchor="middle" fontSize="8" fontWeight="700" fill={hex}>?</text>
      <rect x="18" y="9.5" width="26" height="1.8" rx="0.9" fill={hex} opacity="0.55" />
      <rect x="18" y="13.5" width="18" height="1.8" rx="0.9" fill={hex} opacity="0.28" />
      {[
        { y: 24, w: 24, checked: true, opacity: 1 },
        { y: 35, w: 26, checked: false, opacity: 0.75 },
        { y: 46, w: 20, checked: false, opacity: 0.55 },
      ].map((row, i) => (
        <g key={i}>
          <rect
            x="9" y={row.y} width="7" height="7" rx="1.5"
            fill="none" stroke={hex} strokeWidth="1.5" opacity={row.opacity}
          />
          <rect
            x="20" y={row.y + 2.5} width={row.w} height="2" rx="1"
            fill={hex} opacity={row.opacity * 0.5}
          />
        </g>
      ))}
      <path
        d="M10.7 27.7 L12.2 29.2 L14.3 26.4"
        fill="none" stroke={hex} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="10" strokeDashoffset="10"
      >
        <animate attributeName="stroke-dashoffset" values="10;10;0;0;10" keyTimes="0;0.25;0.5;0.9;1" dur="2.6s" repeatCount="indefinite" />
      </path>
      <rect
        x="9" y="24" width="7" height="7" rx="1.5"
        fill={hex} opacity="0"
      >
        <animate attributeName="opacity" values="0;0;0.18;0.18;0" keyTimes="0;0.25;0.5;0.9;1" dur="2.6s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

function GlossarySvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <rect x="6" y="10" width="44" height="36" rx="3" fill="none" stroke={hex} strokeWidth="2" />
      {/* eslint-disable-next-line lingui/no-unlocalized-strings -- decorative SVG glyph */}
      <text x="12" y="28" fontSize="14" fontWeight="700" fill={hex} fontFamily="ui-serif, Georgia, serif">Aa</text>
      <rect x="32" y="20" width="14" height="6" rx="3" fill={hex} opacity="0.2" />
      <rect x="34" y="22.5" width="10" height="1.4" rx="0.7" fill={hex} opacity="0.5" />
      <line x1="12" y1="33" x2="44" y2="33" stroke={hex} strokeWidth="0.6" opacity="0.3" />
      <rect x="12" y="36" width="0" height="2" rx="1" fill={hex} opacity="0.7">
        <animate attributeName="width" values="0;32;32;0" keyTimes="0;0.35;0.85;1" dur="2.2s" repeatCount="indefinite" />
      </rect>
      <rect x="12" y="40.5" width="0" height="2" rx="1" fill={hex} opacity="0.5">
        <animate attributeName="width" values="0;0;24;24;0" keyTimes="0;0.3;0.55;0.85;1" dur="2.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

function TocSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <g fill={hex}>
        <circle cx="12" cy="16" r="2.2" />
        <rect x="18" y="14" width="0" height="4" rx="1.5">
          <animate attributeName="width" values="0;28;28;28" keyTimes="0;0.2;0.85;1" dur="2.2s" repeatCount="indefinite" />
        </rect>
        <circle cx="12" cy="28" r="2.2" opacity="0.7">
          <animate attributeName="opacity" values="0;0.7;0.7;0.7" keyTimes="0;0.4;0.85;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <rect x="18" y="26" width="0" height="4" rx="1.5" opacity="0.7">
          <animate attributeName="width" values="0;0;24;24;24" keyTimes="0;0.4;0.6;0.85;1" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.7;0.7;0.7" keyTimes="0;0.4;0.85;1" dur="2.2s" repeatCount="indefinite" />
        </rect>
        <circle cx="12" cy="40" r="2.2" opacity="0.5">
          <animate attributeName="opacity" values="0;0;0.5;0.5;0.5" keyTimes="0;0.55;0.8;0.85;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <rect x="18" y="38" width="0" height="4" rx="1.5" opacity="0.5">
          <animate attributeName="width" values="0;0;0;20;20" keyTimes="0;0.55;0.7;0.85;1" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0;0.5;0.5;0.5" keyTimes="0;0.55;0.8;0.85;1" dur="2.2s" repeatCount="indefinite" />
        </rect>
      </g>
    </svg>
  )
}

function TranslateSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <path
        d="M5 12 H25 a3 3 0 0 1 3 3 v11 a3 3 0 0 1 -3 3 H12 l-4 4 v-4 a3 3 0 0 1 -3 -3 V15 a3 3 0 0 1 3 -3 Z"
        fill="none" stroke={hex} strokeWidth="1.8" strokeLinejoin="round"
      />
      <text x="16.5" y="25" textAnchor="middle" fontSize="11" fontWeight="700" fill={hex}>
        <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.4;0.5;0.95;1" dur="2.6s" repeatCount="indefinite" />
        A
      </text>
      <text x="16.5" y="25" textAnchor="middle" fontSize="11" fontWeight="700" fill={hex}>
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.4;0.5;0.95;1" dur="2.6s" repeatCount="indefinite" />
        あ
      </text>
      <path
        d="M31 24 H51 a3 3 0 0 1 3 3 v11 a3 3 0 0 1 -3 3 H44 l-4 4 v-4 H31 a3 3 0 0 1 -3 -3 V27 a3 3 0 0 1 3 -3 Z"
        fill={hex}
      />
      <text x="42.5" y="37" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
        <animate attributeName="opacity" values="0;0;0;1;1;0" keyTimes="0;0.4;0.5;0.55;0.95;1" dur="2.6s" repeatCount="indefinite" />
        文
      </text>
      <text x="42.5" y="37" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
        <animate attributeName="opacity" values="1;1;0;0;0;1" keyTimes="0;0.4;0.5;0.55;0.95;1" dur="2.6s" repeatCount="indefinite" />
        P
      </text>
    </svg>
  )
}

function SpeechSvg({ hex }: SvgProps) {
  const bars: Array<{ x: number; baseH: number; values: string; yValues: string; begin: string }> = [
    { x: 10, baseH: 16, values: "16;24;8;16", yValues: "20;16;24;20", begin: "0s" },
    { x: 17, baseH: 26, values: "26;14;30;26", yValues: "15;21;13;15", begin: "0.1s" },
    { x: 24, baseH: 18, values: "18;28;10;18", yValues: "19;14;23;19", begin: "0.2s" },
    { x: 31, baseH: 28, values: "28;16;26;28", yValues: "14;20;15;14", begin: "0.05s" },
    { x: 38, baseH: 16, values: "16;26;8;16", yValues: "20;15;24;20", begin: "0.15s" },
    { x: 45, baseH: 12, values: "12;20;6;12", yValues: "22;18;25;22", begin: "0.25s" },
  ]
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      {bars.map(({ x, baseH, values, yValues, begin }, i) => (
        <rect key={i} x={x} y={28 - baseH / 2} width="3" height={baseH} rx="1.5" fill={hex}>
          <animate attributeName="height" values={values} dur="1.4s" begin={begin} repeatCount="indefinite" />
          <animate attributeName="y" values={yValues} dur="1.4s" begin={begin} repeatCount="indefinite" />
        </rect>
      ))}
    </svg>
  )
}

function ValidationSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <path d="M28 6 L44 12 L44 28 Q44 41 28 50 Q12 41 12 28 L12 12 Z" fill="none" stroke={hex} strokeWidth="2" />
      <path d="M20 28 L26 34 L36 22" fill="none" stroke={hex} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="32" strokeDashoffset="32">
        <animate attributeName="stroke-dashoffset" values="32;32;0;0;32" keyTimes="0;0.15;0.55;0.85;1" dur="2.4s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

function PreviewSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <rect x="6" y="10" width="44" height="34" rx="3" fill="none" stroke={hex} strokeWidth="2" />
      <line x1="6" y1="18" x2="50" y2="18" stroke={hex} strokeWidth="1.5" />
      <circle cx="11" cy="14" r="1.3" fill={hex} opacity="0.5" />
      <circle cx="15" cy="14" r="1.3" fill={hex} opacity="0.5" />
      <circle cx="19" cy="14" r="1.3" fill={hex} opacity="0.5" />
      <rect x="24" y="12.5" width="22" height="3" rx="1.5" fill={hex} opacity="0.15" />
      <rect x="10" y="23" width="0" height="2" rx="1" fill={hex}>
        <animate attributeName="width" values="0;30;30;0" keyTimes="0;0.35;0.85;1" dur="2.2s" repeatCount="indefinite" />
      </rect>
      <rect x="10" y="28" width="0" height="2" rx="1" fill={hex} opacity="0.7">
        <animate attributeName="width" values="0;0;26;26;0" keyTimes="0;0.25;0.5;0.85;1" dur="2.2s" repeatCount="indefinite" />
      </rect>
      <rect x="10" y="33" width="0" height="8" rx="1" fill={hex} opacity="0.4">
        <animate attributeName="width" values="0;0;0;20;20;0" keyTimes="0;0.5;0.6;0.7;0.85;1" dur="2.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}

function ExportSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      <path d="M14 6 L34 6 L42 14 L42 50 L14 50 Z" fill="none" stroke={hex} strokeWidth="2" strokeLinejoin="round" />
      <path d="M34 6 L34 14 L42 14" fill="none" stroke={hex} strokeWidth="2" strokeLinejoin="round" />
      <g stroke={hex} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="28" y1="22" x2="28" y2="36">
          <animate attributeName="y1" values="22;19;22" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="y2" values="36;39;36" dur="1.4s" repeatCount="indefinite" />
        </line>
        <path d="M22 33 L28 39 L34 33">
          <animate attributeName="transform" attributeType="XML" type="translate" values="0 -3;0 0;0 -3" dur="1.4s" repeatCount="indefinite" />
        </path>
      </g>
    </svg>
  )
}

function EasyReadSvg({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      {/* Page */}
      <rect x="10" y="6" width="36" height="44" rx="3" fill="none" stroke={hex} strokeWidth="2" />
      {/* Dense "original" text — dims out during the simplify phase */}
      <g fill={hex}>
        <rect x="15" y="13" width="26" height="1.6" rx="0.8">
          <animate attributeName="opacity" values="0.4;0.4;0.1;0.1;0.4" keyTimes="0;0.28;0.46;0.9;1" dur="2.6s" repeatCount="indefinite" />
        </rect>
        <rect x="15" y="17.5" width="22" height="1.6" rx="0.8">
          <animate attributeName="opacity" values="0.4;0.4;0.1;0.1;0.4" keyTimes="0;0.28;0.46;0.9;1" dur="2.6s" repeatCount="indefinite" />
        </rect>
        <rect x="15" y="22" width="24" height="1.6" rx="0.8">
          <animate attributeName="opacity" values="0.4;0.4;0.1;0.1;0.4" keyTimes="0;0.28;0.46;0.9;1" dur="2.6s" repeatCount="indefinite" />
        </rect>
      </g>
      {/* Simplified "Easy Read" lines — grow in, bolder and rounded */}
      <rect x="15" y="31" width="0" height="3" rx="1.5" fill={hex}>
        <animate attributeName="width" values="0;0;24;24;0" keyTimes="0;0.46;0.64;0.9;1" dur="2.6s" repeatCount="indefinite" />
      </rect>
      <rect x="15" y="38" width="0" height="3" rx="1.5" fill={hex} opacity="0.65">
        <animate attributeName="width" values="0;0;0;17;17;0" keyTimes="0;0.46;0.64;0.78;0.9;1" dur="2.6s" repeatCount="indefinite" />
      </rect>
      {/* AI sparkle — twinkles as the simplified text appears */}
      <path d="M40 26.5 L41.2 28.8 L43.5 30 L41.2 31.2 L40 33.5 L38.8 31.2 L36.5 30 L38.8 28.8 Z" fill={hex}>
        <animate attributeName="opacity" values="0;0;1;0.3;1;0" keyTimes="0;0.5;0.62;0.74;0.86;1" dur="2.6s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

function BouncingDots({ hex }: SvgProps) {
  return (
    <svg viewBox="0 0 56 56" className="w-full h-full" aria-hidden="true">
      {[10, 28, 46].map((cx, i) => (
        <circle key={cx} cx={cx} cy="28" r="4" fill={hex}>
          <animate
            attributeName="cy"
            values="28;20;28"
            dur="1s"
            begin={`${i * 0.15}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  )
}

const STAGE_SVGS = {
  extract: ExtractSvg,
  sectioning: SectioningSvg,
  storyboard: StoryboardSvg,
  captions: CaptionsSvg,
  quizzes: QuizzesSvg,
  glossary: GlossarySvg,
  toc: TocSvg,
  "easy-read": EasyReadSvg,
  translate: TranslateSvg,
  speech: SpeechSvg,
  validation: ValidationSvg,
  preview: PreviewSvg,
  export: ExportSvg,
} satisfies Record<string, (props: SvgProps) => ReactNode>

function resolveStage(slug: StageSlug | undefined): { hex: string; Svg: (props: SvgProps) => ReactNode } {
  const fallback = { hex: "#737373", Svg: BouncingDots }
  if (!slug) return fallback
  const Svg = STAGE_SVGS[slug]
  const def = STAGES.find((s) => s.slug === slug) as StageDefinition | undefined
  if (!def) return fallback
  return { hex: def.hex, Svg }
}

export function LoadingState({ label, stageSlug }: LoadingStateProps) {
  const stage = resolveStage(stageSlug)
  const visible = useDelayedFlag(true, SHOW_DELAY_MS)

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex h-full min-h-105 w-full flex-col items-center justify-center gap-2 p-8"
    >
      {visible && (
        <>
          <span className="block w-32 h-32">{stage.Svg({ hex: stage.hex })}</span>
          <span
            className="text-sm font-medium tracking-wide opacity-80"
            style={{ color: stage.hex }}
          >
            {label}
          </span>
        </>
      )}
    </div>
  )
}
