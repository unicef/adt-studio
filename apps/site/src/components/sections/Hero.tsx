import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowRight, Cloud } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadButton } from "@/components/DownloadButton";
import { SCREENS, screenSrc } from "@/data/screens";
import { SUPPORTERS } from "@/data/supporters";
import { withBase } from "@/lib/href";
import { formatRelativeDate, releaseHeadline, useStableReleases } from "@/lib/useGithubReleases";
import openaiLogo from "@/assets/providers/openai.svg?raw";
import claudeLogo from "@/assets/providers/claude.svg?raw";
import geminiLogo from "@/assets/providers/gemini.svg?raw";
import ollamaLogo from "@/assets/providers/ollama.svg?raw";
import elevenLabsLogo from "@/assets/providers/elevenlabs.svg?raw";

type Provider = {
  name: string;
  svg?: string;
  color: string;
  /** Position inside the copy block (percentages). */
  style: React.CSSProperties;
  rotate: number;
  depth: number;
  delay: number;
};

const PROVIDERS: Provider[] = [
  { name: "OpenAI", svg: openaiLogo, color: "#0f172a", style: { top: "8%", left: "15%" }, rotate: -8, depth: 0.05, delay: 0 },
  { name: "Claude", svg: claudeLogo, color: "#d97757", style: { top: "30%", left: "3%" }, rotate: 6, depth: 0.09, delay: 0.8 },
  { name: "Gemini", svg: geminiLogo, color: "#1c69ff", style: { top: "6%", right: "17%" }, rotate: 7, depth: 0.06, delay: 1.6 },
  { name: "Ollama", svg: ollamaLogo, color: "#0f172a", style: { top: "27%", right: "1%" }, rotate: -6, depth: 0.1, delay: 0.4 },
  { name: "ElevenLabs", svg: elevenLabsLogo, color: "#0f172a", style: { top: "72%", left: "12%" }, rotate: 9, depth: 0.07, delay: 1.2 },
  { name: "Azure Speech", color: "#0078d4", style: { top: "70%", right: "11%" }, rotate: -9, depth: 0.08, delay: 2 },
];

function MobileTile({ provider, rotate }: { provider: Provider; rotate: number }) {
  return (
    <span
      className="grid size-14 place-items-center rounded-[18px] border border-ink-line bg-white shadow-[0_1px_2px_rgb(18_27_43/0.06),0_14px_30px_-16px_rgb(18_27_43/0.35)]"
      style={{ rotate: `${rotate}deg`, color: provider.color }}
      title={provider.name}
    >
      {provider.svg ? (
        <span className="size-6 [&>svg]:size-full [&>svg]:fill-current" dangerouslySetInnerHTML={{ __html: provider.svg }} />
      ) : (
        <Cloud className="size-6" strokeWidth={2} />
      )}
    </span>
  );
}

function ProviderTile({ provider, mx, my }: { provider: Provider; mx: ReturnType<typeof useSpring>; my: ReturnType<typeof useSpring> }) {
  const x = useTransform(mx, (value) => value * provider.depth * 120);
  const y = useTransform(my, (value) => value * provider.depth * 120);
  return (
    <motion.div
      aria-hidden
      className="absolute hidden lg:block"
      style={{ ...provider.style, x, y }}
    >
      <div
        className="hero-float grid size-[72px] place-items-center rounded-[22px] border border-ink-line bg-white text-ink shadow-[0_1px_2px_rgb(18_27_43/0.06),0_18px_40px_-18px_rgb(18_27_43/0.35)] transition-transform duration-300 ease-out-quart hover:scale-105"
        style={{ rotate: `${provider.rotate}deg`, animationDelay: `${provider.delay}s`, color: provider.color }}
        title={provider.name}
      >
        {provider.svg ? (
          <span className="size-8 [&>svg]:size-full [&>svg]:fill-current" dangerouslySetInnerHTML={{ __html: provider.svg }} />
        ) : (
          <Cloud className="size-8" strokeWidth={2} />
        )}
      </div>
    </motion.div>
  );
}

