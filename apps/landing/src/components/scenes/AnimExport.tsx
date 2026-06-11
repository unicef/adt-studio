import {
  BookOpen,
  Check,
  Hand,
  Languages,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { lerp, seg } from "@/lib/seg";

const BOOK_COPY = {
  sceneLabel: "Scene 04",
  ptBadge: "PT-BR",
  cover: {
    title: "River & Sea",
    subtitle: "A story of two waters",
    author: "M. Alves",
  },
  en: {
    title: "The river meets the sea",
    bodyPrefix: "Water flows from the ",
    word1: "river",
    bodyMiddle: " down to the open ",
    word2: "sea",
    bodySuffix: ", gathering stories along the way.",
  },
  pt: {
    title: "O rio encontra o mar",
    bodyPrefix: "A água desce do ",
    word1: "rio",
    bodyMiddle: " até o ",
    word2: "mar",
    bodySuffix: " aberto, reunindo histórias pelo caminho.",
  },
  glossary: {
    label: "Glossary",
    term: "rio",
    definition: "Curso natural de água que corre em direção ao mar.",
  },
} as const;

export function AnimExport({ progress }: { progress: number }) {
  const { t } = useLingui();
  const p = progress;

  const tabletT = seg(p, 0, 0.05);
  const coverT = seg(p, 0.05, 0.14);
  const openT = seg(p, 0.27, 0.35);

  const audioActive = p >= 0.35;
  const translateActive = p >= 0.5;
  const pickerOpen = p >= 0.5 && p < 0.65;
  const ptHighlighted = p >= 0.54 && p < 0.58;
  const ptSelected = p >= 0.58;
  const signActive = p >= 0.65;
  const glossaryActive = p >= 0.79;

  const deliveredT = seg(p, 0.91, 1);
  const showSpread = p >= 0.27;
  const coverVisible = p >= 0.05 && p < 0.3;
  const toolbarT = seg(p, 0.27, 0.34);

  const TOTAL_PAGES = 24;
  const pageNum = 3;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden px-7 pt-7 pb-12"
      style={{ background: "linear-gradient(180deg, #f7f8fc 0%, #e7ecf4 100%)" }}
    >
      <div
        className="absolute left-6 top-6 flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-2.5 py-1 shadow-sm transition-all duration-500"
        style={{
          opacity: tabletT,
          transform: `translateY(${lerp(-4, 0, tabletT)}px)`,
        }}
      >
        <div className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-rose-400 text-[9px] font-bold text-white">
          E
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-bold text-[color:var(--color-foreground)]">
            Eva
          </span>
          <span className="font-mono text-[8px] text-[color:var(--color-muted-foreground)]">
            age 8
          </span>
        </div>
      </div>

      <div
        className="absolute right-6 top-6 flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-sm transition-all duration-300"
        style={{
          opacity: deliveredT,
          transform: `translateY(${lerp(-6, 0, deliveredT)}px)`,
          background: "#16a34a",
          color: "#fff",
        }}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
        <span className="font-mono text-[9px] font-bold uppercase tracking-wider">
          <Trans>Delivered</Trans>
        </span>
      </div>

      <div
        className="relative rounded-[22px] border-[6px] border-[#1f2937] bg-[#0b1220] transition-all duration-300"
        style={{
          width: "76%",
          aspectRatio: "4/3",
          transform: `scale(${lerp(0.95, 1, tabletT)})`,
          opacity: tabletT,
          boxShadow:
            "0 18px 40px -12px rgba(15,23,42,.28), 0 4px 10px rgba(15,23,42,.08)",
        }}
      >
        <div className="absolute left-1/2 top-1.5 h-1 w-1 -translate-x-1/2 rounded-full bg-[#3f4a5c]" />

        <div
          className="absolute inset-1 flex flex-col gap-2 overflow-hidden rounded-[14px] p-3"
          style={{
            background: "linear-gradient(180deg, #fafbfd 0%, #eef2f7 100%)",
          }}
        >
          <div className="relative flex flex-1 items-center justify-center">
            <div
              className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
              style={{
                opacity: coverVisible ? 1 : 0,
                pointerEvents: coverVisible ? "auto" : "none",
              }}
            >
              <BookCover t={coverT} />
            </div>
            <div
              className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
              style={{
                opacity: showSpread ? 1 : 0,
                pointerEvents: showSpread ? "auto" : "none",
              }}
            >
              <BookSpread
                openT={openT}
                audioActive={audioActive}
                signActive={signActive}
                glossaryActive={glossaryActive}
                ptSelected={ptSelected}
                p={p}
              />
            </div>

            {pickerOpen && (
              <LanguagePicker
                ptHighlighted={ptHighlighted}
                ptSelected={ptSelected}
              />
            )}
          </div>

          <div
            className="relative flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]/90 px-2 py-1.5 backdrop-blur transition-all duration-300"
            style={{
              opacity: toolbarT,
              transform: `translateY(${lerp(6, 0, toolbarT)}px)`,
              pointerEvents: toolbarT > 0.5 ? "auto" : "none",
              height: toolbarT > 0.5 ? "auto" : 0,
            }}
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-muted-foreground)] tabular-nums">
              {String(pageNum).padStart(2, "0")} / {TOTAL_PAGES}
            </span>
            <div className="flex items-center gap-1.5">
              <FeatureIcon
                active={audioActive}
                color="#e11d48"
                Icon={Volume2}
                label={t`Audio`}
              />
              <FeatureIcon
                active={translateActive}
                color="#db2777"
                Icon={Languages}
                label={t`Translate`}
              />
              <FeatureIcon
                active={signActive}
                color="#2563eb"
                Icon={Hand}
                label={t`Sign`}
              />
              <FeatureIcon
                active={glossaryActive}
                color="#65a30d"
                Icon={Sparkles}
                label={t`Glossary`}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-7 bottom-6 flex items-center gap-2 rounded-md border px-3 py-2"
        style={{ background: "#2563eb10", borderColor: "#2563eb33" }}
      >
        <span
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
          style={{ background: "#2563eb22", color: "#2563eb" }}
        >
          <BookOpen className="h-2.5 w-2.5" strokeWidth={2.5} />
        </span>
        <span
          className="text-[10.5px] font-medium leading-snug"
          style={{ color: "#2563eb" }}
        >
          <Trans>
            Every reader opens the same book, with the features they need on
            tap.
          </Trans>
        </span>
      </div>
    </div>
  );
}

