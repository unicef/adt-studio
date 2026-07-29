import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBookConfig } from "@/hooks/use-book-config";
import { usePersistConfig } from "@/hooks/use-persist-config";
import { usePages } from "@/hooks/use-pages";
import { cn } from "@/lib/utils";

type EpubGlossaryMode = "word" | "page" | "both";
type Placement = number | "end";

interface EpubGlossaryConfigValue {
  mode?: EpubGlossaryMode;
  page_placements?: Placement[];
}

/**
 * EPUB-only glossary implementation choice, nested under the Glossary toggle
 * in the export dialog. Persisted to book config (`epub_glossary`) so the
 * choice sticks across exports; the API reads it from config at package time.
 */
export function EpubGlossaryOptions({
  bookLabel,
  disabled,
}: {
  bookLabel: string;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const { data: configData } = useBookConfig(bookLabel);
  const { data: pages } = usePages(bookLabel);
  const persist = usePersistConfig(bookLabel);
  const [pageDraft, setPageDraft] = useState("");

  const config = configData?.config as
    | { epub_glossary?: EpubGlossaryConfigValue }
    | undefined;
  const mode: EpubGlossaryMode = config?.epub_glossary?.mode ?? "word";
  const placements: Placement[] = config?.epub_glossary?.page_placements ?? [
    "end",
  ];
  const maxPage = Math.max(0, ...(pages ?? []).map((p) => p.pageNumber));

  const save = (patch: Partial<EpubGlossaryConfigValue>) => {
    persist({
      epub_glossary: {
        mode,
        page_placements: placements,
        ...patch,
      },
    });
  };

  const addPagePlacement = () => {
    const n = Number(pageDraft);
    if (!Number.isInteger(n) || n < 1 || (maxPage > 0 && n > maxPage)) return;
    if (placements.includes(n)) {
      setPageDraft("");
      return;
    }
    save({
      page_placements: [
        ...placements.filter((p) => p !== "end"),
        n,
        ...(placements.includes("end") ? (["end"] as Placement[]) : []),
      ],
    });
    setPageDraft("");
  };

  const removePlacement = (placement: Placement) => {
    if (placements.length <= 1) return;
    save({ page_placements: placements.filter((p) => p !== placement) });
  };

  const modeOptions: Array<{
    value: EpubGlossaryMode;
    label: ReactNode;
    description: ReactNode;
  }> = [
    {
      value: "word",
      label: <Trans>Pop-up definitions</Trans>,
      description: (
        <Trans>
          Standard EPUB glossary — tapping a term shows its definition. Needs
          reader support (not Apple Books).
        </Trans>
      ),
    },
    {
      value: "page",
      label: <Trans>Glossary pages</Trans>,
      description: (
        <Trans>
          Adds glossary pages to the book. Terms link to their entry and each
          entry links back to the text. Works in every reader.
        </Trans>
      ),
    },
    {
      value: "both",
      label: <Trans>Both</Trans>,
      description: (
        <Trans>
          Pop-ups where supported, plus browsable glossary pages in the book.
        </Trans>
      ),
    },
  ];

  return (
    <div className="ml-10 mr-2 mt-1 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <Trans>Glossary format</Trans>
      </h5>
      <div
        role="radiogroup"
        aria-label={t`Glossary format`}
        className="space-y-1"
      >
        {modeOptions.map((option) => {
          const checked = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => save({ mode: option.value })}
              className={cn(
                "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                checked
                  ? "border-lime-400 bg-lime-50"
                  : "border-slate-200 bg-white hover:bg-slate-50",
                disabled && "opacity-60 cursor-not-allowed",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 h-3 w-3 shrink-0 rounded-full border",
                  checked
                    ? "border-lime-600 bg-lime-500"
                    : "border-slate-300 bg-white",
                )}
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-slate-800">
                  {option.label}
                </span>
                <span className="block text-[11px] leading-snug text-slate-500">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {mode !== "word" && (
        <div className="space-y-1.5 pt-1">
          <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <Trans>Glossary page placement</Trans>
          </h5>
          <p className="text-[11px] leading-snug text-slate-500">
            <Trans>
              Each glossary page collects the terms used since the previous
              one.
            </Trans>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {placements.map((placement) => (
              <span
                key={String(placement)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
              >
                {placement === "end" ? (
                  <Trans>End of book</Trans>
                ) : (
                  <Trans>After page {placement}</Trans>
                )}
                {placements.length > 1 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removePlacement(placement)}
                    aria-label={t`Remove placement`}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={maxPage > 0 ? maxPage : undefined}
              value={pageDraft}
              disabled={disabled}
              onChange={(e) => setPageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPagePlacement();
                }
              }}
              placeholder={t`Page number`}
              className="h-7 w-28 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={disabled || pageDraft.trim() === ""}
              onClick={addPagePlacement}
            >
              <Plus className="mr-1 h-3 w-3" />
              <Trans>Add</Trans>
            </Button>
            {!placements.includes("end") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                onClick={() => save({ page_placements: [...placements, "end"] })}
              >
                <Trans>Add end of book</Trans>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
