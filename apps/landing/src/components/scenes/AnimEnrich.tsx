import { BookMarked, Globe, Languages, Volume2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/cn";
import { lerp, seg } from "@/lib/seg";
import { Cursor } from "@/components/Cursor";

export function AnimEnrich({ progress }: { progress: number }) {
  const { t } = useLingui();
  const p = progress;
  const enriching = p >= 0.45;

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: enriching ? 0 : 1,
          pointerEvents: enriching ? "none" : "auto",
        }}
      >
        <EditingSpread t={seg(p, 0, 0.35)} />
      </div>

      <div
        className="absolute inset-0 flex flex-col gap-4 p-8 transition-opacity duration-500"
        style={{
          opacity: enriching ? 1 : 0,
          pointerEvents: enriching ? "auto" : "none",
        }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          <Trans>Edit & enrich</Trans>
        </div>
        <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-2.5">
          <EnrichPane
            active={p >= 0.45 && p < 0.59}
            color="#db2777"
            bg="bg-pink-50"
            iconColor="text-pink-600"
            Icon={Languages}
            label={t`Translate`}
          >
            <TranslatePane t={p} />
          </EnrichPane>
          <EnrichPane
            active={p >= 0.59 && p < 0.72}
            color="#2563eb"
            bg="bg-blue-50"
            iconColor="text-blue-600"
            Icon={Globe}
            label={t`Languages`}
          >
            <GlobePane t={p} />
          </EnrichPane>
          <EnrichPane
            active={p >= 0.72 && p < 0.86}
            color="#e11d48"
            bg="bg-rose-50"
            iconColor="text-rose-600"
            Icon={Volume2}
            label={t`Speech`}
          >
            <WaveformPane t={p} />
          </EnrichPane>
          <EnrichPane
            active={p >= 0.86}
            color="#65a30d"
            bg="bg-lime-50"
            iconColor="text-lime-600"
            Icon={BookMarked}
            label={t`Glossary`}
          >
            <GlossaryPane t={p} />
          </EnrichPane>
        </div>
      </div>
    </div>
  );
}