export function Hero() {
  const { i18n } = useLingui();
  const { releases } = useStableReleases();
  const latest = releases?.[0];
  const reduced = useReducedMotion();

  const mxRaw = useMotionValue(0);
  const myRaw = useMotionValue(0);
  const mx = useSpring(mxRaw, { stiffness: 60, damping: 20, mass: 0.8 });
  const my = useSpring(myRaw, { stiffness: 60, damping: 20, mass: 0.8 });

  const onPointerMove = (event: React.PointerEvent) => {
    if (reduced || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    mxRaw.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
    myRaw.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
  };
  const onPointerLeave = () => {
    mxRaw.set(0);
    myRaw.set(0);
  };

  return (
    <section
      id="top"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="snap-section relative overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--color-brand)_12%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--color-ink-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-ink-line)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(60%_55%_at_50%_30%,black,transparent)]"
      />

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col justify-center px-5 pt-[104px] sm:px-8 sm:pt-[144px]">
        <div className="relative mx-auto flex w-full max-w-[1040px] flex-col items-center text-center">
          {PROVIDERS.map((provider) => (
            <ProviderTile key={provider.name} provider={provider} mx={mx} my={my} />
          ))}

          <ul aria-label="AI providers" className="mb-8 flex w-full items-start justify-between px-1 sm:px-8 lg:hidden">
            {PROVIDERS.slice(0, 4).map((provider, index) => (
              <li
                key={provider.name}
                className="hero-float"
                style={{
                  translate: `0 ${[0, 18, 6, 22][index]}px`,
                  animationDelay: `${provider.delay}s`,
                }}
              >
                <MobileTile provider={provider} rotate={[-8, 6, -5, 7][index]} />
              </li>
            ))}
          </ul>

          <a
            href={withBase(latest ? `/releases/${encodeURIComponent(latest.tag_name)}` : "/releases")}
            className="enter group relative inline-flex h-9 max-w-full items-center gap-2 rounded-full border border-ink-line bg-white pl-1.5 pr-3.5 text-[13px] font-semibold text-ink-soft shadow-[0_1px_2px_rgb(18_27_43/0.04)] transition-colors duration-200 hover:border-brand/40 hover:text-ink"
          >
            <span className="inline-flex h-6 items-center rounded-full bg-brand px-2.5 font-mono text-[11px] font-bold text-white">
              {latest ? latest.tag_name : <Trans>New</Trans>}
            </span>
            <span className="truncate">
              {latest ? (
                <>
                  {releaseHeadline(latest)}
                  <span className="hidden text-ink-mute sm:inline"> · {formatRelativeDate(latest.published_at)}</span>
                </>
              ) : (
                <Trans>A redesigned Studio with more AI providers</Trans>
              )}
            </span>
            <ArrowRight className="size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>

          <h1 className="enter enter-1 relative mt-7 max-w-[15ch] text-balance font-display text-[46px] font-extrabold leading-[0.96] tracking-[-0.035em] text-ink sm:text-[64px] lg:text-[88px]">
            <Trans>
              From PDF to <span className="text-brand">accessible books.</span>
            </Trans>
          </h1>

          <p className="enter enter-2 relative mt-6 max-w-[660px] text-pretty text-[17px] leading-relaxed text-ink-soft sm:text-xl">
            <Trans>
              Narration, easy-read, translations, sign language, quizzes and
              more, generated from any textbook. Bring your own AI: OpenAI,
              Claude, Gemini or Ollama, or sign in with Codex and Claude Code.
              Free, open source, runs on your computer.
            </Trans>
          </p>

          <div className="enter enter-3 relative mt-9 flex w-full items-center justify-center">
            <span className="absolute left-1 top-1/2 -translate-y-1/2 lg:hidden sm:left-8" aria-hidden>
              <MobileTile provider={PROVIDERS[4]} rotate={8} />
            </span>
            <DownloadButton source="hero" />
            <span className="absolute right-1 top-1/2 -translate-y-1/2 lg:hidden sm:right-8" aria-hidden>
              <MobileTile provider={PROVIDERS[5]} rotate={-9} />
            </span>
          </div>

          <p className="enter enter-4 relative mt-5 text-[13px] font-medium text-ink-mute">
            <Trans>macOS · Windows · Linux · Docker</Trans>
            <span className="hidden sm:inline">
              <span className="mx-2 text-ink-faint">|</span>
              <Trans>AGPL-3.0, no account required</Trans>
            </span>
          </p>

        </div>

      </div>

      <div className="relative flex flex-col justify-center pt-10 sm:pt-20">
        <div className="relative mx-auto hidden w-full max-w-[1200px] px-5 sm:px-8 md:block">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-[50vw] bottom-0 top-[18%] -z-10 bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--color-brand)_9%,white)_30%,color-mix(in_oklch,var(--color-brand)_14%,white))]"
          />
          <figure className="relative mx-auto w-full max-w-[900px] rounded-2xl ring-1 ring-ink/10 shadow-[0_2px_4px_rgb(18_27_43/0.05),0_40px_90px_-30px_rgb(18_27_43/0.45)]">
            <img
              src={screenSrc(SCREENS.homeEmpty)}
              alt={i18n._(SCREENS.homeEmpty.alt)}
              width={SCREENS.homeEmpty.width}
              height={SCREENS.homeEmpty.height}
              decoding="async"
              className="block w-full rounded-2xl"
            />
          </figure>
        </div>
        <div className="relative border-y border-ink-line bg-paper md:mt-10 lg:mt-12">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-5 px-5 py-6 sm:px-8">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-mute">
            <Trans>Built with UNICEF · Supported by</Trans>
          </span>
          {SUPPORTERS.map((supporter) => (
            <a
              key={supporter.name}
              href={supporter.href}
              target="_blank"
              rel="noreferrer noopener"
              title={supporter.name}
              className="inline-flex items-center opacity-70 grayscale transition-[opacity,filter] duration-300 hover:opacity-100 hover:grayscale-0"
            >
              <img
                src={`${import.meta.env.BASE_URL}${supporter.src}`}
                alt={supporter.name}
                className={`${supporter.heightClass} w-auto object-contain`}
              />
            </a>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}
