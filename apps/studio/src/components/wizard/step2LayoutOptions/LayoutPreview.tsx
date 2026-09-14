import { Sparkles, LayoutTemplate } from "lucide-react"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { RenderStrategyId } from "@/components/wizard/constants"
import { RENDER_STRATEGIES } from "@/components/wizard/constants"
import { PreviewShell } from "@/components/wizard/shared/PreviewShell"

// ─── Per-strategy preview width ──────────────────────────────────────────────

const STRATEGY_WIDTHS: Record<RenderStrategyId, number> = {
  llm: 650,
  "llm-overlay": 650,
  single_column: 650,
  two_column: 650,
  two_column_story: 980,
  fixed_layout: 650,
}

export function getPreviewWidth(strategy: string): number {
  return STRATEGY_WIDTHS[strategy as RenderStrategyId] ?? 650
}

// ─── Shared placeholder primitives ──────────────────────────────────────────

/* eslint-disable lingui/no-unlocalized-strings -- Lorem ipsum: layout mockup filler only (not translated) */
const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."
/* eslint-enable lingui/no-unlocalized-strings */

const DYNAMIC_PREVIEW_STAGE_LABELS = [msg`Evaporation`, msg`Condensation`, msg`Precipitation`] as const

const SINGLE_COLUMN_DEFINITIONS = [
  {
    term: msg`API`,
    definition: msg`Application Programming Interface — a set of rules that allows programs to communicate.`,
  },
  {
    term: msg`Endpoint`,
    definition: msg`A specific URL where an API can be accessed and a request submitted.`,
  },
  {
    term: msg`Payload`,
    definition: msg`The data sent within the body of a request or response message.`,
  },
  {
    term: msg`Token`,
    definition: msg`A unique string used to authenticate and authorize API requests.`,
  },
] as const

const SINGLE_COLUMN_TABLE_HEADERS = [msg`Method`, msg`Transport`, msg`Expiry`] as const

const SINGLE_COLUMN_TABLE_ROWS = [
  [msg`Bearer Token`, msg`Header`, msg`1 hour`],
  [msg`API Key`, msg`Query param`, msg`Never`],
  [msg`OAuth 2.0`, msg`Header`, msg`Custom`],
] as const

// ─── Dynamic (LLM) — textbook-style page mockup (The Water Cycle) ──────────