function EditingSpread({ t: tp }: { t: number }) {
  const originalTitle = "The river meets the sea";
  const newTitle = "At the river's edge";

  const approachT = Math.max(0, Math.min(1, tp / 0.2));
  const cx = lerp(108, 30, approachT);
  const cy = lerp(115, 32, approachT);

  const clicking = tp >= 0.2 && tp < 0.28;
  const selected = tp >= 0.28 && tp < 0.38;
  const typing = tp >= 0.38;

  const typeT = Math.max(0, Math.min(1, (tp - 0.38) / 0.57));
  const typed = Math.floor(typeT * newTitle.length);
  const caretOn = Math.floor(tp * 40) % 2 === 0;

  return (
    <div
      className="relative flex h-full min-h-0 items-center justify-center overflow-hidden p-3.5"
      style={{
        background: "linear-gradient(180deg, #f5f3ef 0%, #ece7de 100%)",
      }}
    >
      <div
        className="relative flex max-h-full w-[82%] bg-white"
        style={{
          aspectRatio: "2 / 1.15",
          boxShadow:
            "0 12px 28px -8px rgba(0,0,0,.22), 0 3px 8px rgba(0,0,0,.08)",
          borderRadius: "3px 6px 6px 3px",
        }}
      >
        <div
          className="flex flex-1 flex-col gap-1.5 border-r border-[#e6e1d8] p-3.5"
          style={{ fontFamily: '"Times New Roman", serif' }}
        >
          <div className="font-sans text-[9px] font-bold uppercase tracking-wider text-[#9a6b3a]">
            Scene 04
          </div>

          <div
            className="text-[13px] font-bold leading-tight tracking-tight"
            style={{
              outline: selected || typing ? "1.5px solid #2563eb" : "none",
              outlineOffset: 2,
              borderRadius: 2,
              boxShadow:
                selected || typing ? "0 0 0 3px #2563eb22" : "none",
              color: "#2a1f15",
            }}
          >
            {!typing && !selected && <span>{originalTitle}</span>}
            {selected && (
              <span className="rounded-[2px] bg-blue-200">{originalTitle}</span>
            )}
            {typing && (
              <>
                <span>{newTitle.slice(0, typed)}</span>
                <span
                  className="inline-block h-[14px] w-px bg-[#2563eb] align-middle"
                  style={{ opacity: caretOn ? 1 : 0 }}
                />
              </>
            )}
          </div>

          <div className="mt-0.5 flex flex-col gap-[3px]">
            {[100, 96, 98, 92, 100, 88, 70].map((w, i) => (
              <div
                key={i}
                className="h-1 rounded-sm bg-[#c8bfb1]"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
          <div className="mt-auto font-mono text-[8px] text-[#9a8a72]">
            p. 14
          </div>
        </div>

        <div className="relative flex flex-1 flex-col gap-1.5 p-2.5">
          <div
            className="relative w-full overflow-hidden rounded-sm"
            style={{
              aspectRatio: "4/3",
              background:
                "linear-gradient(135deg, #4a7fbf 0%, #8ec5e8 50%, #f2d79a 100%)",
            }}
          >
            <div
              className="absolute right-[18%] top-[18%] rounded-full"
              style={{
                background: "#fff6d8",
                boxShadow: "0 0 18px #fff6d8",
                height: 18,
                width: 18,
              }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-[38%]"
              style={{
                background: "linear-gradient(180deg, transparent, #3a6b8a 70%)",
              }}
            />
          </div>
          <div
            className="relative flex min-h-5 items-center rounded-sm border border-[#d4cfc3] px-1.5 py-1 text-[10px]"
            style={{ background: "#fff", color: "#2a1f15" }}
          >
            <span className="mr-1.5 shrink-0 font-mono text-[8px] font-bold uppercase tracking-wider text-[#9a8a72]">
              Caption
            </span>
            <span className="italic text-[#b5aa96]">
              A scenic view at dusk.
            </span>
          </div>
          <div className="absolute bottom-1.5 right-2.5 font-mono text-[8px] text-[#9a8a72]">
            p. 15
          </div>
        </div>
      </div>

      <Cursor x={cx} y={cy} clicking={clicking} />
    </div>
  );
}

function EnrichPane({
  active,
  color,
  bg,
  iconColor,
  Icon,
  label,
  children,
}: {
  active: boolean;
  color: string;
  bg: string;
  iconColor: string;
  Icon: typeof Languages;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-0 flex-col gap-2 overflow-hidden rounded-[10px] border bg-[color:var(--color-card)] p-3 transition-all duration-300"
      style={{
        borderColor: active ? color : "var(--color-border)",
        boxShadow: active
          ? `0 0 0 3px ${color}18, 0 4px 14px -4px ${color}33`
          : "none",
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "grid h-5 w-5 place-items-center rounded",
            bg,
            iconColor,
          )}
        >
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[11px] font-bold text-[color:var(--color-foreground)]">
          {label}
        </span>
        {active && (
          <span
            className="ml-auto font-mono text-[9px] font-bold"
            style={{ color }}
          >
            ● <Trans>LIVE</Trans>
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function TranslatePane({ t: tp }: { t: number }) {
  const dst = "O ciclo da água descreve o movimento contínuo da água.";
  const localT = Math.max(0, Math.min(1, (tp - 0.45) / 0.14));
  const typed = Math.floor(localT * dst.length);
  return (
    <>
      <div className="mb-1.5 text-[10.5px] leading-relaxed text-[color:var(--color-muted-foreground)]">
        <span className="mr-1 font-mono text-[9px]">EN</span>
        The water cycle describes continuous movement of water.
      </div>
      <div className="my-1 h-px bg-[color:var(--color-border)]" />
      <div className="text-[11px] font-medium leading-relaxed text-[color:var(--color-foreground)]">
        <span className="mr-1 font-mono text-[9px] font-bold text-pink-600">
          PT
        </span>
        {dst.slice(0, typed)}
        <span className="ml-px inline-block h-3 w-px bg-pink-600 align-middle" />
      </div>
    </>
  );
}

function GlobePane({ t: tp }: { t: number }) {
  const localT = Math.max(0, Math.min(1, (tp - 0.59) / 0.13));
  const angle = localT * 360;
  const langs = ["EN", "PT", "ES", "FR", "SW", "AR"];
  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-blue-600 bg-blue-50">
        <Globe
          className="h-9 w-9 text-blue-600"
          style={{ transform: `rotate(${angle}deg)` }}
        />
      </div>
      <div className="flex flex-1 flex-wrap gap-1">
        {langs.map((l, i) => {
          const appear = localT > i / langs.length;
          return (
            <span
              key={l}
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold transition-all duration-200",
                appear
                  ? "bg-blue-50 text-blue-600"
                  : "bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]",
              )}
              style={{ opacity: appear ? 1 : 0.5 }}
            >
              {l}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function WaveformPane({ t: tp }: { t: number }) {
  const localT = Math.max(0, Math.min(1, (tp - 0.72) / 0.14));
  const bars = 36;
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="flex h-12 items-end gap-0.5">
        {[...Array(bars)].map((_, i) => {
          const x = i / bars;
          const h =
            0.3 + 0.7 * (0.5 + 0.5 * Math.sin(i * 1.7) * Math.cos(i * 0.6));
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-colors duration-100"
              style={{
                height: `${h * 100}%`,
                background: x < localT ? "#e11d48" : "var(--color-border)",
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[9px] text-[color:var(--color-muted-foreground)]">
        <span>00:0{Math.floor(localT * 12)}</span>
        <span>00:12</span>
      </div>
    </div>
  );
}

function GlossaryPane({ t: tp }: { t: number }) {
  const localT = Math.max(0, Math.min(1, (tp - 0.86) / 0.14));
  const highlight = Math.min(2, Math.floor(localT * 3));
  const terms = [
    {
      word: "photosynthesis",
      desc: "Conversion of light into chemical energy.",
    },
    { word: "mitosis", desc: "Cell division producing two identical cells." },
    { word: "osmosis", desc: "Water moving through a membrane." },
  ];
  return (
    <div className="flex flex-1 flex-col gap-1.5 text-[10.5px]">
      <div className="leading-relaxed text-[color:var(--color-muted-foreground)]">
        Plants create sugar via{" "}
        <HighlightTerm active={highlight === 0 && localT > 0}>
          photosynthesis
        </HighlightTerm>
        , divide by <HighlightTerm active={highlight === 1}>mitosis</HighlightTerm>,
        and absorb water by{" "}
        <HighlightTerm active={highlight === 2}>osmosis</HighlightTerm>.
      </div>
      <div
        className="mt-1 rounded-r bg-lime-50 px-2 py-1.5 text-[9.5px]"
        style={{ borderLeft: "2px solid #65a30d" }}
      >
        <div className="mb-0.5 font-bold text-lime-700">
          {terms[highlight].word}
        </div>
        <div className="leading-relaxed text-[color:var(--color-muted-foreground)]">
          {terms[highlight].desc}
        </div>
      </div>
    </div>
  );
}

function HighlightTerm({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded px-0.5 transition-all duration-200",
        active
          ? "bg-lime-50 font-bold text-lime-700"
          : "text-[color:var(--color-foreground)]",
      )}
    >
      {children}
    </span>
  );
}
