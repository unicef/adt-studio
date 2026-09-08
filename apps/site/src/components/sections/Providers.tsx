import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { PROVIDER_GROUPS, type ProviderEntry } from "@/data/providers";
import { cn } from "@/lib/cn";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/motion";

/* ── Hub diagram data ─────────────────────────────────────────────────────── */

type Tile = { entry: ProviderEntry; groups: string[]; angle: number };

const byName = (group: string, name: string) =>
  PROVIDER_GROUPS.find((g) => g.key === group)!.entries.find((e) => e.name === name)!;

/** Nine unique providers around the hub; angle in degrees, 0 = top, clockwise. */
const TILES: Tile[] = [
  { entry: byName("subscription", "Codex"), groups: ["subscription"], angle: -70 },
  { entry: byName("subscription", "Claude Code"), groups: ["subscription"], angle: -30 },
  { entry: byName("api", "OpenAI"), groups: ["api", "speech"], angle: 10 },
  { entry: byName("api", "Anthropic"), groups: ["api"], angle: 50 },
  { entry: byName("api", "Google Gemini"), groups: ["api", "speech"], angle: 90 },
  { entry: byName("api", "OpenAI-compatible"), groups: ["api"], angle: 130 },
  { entry: byName("local", "Ollama"), groups: ["local"], angle: 170 },
  { entry: byName("speech", "Azure Speech"), groups: ["speech"], angle: 215 },
  { entry: byName("speech", "ElevenLabs"), groups: ["speech"], angle: 260 },
];

const RADIUS = 41;
const CENTER = 50;
const AUTO_ROTATE_MS = 4200;

function polar(angle: number, radius = RADIUS) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function beamPath(angle: number) {
  const from = polar(angle, RADIUS - 6);
  const control = polar(angle + 16, RADIUS * 0.5);
  const to = polar(angle, 11);
  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
}

/* ── Components ───────────────────────────────────────────────────────────── */

function TileGlyph({ entry, className }: { entry: ProviderEntry; className?: string }) {
  const Icon = entry.icon;
  return entry.svg ? (
    <span className={cn("[&>svg]:size-full [&>svg]:fill-current", className)} dangerouslySetInnerHTML={{ __html: entry.svg }} />
  ) : Icon ? (
    <Icon className={className} strokeWidth={2} />
  ) : null;
}