function DynamicPreview() {
  const { i18n } = useLingui()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-4 text-foreground @min-[420px]:px-5 @min-[420px]:py-6 @min-[540px]:px-8 @min-[540px]:py-8 @min-[620px]:px-10 @min-[620px]:py-10">
      {/* Chapter heading */}
      <div className="mb-2 flex items-center gap-2 border-b-2 border-brand-600/30 pb-2 @min-[540px]:mb-3 @min-[540px]:pb-3">
        <div className="flex size-5 shrink-0 items-center justify-center rounded bg-brand-600 text-[8px] font-bold text-white @min-[540px]:size-6 @min-[540px]:text-[10px]">
          5
        </div>
        <h2 className="text-sm font-bold tracking-tight @min-[420px]:text-base @min-[540px]:text-lg @min-[620px]:text-xl">
          <Trans>The Water Cycle</Trans>
        </h2>
      </div>

      {/* Intro paragraph */}
      <p className="mb-2 text-[8px] leading-[12px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:mb-3 @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-xs @min-[620px]:leading-4">
        <Trans>
          Water is always moving. It travels from the oceans into the sky, falls as
          rain or snow, flows through rivers, and eventually returns to the sea. This
          continuous journey is called the water cycle.
        </Trans>
      </p>

      {/* Diagram + caption row */}
      <div className="mb-2 flex items-start gap-2 @min-[540px]:mb-3 @min-[540px]:gap-3">
        <div className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md @min-[420px]:h-20 @min-[420px]:w-28 @min-[540px]:h-24 @min-[540px]:w-36">
          {/* Water cycle diagram */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-blue-100" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 144 96" fill="none" preserveAspectRatio="none" aria-hidden>
            {/* Ocean */}
            <rect x="0" y="72" width="144" height="24" fill="#3b82f6" opacity="0.35" />
            <path d="M0 72 Q18 68 36 72 Q54 76 72 72 Q90 68 108 72 Q126 76 144 72" stroke="#3b82f6" strokeWidth="1" fill="none" opacity="0.5" />
            {/* Mountain/land */}
            <polygon points="100,40 70,72 130,72" fill="#65a30d" opacity="0.4" />
            <polygon points="110,50 90,72 130,72" fill="#4d7c0f" opacity="0.3" />
            {/* Evaporation arrows */}
            <path d="M30 70 L30 48" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.7" />
            <path d="M30 48 L27 52 M30 48 L33 52" stroke="#60a5fa" strokeWidth="1.5" opacity="0.7" />
            <path d="M50 68 L45 45" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.6" />
            {/* Cloud */}
            <ellipse cx="60" cy="24" rx="22" ry="10" fill="#94a3b8" opacity="0.5" />
            <ellipse cx="50" cy="22" rx="14" ry="8" fill="#cbd5e1" opacity="0.6" />
            <ellipse cx="72" cy="22" rx="12" ry="7" fill="#cbd5e1" opacity="0.5" />
            {/* Rain drops */}
            <line x1="55" y1="34" x2="52" y2="44" stroke="#3b82f6" strokeWidth="1.2" opacity="0.6" />
            <line x1="62" y1="34" x2="59" y2="46" stroke="#3b82f6" strokeWidth="1.2" opacity="0.5" />
            <line x1="69" y1="34" x2="66" y2="42" stroke="#3b82f6" strokeWidth="1.2" opacity="0.6" />
            {/* River flowing down */}
            <path d="M105 52 Q100 60 90 66 Q80 70 65 72" stroke="#3b82f6" strokeWidth="1.5" fill="none" opacity="0.5" />
            {/* Sun */}
            <circle cx="130" cy="16" r="8" fill="#fbbf24" opacity="0.6" />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[7px] font-medium italic text-muted-foreground @min-[420px]:text-[8px] @min-[540px]:text-[9px]">
            <Trans>
              Figure 5.1 - The water cycle: evaporation from oceans, condensation
              into clouds, precipitation as rain, and runoff back to the sea.
            </Trans>
          </p>
          <p className="text-[8px] leading-[12px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-xs @min-[620px]:leading-4">
            <Trans>
              The sun heats water in oceans, lakes, and rivers, turning it into
              vapor that rises into the atmosphere. As the vapor cools at higher
              altitudes, it condenses into tiny droplets that form clouds.
            </Trans>
          </p>
        </div>
      </div>

      {/* Exercise box */}
      <div className="mb-2 rounded-lg border border-brand-600/25 bg-brand-50 px-2.5 py-2 @min-[420px]:px-3 @min-[540px]:mb-3 @min-[540px]:px-4 @min-[540px]:py-3">
        <div className="mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-brand-600 @min-[540px]:h-3.5 @min-[540px]:w-3.5" strokeWidth={2} />
          <span className="text-[9px] font-bold uppercase tracking-wide text-brand-600 @min-[420px]:text-[10px] @min-[540px]:text-[11px]">
            <Trans>Activity 5.1</Trans>
          </span>
        </div>
        <p className="mb-1.5 text-[8px] leading-[11px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px]">
          <Trans>Match each stage of the water cycle to its definition:</Trans>
        </p>
        <div className="flex flex-col gap-1">
          {DYNAMIC_PREVIEW_STAGE_LABELS.map((labelMsg, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 shrink-0 rounded border border-brand-600/30 bg-white @min-[540px]:h-4 @min-[540px]:w-4" />
              <span className="text-[8px] text-foreground/80 @min-[420px]:text-[9px] @min-[540px]:text-[10px]">
                {i18n._(labelMsg)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Did-you-know callout */}
      <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 @min-[420px]:px-3 @min-[540px]:px-4 @min-[540px]:py-2.5">
        <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 @min-[420px]:text-[10px] @min-[540px]:text-[11px]">
          <Trans>Did you know?</Trans>
        </span>
        <p className="mt-0.5 text-[8px] leading-[11px] text-amber-900/70 dark:text-amber-100/80 @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px]">
          <Trans>
            A single water molecule can take over 3,000 years to complete one full
            trip through the water cycle - from ocean to sky to river and back again.
          </Trans>
        </p>
      </div>
    </div>
  )
}

// ─── Dynamic Overlay (LLM-Overlay) — illustrated page with text overlay (Ocean Life) ─

function OverlayPreview() {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Original page background — underwater coral reef scene */}
      <div className="absolute inset-0" aria-hidden>
        {/* Deep ocean gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0ea5e9] via-[#0284c7] to-[#0c4a6e]" />
        {/* Light rays from surface */}
        <div className="absolute left-[20%] top-0 h-[60%] w-[8%] origin-top rotate-[8deg] bg-gradient-to-b from-white/15 to-transparent" />
        <div className="absolute left-[40%] top-0 h-[50%] w-[5%] origin-top -rotate-[3deg] bg-gradient-to-b from-white/10 to-transparent" />
        <div className="absolute right-[30%] top-0 h-[55%] w-[6%] origin-top rotate-[5deg] bg-gradient-to-b from-white/12 to-transparent" />

        <svg className="absolute bottom-0 h-full w-full" viewBox="0 0 650 812" fill="none" preserveAspectRatio="none">
          {/* Sandy ocean floor */}
          <rect x="0" y="700" width="650" height="112" fill="#d4a76a" opacity="0.3" />
          <ellipse cx="200" cy="740" rx="80" ry="8" fill="#c2956b" opacity="0.2" />
          <ellipse cx="480" cy="750" rx="60" ry="6" fill="#c2956b" opacity="0.15" />

          {/* Coral formations */}
          {/* Left coral cluster — branching coral */}
          <path d="M80 720 Q80 660 65 620 Q55 590 50 560" stroke="#f472b6" strokeWidth="8" fill="none" opacity="0.5" strokeLinecap="round" />
          <path d="M80 720 Q90 670 100 640 Q115 610 120 580" stroke="#fb7185" strokeWidth="7" fill="none" opacity="0.45" strokeLinecap="round" />
          <path d="M80 720 Q75 680 60 660" stroke="#ec4899" strokeWidth="6" fill="none" opacity="0.4" strokeLinecap="round" />
          <circle cx="50" cy="555" r="10" fill="#f472b6" opacity="0.5" />
          <circle cx="120" cy="575" r="12" fill="#fb7185" opacity="0.45" />
          <circle cx="60" cy="655" r="8" fill="#ec4899" opacity="0.4" />

          {/* Center coral — brain/dome coral */}
          <ellipse cx="325" cy="710" rx="55" ry="30" fill="#a78bfa" opacity="0.35" />
          <ellipse cx="325" cy="705" rx="45" ry="22" fill="#c4b5fd" opacity="0.25" />
          <path d="M290 700 Q310 690 325 700 Q340 710 360 700" stroke="#7c3aed" strokeWidth="1.5" fill="none" opacity="0.3" />
          <path d="M295 710 Q315 700 330 710 Q345 720 355 710" stroke="#7c3aed" strokeWidth="1.5" fill="none" opacity="0.25" />

          {/* Right coral — sea fan */}
          <path d="M540 730 Q530 670 520 620 Q510 570 530 530" stroke="#f97316" strokeWidth="3" fill="none" opacity="0.4" />
          <path d="M540 730 Q550 680 560 640 Q570 600 555 560" stroke="#fb923c" strokeWidth="3" fill="none" opacity="0.35" />
          <path d="M525 600 Q540 580 555 590" stroke="#f97316" strokeWidth="2" fill="none" opacity="0.3" />
          <path d="M518 640 Q535 625 558 635" stroke="#fb923c" strokeWidth="2" fill="none" opacity="0.3" />
          <path d="M522 570 Q538 555 548 568" stroke="#f97316" strokeWidth="2" fill="none" opacity="0.25" />

          {/* Seaweed */}
          <path d="M160 740 Q155 690 165 650 Q170 620 160 590" stroke="#22c55e" strokeWidth="5" fill="none" opacity="0.35" strokeLinecap="round" />
          <path d="M170 740 Q175 700 168 670 Q160 640 172 610" stroke="#16a34a" strokeWidth="4" fill="none" opacity="0.3" strokeLinecap="round" />
          <path d="M450 735 Q445 700 455 670 Q460 645 450 620" stroke="#22c55e" strokeWidth="4" fill="none" opacity="0.3" strokeLinecap="round" />

          {/* Fish */}
          {/* Orange fish — right side */}
          <ellipse cx="480" cy="340" rx="18" ry="10" fill="#fb923c" opacity="0.6" />
          <polygon points="498,340 512,332 512,348" fill="#f97316" opacity="0.5" />
          <circle cx="472" cy="337" r="2" fill="#1e293b" opacity="0.6" />
          {/* Blue fish — left side */}
          <ellipse cx="140" cy="420" rx="15" ry="8" fill="#60a5fa" opacity="0.55" />
          <polygon points="125,420 112,413 112,427" fill="#3b82f6" opacity="0.45" />
          <circle cx="148" cy="418" r="1.5" fill="#1e293b" opacity="0.55" />
          {/* Small fish school — upper center */}
          <ellipse cx="300" cy="240" rx="8" ry="4" fill="#fbbf24" opacity="0.4" />
          <ellipse cx="320" cy="235" rx="8" ry="4" fill="#fbbf24" opacity="0.35" />
          <ellipse cx="310" cy="250" rx="8" ry="4" fill="#fbbf24" opacity="0.38" />
          <ellipse cx="335" cy="245" rx="8" ry="4" fill="#fbbf24" opacity="0.32" />

          {/* Bubbles */}
          <circle cx="200" cy="500" r="4" fill="white" opacity="0.15" />
          <circle cx="210" cy="470" r="3" fill="white" opacity="0.12" />
          <circle cx="195" cy="440" r="2.5" fill="white" opacity="0.1" />
          <circle cx="420" cy="480" r="3.5" fill="white" opacity="0.13" />
          <circle cx="430" cy="450" r="2" fill="white" opacity="0.1" />

          {/* Sea turtle — center */}
          <ellipse cx="380" cy="460" rx="22" ry="16" fill="#16a34a" opacity="0.4" />
          <ellipse cx="380" cy="460" rx="18" ry="12" fill="#22c55e" opacity="0.3" />
          <circle cx="397" cy="454" r="4" fill="#15803d" opacity="0.45" />
          <circle cx="399" cy="453" r="1.2" fill="#1e293b" opacity="0.4" />
          {/* Flippers */}
          <path d="M365 468 Q350 478 345 475" stroke="#16a34a" strokeWidth="4" fill="none" opacity="0.35" strokeLinecap="round" />
          <path d="M395 468 Q410 478 415 475" stroke="#16a34a" strokeWidth="4" fill="none" opacity="0.35" strokeLinecap="round" />
        </svg>
      </div>

      {/* Text overlay layer — positioned over the illustration */}
      <div className="relative z-10 flex h-full flex-col px-4 py-5 @min-[420px]:px-6 @min-[420px]:py-6 @min-[540px]:px-8 @min-[540px]:py-8 @min-[620px]:px-10 @min-[620px]:py-10">
        {/* Title area — top of page */}
        <div className="mb-3 @min-[540px]:mb-4">
          <h2 className="text-base font-extrabold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] @min-[420px]:text-lg @min-[540px]:text-xl @min-[620px]:text-2xl">
            <Trans>Life in the Coral Reef</Trans>
          </h2>
          <p className="mt-1 text-[9px] font-semibold leading-snug text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] @min-[420px]:text-[10px] @min-[540px]:text-[11px] @min-[620px]:text-xs">
            <Trans>Chapter 7 - Marine Biology</Trans>
          </p>
        </div>

        {/* Flowing body text — wrapping around the reef */}
        <div className="flex flex-1 flex-col gap-2 @min-[540px]:gap-3">
          {/* Top text block */}
          <div className="rounded-md bg-white/75 px-2.5 py-1.5 shadow-sm backdrop-blur-sm @min-[540px]:px-3 @min-[540px]:py-2">
            <p className="text-[8px] leading-[12px] text-[#1a1a1a] @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-[11px] @min-[620px]:leading-4">
              <Trans>
                Coral reefs cover less than 1% of the ocean floor, yet they support
                roughly 25% of all marine species. Often called the &apos;rainforests of
                the sea,&apos; these underwater ecosystems are built by tiny animals called
                coral polyps.
              </Trans>
            </p>
          </div>

          {/* Side text blocks — flanking the central reef illustration */}
          <div className="flex gap-2 @min-[540px]:gap-3">
            <div className="flex-1 rounded-md bg-white/75 px-2.5 py-1.5 shadow-sm backdrop-blur-sm @min-[540px]:px-3 @min-[540px]:py-2">
              <p className="text-[8px] leading-[12px] text-[#1a1a1a] @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-[11px] @min-[620px]:leading-4">
                <Trans>
                  Each polyp secretes a hard calcium carbonate skeleton. Over hundreds
                  of years, millions of these skeletons build up into the massive reef
                  structures we see today.
                </Trans>
              </p>
            </div>
            {/* Gap where the reef illustration shows through */}
            <div className="w-[30%] shrink-0 @min-[420px]:w-[35%] @min-[540px]:w-[40%]" />
            <div className="flex-1 rounded-md bg-white/75 px-2.5 py-1.5 shadow-sm backdrop-blur-sm @min-[540px]:px-3 @min-[540px]:py-2">
              <p className="text-[8px] leading-[12px] text-[#1a1a1a] @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-[11px] @min-[620px]:leading-4">
                <Trans>
                  Clownfish, sea turtles, and parrotfish are just a few of the
                  thousands of species that depend on reefs for food, shelter, and
                  nursery grounds.
                </Trans>
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Bottom text block */}
          <div className="rounded-md bg-white/75 px-2.5 py-1.5 shadow-sm backdrop-blur-sm @min-[540px]:px-3 @min-[540px]:py-2">
            <p className="text-[8px] leading-[12px] text-[#1a1a1a] @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-[11px] @min-[620px]:leading-4">
              <Trans>
                Rising ocean temperatures cause coral bleaching - when stressed corals
                expel the colorful algae living inside them and turn white. Without
                these algae, corals slowly starve. Protecting reefs means reducing
                pollution, overfishing, and greenhouse gas emissions.
              </Trans>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Single Column — full-width reference/documentation layout ───────────────

function SingleColumnPreview() {
  const { i18n } = useLingui()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5 text-foreground @min-[420px]:px-6 @min-[420px]:py-6 @min-[540px]:px-10 @min-[540px]:py-8 @min-[620px]:px-14 @min-[620px]:py-10">

      {/* Section heading */}
      <div className="mb-3 border-b border-border pb-2 @min-[540px]:mb-4 @min-[540px]:pb-3">
        <p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground @min-[420px]:text-[9px] @min-[540px]:text-[10px]">
          <Trans>Section 3.2</Trans>
        </p>
        <h2 className="text-sm font-bold leading-tight @min-[420px]:text-base @min-[540px]:text-lg @min-[620px]:text-xl">
          <Trans>Definitions and Terminology</Trans>
        </h2>
      </div>

      {/* Intro paragraph */}
      <p className="mb-3 text-[8px] leading-[13px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[14px] @min-[540px]:mb-4 @min-[540px]:text-[10px] @min-[540px]:leading-[15px] @min-[620px]:text-xs @min-[620px]:leading-4">
        <Trans>
          The following terms are used throughout this manual. Familiarity with these definitions is
          required before proceeding to the implementation chapters.
        </Trans>
      </p>

      {/* Definition list */}
      <div className="mb-3 flex flex-col divide-y divide-border rounded-lg border border-border @min-[540px]:mb-4">
        {SINGLE_COLUMN_DEFINITIONS.map(({ term, definition }, idx) => (
          <div
            key={idx}
            className="flex gap-2 px-2.5 py-1.5 @min-[540px]:gap-3 @min-[540px]:px-3 @min-[540px]:py-2"
          >
            <span className="w-14 shrink-0 text-[8px] font-bold text-foreground @min-[420px]:w-16 @min-[420px]:text-[9px] @min-[540px]:w-20 @min-[540px]:text-[10px] @min-[620px]:text-xs">
              {i18n._(term)}
            </span>
            <span className="text-[8px] leading-[12px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-xs @min-[620px]:leading-4">
              {i18n._(definition)}
            </span>
          </div>
        ))}
      </div>

      {/* Note callout */}
      <div className="mb-3 rounded border-l-2 border-muted-foreground bg-muted px-2.5 py-1.5 @min-[540px]:mb-4 @min-[540px]:px-3 @min-[540px]:py-2">
        <p className="text-[8px] font-semibold text-foreground @min-[420px]:text-[9px] @min-[540px]:text-[10px] @min-[620px]:text-xs">
          <Trans>Note</Trans>
        </p>
        <p className="mt-0.5 text-[8px] leading-[12px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[13px] @min-[540px]:text-[10px] @min-[540px]:leading-[14px] @min-[620px]:text-xs @min-[620px]:leading-4">
          <Trans>
            Terms marked with an asterisk (*) are defined by the ISO standard and may differ from
            colloquial usage in other fields.
          </Trans>
        </p>
      </div>

      {/* Sub-section */}
      <h3 className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-foreground @min-[420px]:text-[10px] @min-[540px]:mb-2 @min-[540px]:text-[11px] @min-[620px]:text-xs">
        <Trans>3.2.1 — Authentication Methods</Trans>
      </h3>
      <p className="mb-3 text-[8px] leading-[13px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[14px] @min-[540px]:mb-4 @min-[540px]:text-[10px] @min-[540px]:leading-[15px] @min-[620px]:text-xs @min-[620px]:leading-4">
        <Trans>
          Two authentication methods are supported: Bearer tokens passed in the Authorization
          header, and API keys passed as a query parameter. Bearer tokens are preferred for
          server-to-server requests due to their short expiry window.
        </Trans>
      </p>

      {/* Table */}
      <div className="mb-3 overflow-hidden rounded-lg border border-border @min-[540px]:mb-4">
        <div className="grid grid-cols-3 divide-x divide-border bg-muted">
          {SINGLE_COLUMN_TABLE_HEADERS.map((h, idx) => (
            <div key={idx} className="px-2 py-1 @min-[540px]:px-3 @min-[540px]:py-1.5">
              <span className="text-[7px] font-bold uppercase tracking-wide text-foreground @min-[420px]:text-[8px] @min-[540px]:text-[9px] @min-[620px]:text-[10px]">
                {i18n._(h)}
              </span>
            </div>
          ))}
        </div>
        {SINGLE_COLUMN_TABLE_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-3 divide-x divide-border border-t border-border">
            {row.map((cell, colIdx) => (
              <div key={`${rowIdx}-${colIdx}`} className="px-2 py-1 @min-[540px]:px-3 @min-[540px]:py-1.5">
                <span className="text-[7px] text-foreground/80 @min-[420px]:text-[8px] @min-[540px]:text-[9px] @min-[620px]:text-[10px]">
                  {i18n._(cell)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Closing paragraph */}
      <p className="text-[8px] leading-[13px] text-foreground/80 @min-[420px]:text-[9px] @min-[420px]:leading-[14px] @min-[540px]:text-[10px] @min-[540px]:leading-[15px] @min-[620px]:text-xs @min-[620px]:leading-4">
        <Trans>
          Additional terminology may be introduced in later sections. All terms are listed in the
          glossary appendix at the end of this document for quick reference.
        </Trans>
      </p>
    </div>
  )
}

// ─── Two Column (always two columns — scale type + margins when container is narrow)

function TwoColumnPreview() {
  const body = LOREM

  return (
    <div className="flex h-full min-h-0 flex-row gap-2 px-2 py-4 text-foreground @min-[420px]:gap-3 @min-[420px]:px-3 @min-[420px]:py-6 @min-[540px]:gap-4 @min-[540px]:px-5 @min-[620px]:px-[30px] @min-[620px]:py-[66px]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-hidden px-1 @min-[420px]:gap-1.5 @min-[420px]:px-2 @min-[540px]:gap-2 @min-[620px]:gap-[10px] @min-[620px]:px-4">
        <p className="text-center text-sm font-semibold leading-tight tracking-[-0.6px] @min-[420px]:text-base @min-[420px]:leading-snug @min-[540px]:text-lg @min-[540px]:leading-7 @min-[620px]:text-2xl @min-[620px]:leading-8">
          <Trans>Chapter One</Trans>
        </p>
        <p className="text-[8px] leading-[11px] text-justify @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px] @min-[620px]:text-xs @min-[620px]:leading-[14px]">
          {body}
        </p>
        <p className="text-[8px] leading-[11px] text-justify @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px] @min-[620px]:text-xs @min-[620px]:leading-[14px]">
          {body}
        </p>
        <p className="text-[8px] leading-[11px] text-justify @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px] @min-[620px]:text-xs @min-[620px]:leading-[14px]">
          {body}
        </p>
        <p className="text-[8px] leading-[11px] text-justify @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px] @min-[620px]:text-xs @min-[620px]:leading-[14px]">
          {body}
        </p>
        <p className="min-h-0 flex-1 overflow-hidden text-[8px] leading-[11px] text-justify @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:text-[10px] @min-[540px]:leading-[13px] @min-[620px]:text-xs @min-[620px]:leading-[14px]">
          {body}
        </p>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto px-1 text-[8px] leading-[11px] text-justify @min-[420px]:gap-1.5 @min-[420px]:px-2 @min-[420px]:text-[9px] @min-[420px]:leading-[12px] @min-[540px]:gap-2 @min-[540px]:text-[10px] @min-[540px]:leading-[13px] @min-[620px]:gap-[10px] @min-[620px]:px-4 @min-[620px]:text-xs @min-[620px]:leading-[14px]">
        <p>{body}</p>
        <p>{body}</p>
        <p>{body}</p>
        <p>{body}</p>
      </div>
    </div>
  )
}

// ─── Two Column Story (always image | text — scale image + type when container is narrow)

function TwoColumnStoryPreview() {
  return (
    <div className="flex h-full min-h-0 flex-row items-center gap-2 px-2 py-4 @min-[420px]:gap-3 @min-[420px]:px-3 @min-[420px]:py-6 @min-[540px]:gap-4 @min-[540px]:px-5 @min-[620px]:px-[30px] @min-[620px]:py-[66px]">
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden @min-[620px]:px-4">
        <img
          alt=""
          src="/previews/two-column-story.png"
          className="pointer-events-none h-auto w-full max-h-[min(444px,42cqh)] max-w-[min(444px,44cqi)] object-contain @min-[540px]:max-h-[min(444px,48cqh)] @min-[540px]:max-w-[min(444px,46cqi)] @min-[620px]:max-h-[444px] @min-[620px]:max-w-[444px]"
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-1 @min-[420px]:px-2 @min-[620px]:px-4">
        <p className="text-pretty text-center text-[11px] font-semibold leading-snug tracking-[0.3px] text-foreground @min-[380px]:text-xs @min-[380px]:leading-snug @min-[480px]:text-sm @min-[480px]:leading-normal @min-[540px]:text-base @min-[540px]:leading-7 @min-[620px]:text-2xl @min-[620px]:leading-9 @min-[760px]:text-[30px] @min-[760px]:leading-10">
          <Trans>
            This is Pip! He is a happy caramel dog with a very wiggly tail. Pip loves the green
            grass, the bright yellow sun, and making new friends in his garden.
          </Trans>
        </p>
      </div>
    </div>
  )
}

function FixedLayoutPreview() {
  return (
    <div className="relative flex h-full min-h-0 items-center justify-center px-2 py-4 @min-[420px]:px-3 @min-[420px]:py-6 @min-[540px]:px-5 @min-[620px]:px-[30px] @min-[620px]:py-[66px]">
      <div className="relative h-full max-h-[444px] w-full max-w-[440px]">
        <img
          alt=""
          src="/previews/two-column-story.png"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <div className="absolute left-[8%] top-[58%] right-[8%] rounded-md bg-white/85 px-3 py-2 text-center text-[11px] font-semibold leading-snug tracking-[0.3px] text-[#1a1a1a] shadow-sm @min-[420px]:px-4 @min-[420px]:py-2.5 @min-[420px]:text-xs @min-[480px]:text-sm @min-[540px]:px-5 @min-[540px]:py-3 @min-[540px]:text-base @min-[620px]:text-lg @min-[760px]:text-xl">
          <Trans>This is Pip! He has a wiggly tail.</Trans>
        </div>
      </div>
    </div>
  )
}

// ─── Registry & export ──────────────────────────────────────────────────────

const STRATEGY_PREVIEWS: Record<RenderStrategyId, React.FC> = {
  llm: DynamicPreview,
  "llm-overlay": OverlayPreview,
  single_column: SingleColumnPreview,
  two_column: TwoColumnPreview,
  two_column_story: TwoColumnStoryPreview,
  fixed_layout: FixedLayoutPreview,
}

const RENDER_STRATEGY_LABEL = msg`Render Strategy`

export function LayoutPreview({ strategy }: { strategy: string }) {
  const { i18n } = useLingui()
  const Preview = STRATEGY_PREVIEWS[strategy as RenderStrategyId]
  const strategyDef = RENDER_STRATEGIES.find((s) => s.id === strategy)
  const label = strategyDef ? i18n._(strategyDef.title) : i18n._(RENDER_STRATEGY_LABEL)

  if (Preview) {
    return (
      <PreviewShell label={label}>
        <Preview />
      </PreviewShell>
    )
  }

  return (
    <PreviewShell label={label}>
      <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-muted-foreground">
          <LayoutTemplate className="h-7 w-7" />
        </div>
        <div className="max-w-[280px] text-center">
          <p className="text-base font-semibold text-foreground">
            <Trans>Render Strategy</Trans>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <Trans>
              Select a render strategy to preview how your book pages will be laid out.
            </Trans>
          </p>
        </div>
      </div>
    </PreviewShell>
  )
}
