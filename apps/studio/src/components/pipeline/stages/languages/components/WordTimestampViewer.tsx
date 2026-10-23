import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronDown, ChevronRight, ChevronUp, Loader2, Save, Type, X } from "lucide-react"
import { useFloatingSave } from "../../../components/floating-save"
import { cn } from "@/lib/utils"
import type { WordTimestamp, WordTimestampEntry, WordTimestampEditGuard, WordTimestampSaveResponse } from "@/api/client"

function TimecodeInput({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  title,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  title?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const display = draft ?? value.toFixed(3);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const triggerFlash = () => {
    setFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(false), 400);
  };

  const tryChange = (requested: number) => {
    const clamped = Math.max(min, Math.min(max, requested));
    if (clamped !== value) onChange(clamped);
    if (Math.abs(clamped - requested) > 1e-6) triggerFlash();
  };

  const nudge = (direction: 1 | -1) => {
    const next = Math.round((value + direction * 0.1) * 1000) / 1000;
    tryChange(next);
    setDraft(null);
  };

  return (
    <span className="inline-flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          // Track valid edits immediately, including while a previous save is
          // pending; blur alone is too late to protect a successor draft.
          if (next.trim() && Number.isFinite(Number(next))) tryChange(Number(next));
        }}
        onBlur={() => {
          if (draft != null) {
            const v = parseFloat(draft);
            if (!isNaN(v)) tryChange(v);
            setDraft(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            nudge(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            nudge(-1);
          }
        }}
        title={title}
        className={cn(className, flash && "!text-red-500 !border-red-500/60")}
      />
      <span className="inline-flex flex-col -ml-0.5 shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nudge(1)}
          className="flex items-center justify-center w-3 h-2.5 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => nudge(-1)}
          className="flex items-center justify-center w-3 h-2.5 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </span>
    </span>
  );
}