function FeatureIcon({
  active,
  color,
  Icon,
  label,
}: {
  active: boolean;
  color: string;
  Icon: typeof Volume2;
  label: string;
}) {
  return (
    <div
      className="grid h-6 w-6 place-items-center rounded-md transition-all duration-300"
      style={{
        background: active ? color : "var(--color-muted)",
        color: active ? "#fff" : "var(--color-muted-foreground)",
        transform: active ? "scale(1)" : "scale(0.92)",
        boxShadow: active ? `0 0 0 3px ${color}25` : "none",
      }}
      aria-label={label}
      title={label}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
    </div>
  );
}

function LanguagePicker({
  ptHighlighted,
  ptSelected,
}: {
  ptHighlighted: boolean;
  ptSelected: boolean;
}) {
  const langs = [
    { code: "EN", label: "English" },
    { code: "ES", label: "Español" },
    { code: "PT-BR", label: "Português" },
    { code: "FR", label: "Français" },
  ];
  const selectedCode = ptSelected ? "PT-BR" : "EN";

  return (
    <div
      className="absolute right-1 bottom-1 z-10 flex animate-[onboarding-fade-in_300ms_ease-out] flex-col gap-0.5 rounded-md border bg-white p-1"
      style={{
        borderColor: "#db277755",
        width: 116,
        boxShadow:
          "0 10px 24px -6px rgba(219,39,119,.25), 0 3px 8px rgba(15,23,42,.08)",
      }}
    >
      <div className="flex items-center gap-1 px-1.5 pb-1 pt-0.5">
        <Languages className="h-2.5 w-2.5 text-pink-600" />
        <span className="font-mono text-[8px] font-bold uppercase tracking-wider text-pink-600">
          <Trans>Language</Trans>
        </span>
      </div>
      {langs.map((l) => {
        const isSelected = l.code === selectedCode;
        const isHover = l.code === "PT-BR" && ptHighlighted && !ptSelected;
        return (
          <div
            key={l.code}
            className="flex items-center justify-between gap-2 rounded-sm px-1.5 py-1 transition-colors duration-150"
            style={{
              background: isSelected
                ? "#db277720"
                : isHover
                  ? "#db277710"
                  : "transparent",
            }}
          >
            <span
              className="font-mono text-[8.5px] font-bold"
              style={{ color: isSelected || isHover ? "#db2777" : "#374151" }}
            >
              {l.code}
            </span>
            <span
              className="flex-1 truncate text-[8.5px]"
              style={{
                color: isSelected || isHover ? "#db2777" : "#6b7280",
                fontWeight: isSelected ? 600 : 400,
              }}
            >
              {l.label}
            </span>
            {isSelected && (
              <Check
                className="h-2.5 w-2.5 shrink-0 text-pink-600"
                strokeWidth={3}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BookCover({ t: tp }: { t: number }) {
  return (
    <div
      className="relative"
      style={{
        width: "42%",
        aspectRatio: "3/4",
        opacity: tp,
        transform: `scale(${lerp(0.92, 1, tp)})`,
      }}
    >
      <div
        className="absolute inset-0 translate-x-0.5 translate-y-1.5 rounded-[5px]"
        style={{ background: "rgba(0,0,0,0.07)" }}
      />
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[4px] border border-[#e5e5e5] bg-white">
        <div
          className="relative mx-[6.5%] mt-[5%] overflow-hidden rounded-[2px]"
          style={{ height: "51%", background: "rgba(59,130,246,0.08)" }}
        >
          <svg
            viewBox="0 0 124 102"
            preserveAspectRatio="xMidYMid slice"
            className="h-full w-full"
            aria-hidden
          >
            <circle cx="100" cy="26" r="11" fill="#f59e0b" fillOpacity="0.3" />
            <ellipse cx="24" cy="30" rx="10" ry="4.5" fill="white" />
            <ellipse cx="34" cy="26" rx="8" ry="4.5" fill="white" />
            <ellipse cx="44" cy="30" rx="9" ry="4.5" fill="white" />
            <path
              d="M0 58 Q 30 50, 62 56 T 124 54 L 124 102 L 0 102 Z"
              fill="#60a5fa"
              fillOpacity="0.3"
            />
            <path
              d="M0 70 Q 32 62, 66 70 T 124 68 L 124 102 L 0 102 Z"
              fill="#3b82f6"
              fillOpacity="0.4"
            />
            <path
              d="M0 82 Q 30 76, 64 82 T 124 80 L 124 102 L 0 102 Z"
              fill="#1d4ed8"
              fillOpacity="0.42"
            />
          </svg>
        </div>
        <div className="mx-[7%] mt-3 flex flex-1 flex-col">
          <div
            className="h-[2px] w-5 rounded-full"
            style={{ background: "#2563eb" }}
          />
          <h3
            className="mt-1.5 text-[13px] font-bold leading-[1.05] tracking-tight text-[#0a0a0a]"
            style={{ fontFamily: '"Times New Roman", serif' }}
          >
            {BOOK_COPY.cover.title}
          </h3>
          <p
            className="mt-1 text-[8px] italic leading-tight text-[#737373]"
            style={{ fontFamily: '"Times New Roman", serif' }}
          >
            {BOOK_COPY.cover.subtitle}
          </p>
          <div className="mt-auto flex items-center justify-between pb-3">
            <span className="font-mono text-[7px] font-bold uppercase tracking-[0.12em] text-[#525252]">
              {BOOK_COPY.cover.author}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookSpread({
  openT,
  audioActive,
  signActive,
  glossaryActive,
  ptSelected,
  p,
}: {
  openT: number;
  audioActive: boolean;
  signActive: boolean;
  glossaryActive: boolean;
  ptSelected: boolean;
  p: number;
}) {
  const audioT = seg(p, 0.35, 0.5);

  return (
    <div
      className="relative flex overflow-hidden rounded-md bg-white"
      style={{
        width: "92%",
        aspectRatio: "2/1.15",
        opacity: openT,
        transform: `scale(${lerp(0.92, 1, openT)})`,
        boxShadow:
          "0 10px 24px -8px rgba(15,23,42,.22), 0 3px 8px rgba(15,23,42,.08)",
      }}
    >
      <div
        className="flex flex-1 flex-col gap-1.5 border-r border-[color:var(--color-border)]/60 p-3"
        style={{ fontFamily: '"Times New Roman", serif' }}
      >
        <div className="flex items-center gap-1.5">
          <span className="font-sans text-[8px] font-bold uppercase tracking-wider text-[#9a6b3a]">
            {BOOK_COPY.sceneLabel}
          </span>
          <span
            className="font-sans font-mono text-[7.5px] font-bold uppercase tracking-wider transition-all duration-300"
            style={{ opacity: ptSelected ? 1 : 0, color: "#db2777" }}
          >
            {BOOK_COPY.ptBadge}
          </span>
        </div>

        <div className="relative min-h-[14px]">
          <div
            className="absolute inset-0 text-[10.5px] font-bold leading-tight text-[#2a1f15] transition-opacity duration-300"
            style={{ opacity: ptSelected ? 0 : 1 }}
          >
            {BOOK_COPY.en.title}
          </div>
          <div
            className="absolute inset-0 text-[10.5px] font-bold leading-tight text-[#2a1f15] transition-opacity duration-300"
            style={{ opacity: ptSelected ? 1 : 0 }}
          >
            {BOOK_COPY.pt.title}
          </div>
        </div>

        <div className="relative flex-1 min-h-[32px]">
          <div
            className="absolute inset-0 text-[9px] leading-relaxed text-[#57493a] transition-opacity duration-300"
            style={{ opacity: ptSelected ? 0 : 1 }}
          >
            {BOOK_COPY.en.bodyPrefix}
            <HighlightWord active={glossaryActive && !ptSelected}>
              {BOOK_COPY.en.word1}
            </HighlightWord>
            {BOOK_COPY.en.bodyMiddle}
            <HighlightWord active={glossaryActive && !ptSelected}>
              {BOOK_COPY.en.word2}
            </HighlightWord>
            {BOOK_COPY.en.bodySuffix}
          </div>
          <div
            className="absolute inset-0 text-[9px] leading-relaxed text-[#57493a] transition-opacity duration-300"
            style={{ opacity: ptSelected ? 1 : 0 }}
          >
            {BOOK_COPY.pt.bodyPrefix}
            <HighlightWord
              active={glossaryActive && ptSelected}
              pressing={p >= 0.82 && p < 0.845}
              popupT={p >= 0.845 ? seg(p, 0.845, 0.91) : null}
            >
              {BOOK_COPY.pt.word1}
            </HighlightWord>
            {BOOK_COPY.pt.bodyMiddle}
            <HighlightWord active={glossaryActive && ptSelected}>
              {BOOK_COPY.pt.word2}
            </HighlightWord>
            {BOOK_COPY.pt.bodySuffix}
          </div>
        </div>

        {audioActive && (
          <div className="mt-auto flex items-center gap-1.5 rounded bg-rose-50 px-1.5 py-1">
            <Volume2 className="h-2.5 w-2.5 text-rose-600" />
            <AudioWave t={audioT} variant={ptSelected ? "pt" : "en"} />
            <span className="font-mono text-[8px] font-bold text-rose-600">
              {ptSelected ? "00:14" : "00:12"}
            </span>
          </div>
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center p-2">
        <div
          className="relative h-[80%] w-full overflow-hidden rounded-sm"
          style={{
            background:
              "linear-gradient(135deg, #4a7fbf 0%, #8ec5e8 55%, #f2d79a 100%)",
          }}
        >
          <div
            className="absolute right-[18%] top-[18%] rounded-full"
            style={{
              background: "#fff6d8",
              boxShadow: "0 0 16px #fff6d8",
              height: 14,
              width: 14,
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-[36%]"
            style={{
              background: "linear-gradient(180deg, transparent, #3a6b8a 70%)",
            }}
          />
        </div>

        {signActive && <SignPip />}
      </div>
    </div>
  );
}

function GlossaryPopup({ t: tp }: { t: number }) {
  const appear = Math.min(1, tp * 5);
  return (
    <span
      className="absolute left-0 top-full z-20 mt-0.5 block overflow-hidden rounded-md border bg-white"
      style={{
        width: 130,
        opacity: appear,
        transform: `translateY(${lerp(-4, 0, appear)}px)`,
        borderColor: "#65a30d",
        boxShadow:
          "0 10px 24px -6px rgba(101,163,13,.35), 0 3px 8px rgba(15,23,42,.12)",
      }}
    >
      <span
        className="absolute -top-1 left-3 block h-2 w-2 rotate-45 border-l border-t"
        style={{ background: "white", borderColor: "#65a30d" }}
      />
      <span className="flex items-center gap-1 border-b border-lime-100 bg-lime-50 px-2 py-1">
        <Sparkles className="h-2.5 w-2.5 shrink-0 text-lime-600" />
        <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-lime-700">
          {BOOK_COPY.glossary.label}
        </span>
      </span>
      <span className="block px-2 py-1.5">
        <span
          className="block text-[10px] font-bold leading-tight text-lime-700"
          style={{ fontFamily: '"Times New Roman", serif' }}
        >
          {BOOK_COPY.glossary.term}
        </span>
        <span
          className="mt-0.5 block text-[8px] leading-snug text-[#57493a]"
          style={{ fontFamily: '"Times New Roman", serif' }}
        >
          {BOOK_COPY.glossary.definition}
        </span>
      </span>
    </span>
  );
}

function SignPip() {
  return (
    <div
      className="absolute bottom-1.5 right-1.5 overflow-hidden rounded-md border-2 animate-[onboarding-fade-in_300ms_ease-out]"
      style={{
        width: "42%",
        aspectRatio: "4/3",
        borderColor: "#2563eb",
        boxShadow:
          "0 6px 16px -4px rgba(37,99,235,.4), 0 2px 6px rgba(15,23,42,.18)",
      }}
    >
      <svg
        viewBox="0 0 48 36"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="sign-pip-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1e3a8a" />
            <stop offset="1" stopColor="#0b1220" />
          </linearGradient>
        </defs>
        <rect width="48" height="36" fill="url(#sign-pip-bg)" />
        <path d="M5 36 Q 5 24, 18 22 L 30 22 Q 43 24, 43 36 Z" fill="#3b82f6" />
        <path
          d="M18 26 L 24 24 L 30 26 L 27 36 L 21 36 Z"
          fill="#1d4ed8"
          fillOpacity="0.65"
        />
        <rect x="21.5" y="18" width="5" height="5" fill="#e0e7ff" />
        <circle cx="24" cy="14" r="5.2" fill="#e0e7ff" />
        <path
          d="M19 12 Q 19 8, 24 7.5 Q 29 8, 29 12 L 28.5 11.5 Q 28 10, 24 10 Q 20 10, 19.5 11.5 Z"
          fill="#1e3a8a"
        />
        <ellipse cx="14" cy="25" rx="3" ry="2.4" fill="#e0e7ff" />
        <ellipse cx="34" cy="21" rx="3" ry="2.4" fill="#e0e7ff" />
        <circle cx="12.5" cy="23.5" r="0.7" fill="#e0e7ff" />
        <circle cx="35.5" cy="19.5" r="0.7" fill="#e0e7ff" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-[#0b1220]/85 px-1 py-0.5 backdrop-blur">
        <div className="flex items-center gap-0.5">
          <Hand className="h-2 w-2 text-white" strokeWidth={2.5} />
          <span className="font-mono text-[6.5px] font-bold uppercase tracking-wider text-white/90">
            ASL
          </span>
        </div>
        <span className="font-mono text-[6px] text-white/60">00:03</span>
      </div>
    </div>
  );
}

function HighlightWord({
  active,
  pressing = false,
  popupT = null,
  children,
}: {
  active: boolean;
  pressing?: boolean;
  popupT?: number | null;
  children: React.ReactNode;
}) {
  return (
    <span
      className="relative rounded px-0.5 transition-all duration-150"
      style={{
        background: active
          ? pressing
            ? "#d9f99d"
            : "#ecfccb"
          : "transparent",
        color: active ? (pressing ? "#3f6212" : "#4d7c0f") : "inherit",
        fontWeight: active ? 700 : 400,
        boxShadow: pressing
          ? "inset 0 0 0 1.5px #65a30d, 0 0 0 3px #65a30d33"
          : "none",
      }}
    >
      {children}
      {popupT !== null && <GlossaryPopup t={popupT} />}
    </span>
  );
}

function AudioWave({ t: tp, variant }: { t: number; variant: "en" | "pt" }) {
  const bars = 14;
  const freq = variant === "pt" ? 1.05 : 1.6;
  const freq2 = variant === "pt" ? 0.45 : 0.7;
  const color = variant === "pt" ? "#db2777" : "#e11d48";
  const dim = variant === "pt" ? "#fbcfe8" : "#fecdd3";
  return (
    <div className="flex h-3 flex-1 items-end gap-[1.5px]">
      {[...Array(bars)].map((_, i) => {
        const x = i / bars;
        const h =
          0.3 + 0.7 * (0.5 + 0.5 * Math.sin(i * freq) * Math.cos(i * freq2));
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-200"
            style={{
              height: `${h * 100}%`,
              background: x < tp ? color : dim,
            }}
          />
        );
      })}
    </div>
  );
}
