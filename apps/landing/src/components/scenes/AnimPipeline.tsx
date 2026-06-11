import {
  ArrowRight,
  Check,
  FileText,
  Layers,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";

export function AnimPipeline({ progress }: { progress: number }) {
  const { t } = useLingui();
  const p = progress;

  const extractSubs = [
    { label: t`Parsing pages`, detail: "238 pp" },
    { label: t`Detecting figures`, detail: "42 figs" },
    { label: t`OCR & cleanup`, detail: "14.2 kB" },
  ];
  const storySubs = [
    { label: t`Segmenting scenes`, detail: "18 scenes" },
    { label: t`Generating panels`, detail: "72 panels" },
    { label: t`Laying out spreads`, detail: "36 spreads" },
  ];

  const extractT = Math.max(0, Math.min(1, (p - 0.03) / 0.35));
  const storyT = Math.max(0, Math.min(1, (p - 0.4) / 0.3));
  const extractDone = p >= 0.38;
  const storyActive = p >= 0.4;
  const storyDone = p >= 0.7;

  const overallPct = Math.round(
    storyDone
      ? 100
      : storyActive
        ? 50 + storyT * 50
        : extractDone
          ? 50
          : extractT * 50,
  );

  return (
    <div className="absolute inset-0 flex flex-col gap-3.5 overflow-hidden p-7">
      <div className="flex items-center gap-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          {storyActive ? t`Pipeline · storyboard` : t`Pipeline · extract`}
        </div>
        <div className="h-[3px] max-w-[180px] flex-1 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
          <div
            className="h-full transition-[width,background] duration-200"
            style={{
              width: `${overallPct}%`,
              background: storyDone
                ? "#16a34a"
                : "linear-gradient(90deg, #2563eb, #7c3aed)",
            }}
          />
        </div>
        <div className="min-w-[38px] text-right font-mono text-[10px] text-[color:var(--color-muted-foreground)]">
          {overallPct}%
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[1fr_24px_1fr] items-stretch gap-2.5">
        <PipelineStage
          title={t`Extract`}
          Icon={FileText}
          color="#2563eb"
          subs={extractSubs}
          stageT={extractT}
          done={extractDone}
          active={!extractDone}
          dimmed={false}
          NoteIcon={Sparkles}
          note={t`Parsing pages into text, figures, and layout boxes — cached by content hash.`}
        />
        <div
          className="flex items-center justify-center transition-colors duration-300"
          style={{ color: extractDone ? "#2563eb" : "var(--color-border)" }}
        >
          <ArrowRight className="h-4 w-4" />
        </div>
        <PipelineStage
          title={t`Storyboard`}
          Icon={LayoutGrid}
          color="#7c3aed"
          subs={storySubs}
          stageT={storyT}
          done={storyDone}
          active={storyActive && !storyDone}
          dimmed={!storyActive}
          NoteIcon={Layers}
          note={t`Grouping content by purpose, then laying out every section as reviewable HTML.`}
        />
      </div>
    </div>
  );
}

function PipelineStage({
  title,
  Icon,
  color,
  subs,
  stageT,
  done,
  active,
  dimmed,
  note,
  NoteIcon,
}: {
  title: string;
  Icon: typeof FileText;
  color: string;
  subs: { label: string; detail: string }[];
  stageT: number;
  done: boolean;
  active: boolean;
  dimmed: boolean;
  note: string;
  NoteIcon: typeof FileText;
}) {
  const { t } = useLingui();
  const n = subs.length;
  return (
    <div
      className="relative flex flex-col gap-2.5 rounded-[10px] border bg-[color:var(--color-card)] p-3 transition-all duration-300"
      style={{
        borderColor: done || active ? color : "var(--color-border)",
        boxShadow: active ? `0 0 0 3px ${color}18` : "none",
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="grid h-[22px] w-[22px] place-items-center rounded-md transition-all duration-200"
          style={{
            background: done ? color : `${color}14`,
            color: done ? "#fff" : color,
          }}
        >
          <Icon className="h-[13px] w-[13px]" />
        </div>
        <span className="text-xs font-bold text-[color:var(--color-foreground)]">
          {title}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wider"
          style={{
            color: done
              ? "#16a34a"
              : active
                ? color
                : "var(--color-muted-foreground)",
          }}
        >
          {done ? (
            <>
              <Check className="h-2.5 w-2.5" />
              {t`DONE`}
            </>
          ) : active ? (
            <>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: color,
                  animation: "onboarding-blink-dot 1s infinite",
                }}
              />
              {t`RUNNING`}
            </>
          ) : (
            t`WAITING`
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        {subs.map((s, i) => {
          const sliceStart = i / n;
          const sliceEnd = (i + 1) / n;
          const localT = Math.max(
            0,
            Math.min(1, (stageT - sliceStart) / (sliceEnd - sliceStart)),
          );
          const isDone = done || stageT >= sliceEnd;
          const isRunning =
            !isDone && active && stageT >= sliceStart && stageT < sliceEnd;
          const isPending = !isDone && !isRunning;
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-all duration-200"
              style={{
                background: isDone
                  ? "var(--color-muted)"
                  : isRunning
                    ? `${color}08`
                    : "var(--color-card)",
                borderColor: isRunning ? `${color}55` : "var(--color-border)",
                opacity: isPending && !active ? 0.55 : 1,
              }}
            >
              <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
                {isDone && (
                  <span
                    className="grid h-3.5 w-3.5 place-items-center rounded-full"
                    style={{ background: color, color: "#fff" }}
                  >
                    <Check className="h-[9px] w-[9px]" strokeWidth={3} />
                  </span>
                )}
                {isRunning && (
                  <span
                    className="h-3 w-3 rounded-full border-2"
                    style={{
                      borderColor: `${color}30`,
                      borderTopColor: color,
                      animation: "onboarding-spin 0.7s linear infinite",
                    }}
                  />
                )}
                {isPending && (
                  <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[color:var(--color-border)] bg-[color:var(--color-card)]" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div
                  className="text-[11px] leading-tight"
                  style={{
                    fontWeight: isRunning ? 700 : 600,
                    color: isRunning
                      ? color
                      : isDone
                        ? "var(--color-foreground)"
                        : "var(--color-muted-foreground)",
                  }}
                >
                  {s.label}
                </div>
                {isRunning && (
                  <div
                    className="mt-1 h-0.5 w-full overflow-hidden rounded-full"
                    style={{ background: `${color}18` }}
                  >
                    <div
                      className="h-full transition-[width] duration-100"
                      style={{ width: `${localT * 100}%`, background: color }}
                    />
                  </div>
                )}
              </div>

              <span
                className="shrink-0 font-mono text-[9.5px]"
                style={{
                  color: isDone ? color : "var(--color-muted-foreground)",
                  fontWeight: isDone ? 700 : 500,
                }}
              >
                {isDone
                  ? s.detail
                  : isRunning
                    ? `${Math.round(localT * 100)}%`
                    : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative h-[64px] overflow-hidden">
        <div
          className="absolute inset-x-0 bottom-0 flex items-center gap-2 rounded-md border px-2.5 py-1.5"
          style={{
            background: `${color}10`,
            borderColor: `${color}33`,
          }}
        >
          <span
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
            style={{ background: `${color}22`, color }}
          >
            <NoteIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
          <span
            className="text-[10.5px] font-medium leading-snug"
            style={{ color }}
          >
            {note}
          </span>
        </div>
      </div>
    </div>
  );
}