/** Collapsible timestamp detail view — collapsed by default, expandable multi-column table. */
export function WordTimestampViewer({
  bookLabel,
  timestamps,
  onEditingChange,
  onSave,
  isSaving,
  columns = 2,
}: {
  bookLabel: string;
  timestamps: WordTimestampEntry;
  onEditingChange?: (id: string, language: string, editing: boolean) => void;
  onSave?: (words: WordTimestamp[], duration: number, guard: WordTimestampEditGuard) => Promise<WordTimestampSaveResponse>;
  isSaving?: boolean;
  columns?: number;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const [editWords, setEditWords] = useState<WordTimestamp[] | null>(null);
  const draftRef = useRef(editWords);
  const baseline = useRef<WordTimestampEditGuard>(editGuard(timestamps));
  const saving = useRef(false);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [saveError, setSaveError] = useState<string | null>(null);

  const words = editWords ?? timestamps.words;
  const dirty = editWords != null;
  const draftId = `timings:${timestamps.voiceSlot ?? "primary"}:${timestamps.textId}`;
  useEffect(() => {
    onEditingChange?.(draftId, timestamps.language, dirty || pending);
    return () => onEditingChange?.(draftId, timestamps.language, false);
  }, [draftId, timestamps.language, dirty, pending, onEditingChange]);
  const discard = () => {
    if (saving.current || isSaving) return;
    draftRef.current = null;
    setEditWords(null);
    setSaveError(null);
  };

  const handleExpand = () => {
    setExpanded(!expanded);
  };

  const updateWord = (index: number, field: "start" | "end", value: number) => {
    if (!editWords) baseline.current = editGuard(timestamps);
    const base = editWords ?? [...timestamps.words];
    const current = base[index];
    // Clamp to keep boundaries non-overlapping: start ≥ prev.end and ≤ own end;
    // end ≥ own start and ≤ next.start. First word's lower bound is 0; last
    // word's upper bound is unbounded.
    let clamped = Math.max(0, value);
    if (field === "start") {
      const lower = index > 0 ? base[index - 1].end : 0;
      clamped = Math.max(lower, Math.min(clamped, current.end));
    } else {
      const upper =
        index < base.length - 1
          ? base[index + 1].start
          : Number.POSITIVE_INFINITY;
      clamped = Math.min(upper, Math.max(clamped, current.start));
    }
    const updated = base.map((w, i) =>
      i === index ? { ...w, [field]: clamped } : w,
    );
    draftRef.current = updated;
    onEditingChange?.(draftId, timestamps.language, true);
    setEditWords(updated);
  };

  const handleSave = async (forNavigation = false) => {
    if (saving.current || isSaving) {
      if (forNavigation) throw new Error(t`A save is still in progress. Wait for it to finish before leaving.`);
      return;
    }
    if (!draftRef.current || !onSave) return;
    const submitted = draftRef.current;
    const maxEnd = submitted.reduce((max, w) => Math.max(max, w.end), 0);
    saving.current = true;
    setPending(true);
    try {
      const receipt = await onSave(submitted, maxEnd, baseline.current);
      if (!mounted.current) return;
      baseline.current = editGuard(receipt.entry);
      if (draftRef.current === submitted) {
        draftRef.current = null;
        setEditWords(null);
      }
      setSaveError(null);
    } catch (error) {
      if (mounted.current) setSaveError(error instanceof Error ? error.message : String(error));
      if (forNavigation) throw error;
    } finally {
      saving.current = false;
      if (mounted.current) setPending(false);
    }
    if (forNavigation && mounted.current && draftRef.current) {
      throw new Error(t`Newer edits are still unsaved. Save them before leaving.`);
    }
  };

  useFloatingSave({
    id: `${bookLabel}:${timestamps.language}:${draftId}`,
    dirty, saving: pending || !!isSaving, stage: "speech", label: t`Timestamps`,
    onSave: () => handleSave(), onSaveStay: () => handleSave(true), onDiscard: discard,
  });

  // Split words into column chunks for multi-column layout
  const rowCount = Math.ceil(words.length / columns);
  const columnChunks: WordTimestamp[][] = [];
  for (let c = 0; c < columns; c++) {
    columnChunks.push(words.slice(c * rowCount, (c + 1) * rowCount));
  }

  const inputClass =
    "w-14 tabular-nums text-[10px] text-muted-foreground bg-transparent border-b border-transparent hover:border-muted-foreground/30 focus:border-pink-500 focus:outline-none transition-colors text-right appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]";

  return (
    <div className="mt-1.5">
      {saveError && <p role="alert" className="text-xs text-red-700">{saveError}</p>}
      {/* Collapsed summary row */}
      <button
        type="button"
        onClick={handleExpand}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Type className="h-3 w-3" />
        <span>
          {timestamps.words.length} {t`words`} ·{" "}
          {timestamps.duration.toFixed(1)}s
        </span>
      </button>

      {/* Expanded multi-column table */}
      {expanded && (
        <div className="mt-1.5 border rounded-md overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            <div
              className={cn(
                "grid gap-x-3",
                columns === 1 && "grid-cols-1",
                columns === 2 && "grid-cols-2",
                columns === 3 && "grid-cols-3",
                columns >= 4 && "grid-cols-4",
              )}
            >
              {columnChunks.map((chunk, colIdx) => (
                <div key={colIdx} className={cn(colIdx > 0 && "border-l")}>
                  {chunk.map((w, rowIdx) => {
                    const globalIdx = colIdx * rowCount + rowIdx;
                    const prevEnd =
                      globalIdx > 0 ? words[globalIdx - 1].end : 0;
                    const nextStart =
                      globalIdx < words.length - 1
                        ? words[globalIdx + 1].start
                        : Number.POSITIVE_INFINITY;
                    return (
                      <div
                        key={globalIdx}
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 text-xs",
                          rowIdx > 0 && "border-t",
                        )}
                      >
                        <span className="flex-1 min-w-0 truncate">
                          {w.word}
                        </span>
                        <TimecodeInput
                          value={w.start}
                          onChange={(v) => updateWord(globalIdx, "start", v)}
                          min={prevEnd}
                          max={w.end}
                          title={t`Start`}
                          className={inputClass}
                        />
                        <TimecodeInput
                          value={w.end}
                          onChange={(v) => updateWord(globalIdx, "end", v)}
                          min={w.start}
                          max={nextStart}
                          title={t`End`}
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Save/discard bar */}
          {dirty && onSave && (
            <div className="flex items-center justify-end gap-1.5 px-2 py-1.5 border-t bg-muted/30">
              <button
                type="button"
                onClick={discard}
                disabled={pending || isSaving}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-3 w-3" />
                {t`Discard`}
              </button>
              <button
                type="button"
                onClick={() => { void handleSave(); }}
                disabled={pending || isSaving}
                className="flex items-center gap-1 text-[10px] font-medium text-pink-600 hover:text-pink-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                {pending || isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {t`Save`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function editGuard(entry: WordTimestampEntry): WordTimestampEditGuard {
  return { baseVersion: entry.version, audioHash: entry.audioHash || undefined, audioIdentity: entry.audioIdentity };
}