function Hub({ active, onHover }: { active: string; onHover: (group: string | null) => void }) {
  const { i18n } = useLingui();
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px] select-none">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[8%] rounded-full border border-dashed border-ink-faint/80 [animation:spin_120s_linear_infinite]"
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="hub-glow">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={CENTER} cy={CENTER} r="22" fill="url(#hub-glow)">
          {!reduced ? <animate attributeName="r" values="20;24;20" dur="4s" repeatCount="indefinite" /> : null}
        </circle>
        {TILES.map((tile, index) => {
          const on = tile.groups.includes(active);
          const d = beamPath(tile.angle);
          const id = `beam-${index}`;
          return (
            <g key={tile.entry.name}>
              <path
                id={id}
                d={d}
                fill="none"
                stroke={on ? "var(--color-brand)" : "var(--color-ink-faint)"}
                strokeOpacity={on ? 0.55 : 0.6}
                strokeWidth={on ? 0.5 : 0.35}
                strokeLinecap="round"
                className="transition-[stroke,stroke-width,stroke-opacity] duration-500"
              />
              {on && !reduced ? (
                <circle r="0.9" fill="var(--color-brand)">
                  <animateMotion dur="2.2s" begin={`${index * 0.35}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${id}`} />
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="2.2s" begin={`${index * 0.35}s`} repeatCount="indefinite" />
                </circle>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="relative grid size-[88px] place-items-center rounded-[26px] border border-ink-line bg-white shadow-[0_2px_4px_rgb(18_27_43/0.06),0_24px_50px_-20px_rgb(37_99_235/0.45)] sm:size-[104px] sm:rounded-[30px]"
          animate={reduced ? undefined : { scale: [1, 1.03, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="ADT Studio" width={56} height={56} className="size-12 rounded-2xl sm:size-14" />
          <span aria-hidden className="absolute -inset-2 rounded-[34px] border border-brand/20" />
        </motion.div>
      </div>

      {TILES.map((tile, index) => {
        const { x, y } = polar(tile.angle);
        const on = tile.groups.includes(active);
        const isHovered = hovered === tile.entry.name;
        return (
          <motion.button
            key={tile.entry.name}
            type="button"
            className="absolute -translate-x-1/2 -translate-y-1/2 focus-visible:outline-none"
            style={{ left: `${x}%`, top: `${y}%` }}
            onHoverStart={() => {
              setHovered(tile.entry.name);
              onHover(tile.groups[0]);
            }}
            onHoverEnd={() => {
              setHovered(null);
              onHover(null);
            }}
            onFocus={() => onHover(tile.groups[0])}
            onBlur={() => onHover(null)}
            aria-label={`${tile.entry.name}: ${i18n._(tile.entry.note)}`}
            animate={{ scale: on ? 1 : 0.86, opacity: on ? 1 : 0.45 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <motion.span
              className={cn(
                "grid size-12 place-items-center rounded-2xl border bg-white shadow-[0_1px_2px_rgb(18_27_43/0.05),0_14px_30px_-16px_rgb(18_27_43/0.35)] sm:size-14 sm:rounded-[18px]",
                on ? "border-brand/40 ring-4 ring-brand/10" : "border-ink-line",
              )}
              style={{ color: tile.entry.color }}
              animate={reduced ? undefined : { y: [0, -4, 0] }}
              transition={{ duration: 5 + (index % 3), repeat: Infinity, ease: "easeInOut", delay: index * 0.4 }}
              whileHover={{ scale: 1.1 }}
            >
              <TileGlyph entry={tile.entry} className="size-5 sm:size-6" />
            </motion.span>
            <AnimatePresence>
              {isHovered ? (
                <motion.span
                  className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white shadow-card"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                >
                  {tile.entry.name}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

export function Providers() {
  const { t, i18n } = useLingui();
  const [selected, setSelected] = useState(PROVIDER_GROUPS[0].key);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const active = hoverGroup ?? selected;
  const group = useMemo(() => PROVIDER_GROUPS.find((g) => g.key === active) ?? PROVIDER_GROUPS[0], [active]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView || hoverGroup) return;
    const timer = window.setInterval(() => {
      setSelected((current) => {
        const index = PROVIDER_GROUPS.findIndex((g) => g.key === current);
        return PROVIDER_GROUPS[(index + 1) % PROVIDER_GROUPS.length].key;
      });
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused, inView, hoverGroup]);


  return (
    <section
      id="providers"
      ref={sectionRef}
      className="snap-section relative scroll-mt-[72px] md:scroll-mt-0 flex flex-col justify-center overflow-hidden bg-paper py-14"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(45%_50%_at_75%_50%,color-mix(in_oklch,var(--color-brand)_12%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16">
        <div className="flex flex-col">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow={<Trans>AI-agnostic</Trans>}
              title={<Trans>Your AI, your choice.</Trans>}
              body={
                <Trans>
                  ADT Studio doesn't sell you a model. Sign in with the
                  subscription you already have, bring an API key, or run a model
                  locally. Switch any time; your books don't care.
                </Trans>
              }
            />
          </Reveal>

          <Reveal className="mt-8">
            <div
              role="tablist"
              aria-label={t`Provider types`}
              className="flex flex-wrap gap-1"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              {PROVIDER_GROUPS.map((g) => {
                const on = g.key === active;
                return (
                  <button
                    key={g.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSelected(g.key)}
                    className={cn(
                      "relative whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      on ? "text-white" : "text-ink-soft hover:text-ink",
                    )}
                  >
                    {on ? (
                      <motion.span
                        layoutId="provider-tab"
                        className="absolute inset-0 rounded-full bg-ink"
                        transition={SPRING_LAYOUT}
                      />
                    ) : null}
                    <span className="relative">{i18n._(g.title)}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative mt-4 min-h-[172px] rounded-3xl border border-ink-line bg-white p-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={group.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: EASE_OUT }}
                >
                  <p className="text-[15px] leading-relaxed text-ink-soft">{i18n._(group.blurb)}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {group.entries.map((entry, index) => (
                      <motion.li
                        key={entry.name}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.05 + index * 0.05, duration: 0.25, ease: EASE_OUT }}
                        className="inline-flex items-center gap-2 rounded-full border border-ink-line bg-paper py-1.5 pl-1.5 pr-3 text-sm font-bold text-ink"
                        title={i18n._(entry.note)}
                      >
                        <span className="grid size-6 place-items-center rounded-full bg-white" style={{ color: entry.color }}>
                          <TileGlyph entry={entry} className="size-3.5" />
                        </span>
                        {entry.name}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
              <div className="absolute inset-x-5 bottom-0 h-0.5 overflow-hidden rounded-full bg-ink-line">
                {!paused && !hoverGroup ? (
                  <motion.span
                    key={`${group.key}-progress`}
                    className="block h-full bg-brand"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: AUTO_ROTATE_MS / 1000, ease: "linear" }}
                  />
                ) : null}
              </div>
            </div>
          </Reveal>

        </div>

        <Reveal className="w-full">
          <Hub active={active} onHover={setHoverGroup} />
        </Reveal>
      </div>
    </section>
  );
}
