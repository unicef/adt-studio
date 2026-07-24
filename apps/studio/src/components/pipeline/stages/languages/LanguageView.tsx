import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleStop,
  Languages,
  Loader2,
  Play,
  Pause,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  TriangleAlert,
  Type,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAudioUrl, BASE_URL } from "@/api/client";
import type {
  TextCatalogEntry,
  TranslationEvaluationStatusResponse,
  WordTimestamp,
  WordTimestampEntry,
} from "@/api/client";
import { VersionPicker } from "@/components/pipeline/components/VersionPicker";
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config";
import { useActiveConfig } from "@/hooks/use-debug";
import { useBook } from "@/hooks/use-books";
import { useStepHeader } from "../../components/StepViewRouter";
import { LoadingState } from "../../components/LoadingState";
import { useBookRun } from "@/hooks/use-book-run";
import { useBookTasks } from "@/hooks/use-book-tasks";
import { useStageMissingCounts } from "@/hooks/use-stage-missing-counts";
import { useApiKey } from "@/hooks/use-api-key";
import { StageRunCard } from "../../components/StageRunCard";
import { StageEmptyState } from "../../components/StageEmptyState";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { normalizeLocale } from "@/lib/languages";
import {
  languageUsesSpeechProvider,
  resolveSpeechProviderForLanguage,
} from "@/lib/speech-routing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  isTranslationEvaluationEnabled,
  resolveTranslationLanguageState,
} from "./lib/translations-view-state";
import {
  type CatalogCategory,
  getEntryCategory,
  getEntryTtsExclusion,
  isAnswerEntry,
  isEasyReadEntry,
  isGlossaryEntry,
  isImageEntry,
} from "./lib/catalog-entries";
import { displayLang } from "./lib/display-lang";
import { ImageLightbox } from "./components/ImageLightbox";
import { WordHighlightPreview } from "./components/WordHighlightPreview";
import { usePendingChanges } from "../../components/change-summary";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

type TranslationEvaluationItem = NonNullable<
  NonNullable<TranslationEvaluationStatusResponse["evaluation"]>["items"][number]
>;
type ReviewFilter =
  | "all"
  | "needs-attention"
  | "pending-save"
  | "acceptable"
  | "accepted-anyway";

function TranslationReviewInline({
  item,
  suggestionApplied,
  onApplySuggestion,
  onAcceptAnyway,
  acceptingAnyway,
}: {
  item: TranslationEvaluationItem;
  suggestionApplied: boolean;
  onApplySuggestion: (suggestedText: string) => void;
  onAcceptAnyway: () => void;
  acceptingAnyway: boolean;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(!item.accepted_anyway && !item.acceptable);

  // The judge returns raw enum values; these badges are user-facing, so give
  // them the same treatment the review settings give the same concepts.
  const issueTypeLabel = (issueType: string): string => {
    switch (issueType) {
      case "meaning":
        return t`Meaning`;
      case "fluency":
        return t`Fluency`;
      case "terminology":
        return t`Terminology`;
      case "omission-or-addition":
        return t`Omission or addition`;
      case "formatting":
        return t`Formatting`;
      case "context":
        return t`Context`;
      default:
        return t`Other`;
    }
  };
  const severityLabel = (severity: string): string => {
    switch (severity) {
      case "low":
        return t`Low`;
      case "high":
        return t`High`;
      default:
        return t`Medium`;
    }
  };

  useEffect(() => {
    setOpen(!item.accepted_anyway && !item.acceptable);
  }, [item.acceptable, item.accepted_anyway, item.entry_id, item.rationale]);

  if (item.acceptable) {
    return (
      <div className="mt-1.5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
          title={t`Show review rationale`}
        >
          <Check className="h-3 w-3" />
          {t`Reviewed`}
        </button>
        {open ? (
          <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-xs text-emerald-950">
            <div className="font-medium text-emerald-800">{t`Acceptable`}</div>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{item.rationale}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if (item.accepted_anyway) {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        <Check className="h-3 w-3" />
        {t`Accepted anyway`}
      </div>
    );
  }

  if (suggestionApplied) {
    return (
      <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-950">
        <div className="flex min-w-0 items-start gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <div className="font-medium text-emerald-800">{t`Suggestion applied`}</div>
            <p className="mt-1 leading-relaxed">{t`Save changes, then run Review again.`}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-orange-200 bg-orange-50/70 p-2.5 text-xs text-orange-950">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
          <div className="min-w-0">
            <div className="font-medium text-orange-800">{t`Needs attention`}</div>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{item.rationale}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-100"
        >
          {open ? t`Hide` : t`Details`}
        </button>
      </div>

      {open ? (
        <div className="mt-2 space-y-2">
          {item.issue_types && item.issue_types.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.issue_types.map((issueType) => (
                <span
                  key={`${item.entry_id}-${issueType}`}
                  className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-orange-800 ring-1 ring-orange-200"
                >
                  {issueTypeLabel(issueType)}
                </span>
              ))}
              {item.severity ? (
                <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-orange-800 ring-1 ring-orange-200">
                  {severityLabel(item.severity)}
                </span>
              ) : null}
            </div>
          ) : null}

          {item.suggested_text ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-emerald-950">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase text-emerald-700">{t`Suggested translation`}</span>
                {item.suggestion_validated ? (
                  <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    {t`Validated`}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{item.suggested_text}</p>
            </div>
          ) : null}

          {!item.suggested_text && item.suggestion_validated === false ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-950">
              <div className="mb-1 text-[10px] font-semibold uppercase text-amber-700">{t`Suggestion withheld`}</div>
              <p className="whitespace-pre-wrap leading-relaxed">
                {item.suggestion_validation_rationale ??
                  t`No automatic suggestion is shown because the proposed fix did not pass validation.`}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {item.suggested_text ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-emerald-300 bg-white px-2 text-xs text-emerald-800 hover:bg-emerald-50"
                onClick={() => onApplySuggestion(item.suggested_text!)}
              >
                <Check className="h-3 w-3" />
                {t`Apply suggestion`}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-orange-300 bg-white px-2 text-xs text-orange-800 hover:bg-orange-100"
              onClick={onAcceptAnyway}
              disabled={acceptingAnyway}
            >
              {acceptingAnyway ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {t`Accept anyway`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Per-provider default TTS voice/model shown in the speech summary when the book hasn't
// pinned one. Mirrors resolveVoice()/resolveSpeechModel() in @adt/pipeline (and
// config/voices.yaml) so we never show an OpenAI voice/model for a Gemini/Azure provider.
// Values are voice/model identifiers, not user-facing copy — display only.

const DEFAULT_TTS_VOICE: Record<string, string> = {
  openai: "alloy",
// eslint-disable-next-line lingui/no-unlocalized-strings -- voice identifiers
  azure: "en-US-JennyNeural",
// eslint-disable-next-line lingui/no-unlocalized-strings -- voice identifiers
  gemini: "Kore",
};
const DEFAULT_TTS_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini-tts",
  azure: "azure-tts",
  gemini: "gemini-2.5-pro-preview-tts",
};

export function LanguageView({
  bookLabel,
  stageSlug = "translate",
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string;
  stageSlug?: string;
  selectedPageId?: string;
  onSelectPage?: (pageId: string | null) => void;
}) {
  const isSpeechStage = stageSlug === "speech";
  const { t, i18n } = useLingui();
  const { headerSlotEl } = useStepHeader();
  const { data: bookConfigData } = useBookConfig(bookLabel);
  const updateConfig = useUpdateBookConfig();
  const { data: activeConfigData } = useActiveConfig(bookLabel);
  const { data: book, isLoading: isBookLoading } = useBook(bookLabel);
  const queryClient = useQueryClient();
  const {
    stageState,
    stepProgress,
    queueRun,
    cancelRun,
    isCancelling,
    error: runError,
  } = useBookRun();
  const { isTaskRunning, tasks } = useBookTasks(bookLabel);
  const {
    apiKey,
    hasApiKey,
    azureKey,
    azureRegion,
    geminiKey,
    anthropicKey,
    googleKey,
    customBaseUrl,
    customApiKey,
  } = useApiKey();
  const translateState = stageState("translate");
  const speechState = stageState("speech");
  const activeState = isSpeechStage ? speechState : translateState;
  const stageDone = activeState === "done";
  const hasStageError = activeState === "error";
  const isRunning = activeState === "running" || activeState === "queued";

  const handleRun = useCallback(() => {
    if (!hasApiKey || isRunning) return;
    // Speech depends on translate, so always start from translate when running
    // speech — new catalog entries (e.g. from a glossary addition) need their
    // translations populated before TTS can synthesize them. The per-item cache
    // makes already-translated entries near-instant.
    queueRun({
      fromStage: "translate",
      toStage: stageSlug as "translate" | "speech",
      apiKey,
    });
  }, [hasApiKey, isRunning, apiKey, queueRun, stageSlug]);

  const stageMissing = useStageMissingCounts(bookLabel);
  const missingForCurrentStage = isSpeechStage
    ? stageMissing.speech
    : stageMissing.translate;
  const showMissingBanner =
    (stageDone || (isSpeechStage && hasStageError)) &&
    !isRunning &&
    missingForCurrentStage > 0;

  const handleDeleteTTS = useCallback(async () => {
    await api.deleteTTS(bookLabel);
    await queryClient.invalidateQueries({
      queryKey: ["books", bookLabel, "tts"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["books", bookLabel, "step-status"],
    });
  }, [bookLabel, queryClient]);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
    enabled: !!bookLabel,
  });

  // Easy Read source entries (`{sourceId}_easy_read`) live in their own node,
  // not the text catalog, but their translations are merged into
  // text-catalog-translation by the translate stage. Pull the source entries
  // in here so they surface as their own category/tab alongside the catalog.
  const { data: easyReadData } = useQuery({
    queryKey: ["books", bookLabel, "easy-read"],
    queryFn: () => api.getEasyRead(bookLabel),
    enabled: !!bookLabel,
  });

  const { data: ttsData } = useQuery({
    queryKey: ["books", bookLabel, "tts"],
    queryFn: () => api.getTTS(bookLabel),
    enabled: !!bookLabel,
  });

  const merged = activeConfigData?.merged as
    Record<string, unknown> | undefined;
  const speechConfig = merged?.speech;
  const speechConfigRecord =
    speechConfig && typeof speechConfig === "object"
      ? (speechConfig as Record<string, unknown>)
      : null;
  const translationEvaluationEnabled =
    !!activeConfigData &&
    isTranslationEvaluationEnabled(merged?.translation_evaluation);
  const wordHighlightingEnabled =
    speechConfigRecord?.word_highlighting === true;
  const configExcludedTextIds = useMemo(
    () =>
      Array.isArray(speechConfigRecord?.excluded_text_ids)
        ? (speechConfigRecord.excluded_text_ids as string[])
        : [],
    [speechConfigRecord],
  );
  const [pendingExcludedTextIds, setPendingExcludedTextIds] = useState<
    string[] | null
  >(null);
  const pendingExcludedTextIdsRef = useRef<string[] | null>(null);
  const configUpdateQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const effectiveExcludedTextIds =
    pendingExcludedTextIds ?? configExcludedTextIds;
  // Effective read-aloud exclusions (merged config) — category-level from the
  // speech settings plus individually muted entry ids.
  const ttsExclusionConfig = useMemo(
    () => ({
      excluded_categories: Array.isArray(
        speechConfigRecord?.excluded_categories,
      )
        ? (speechConfigRecord.excluded_categories as string[])
        : undefined,
      excluded_text_ids: effectiveExcludedTextIds,
    }),
    [effectiveExcludedTextIds, speechConfigRecord],
  );
  const excludedTextIdSet = useMemo(
    () => new Set(ttsExclusionConfig.excluded_text_ids ?? []),
    [ttsExclusionConfig],
  );
  const outputLanguages = Array.from(
    new Set(
      ((merged?.output_languages as string[] | undefined) ?? []).map((code) =>
        normalizeLocale(code),
      ),
    ),
  );
  const bookLanguage =
    book?.languageCode ?? book?.metadata?.language_code ?? null;
  const configuredEditingLanguage = merged?.editing_language as
    string | undefined;

  const hasExplicitOutputLanguages = outputLanguages.length > 0;

  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategory>("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [appliedSuggestionEntryIds, setAppliedSuggestionEntryIds] = useState<
    Set<string>
  >(() => new Set());
  // When active, the entry list is narrowed to speakable items that have no
  // audio yet (toggled from the "N missing" pill in the header).
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [lightbox, setLightbox] = useState<{
    src: string;
    caption?: string;
  } | null>(null);

  // Map of `${sourceImageId}::${language}` → translated image id, used to
  // render the localized variant alongside captions in the translation view.
  const { data: translatedImagesData } = useQuery({
    queryKey: ["books", bookLabel, "translated-images"],
    queryFn: () => api.listTranslatedImages(bookLabel),
    enabled: !!bookLabel,
  });
  const translatedImageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of translatedImagesData?.images ?? []) {
      map.set(
        `${row.sourceImageId}::${normalizeLocale(row.language)}`,
        row.imageId,
      );
    }
    return map;
  }, [translatedImagesData]);

  // Default to first output language when available
  useEffect(() => {
    if (
      hasExplicitOutputLanguages &&
      outputLanguages.length > 0 &&
      !selectedLang
    ) {
      setSelectedLang(outputLanguages[0]);
    }
  }, [outputLanguages.length, hasExplicitOutputLanguages]);

  const easyReadEntries = useMemo(
    () =>
      (easyReadData?.blocks ?? []).flatMap((block) =>
        block.entries.map((entry) => ({
          id: entry.easyReadId,
          text: entry.text,
        })),
      ),
    [easyReadData],
  );
  const entries = useMemo(() => {
    const base = catalog?.entries ?? [];
    return easyReadEntries.length > 0 ? [...base, ...easyReadEntries] : base;
  }, [catalog?.entries, easyReadEntries]);
  const sourceEntriesById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry.text])),
    [entries],
  );
  const pageFilteredEntries = selectedPageId
    ? entries.filter((e) => e.id.startsWith(selectedPageId + "_"))
    : entries;
  const categoryFilteredEntries =
    categoryFilter === "all"
      ? pageFilteredEntries
      : pageFilteredEntries.filter(
          (e) => getEntryCategory(e.id) === categoryFilter,
        );

  // When no output languages are configured, we're always viewing the source language.
  // When explicit output languages exist, check if the selected one matches the editing language.
  const {
    editingLanguage,
    isSourceLang: isSelectedSourceLang,
    isSourceLanguagePending,
  } = resolveTranslationLanguageState({
    selectedLang,
    configuredEditingLanguage,
    bookLanguage,
    isBookLoading,
  });
  const isSourceLang = !hasExplicitOutputLanguages || isSelectedSourceLang;
  const audioLang =
    selectedLang ??
    (hasExplicitOutputLanguages
      ? (outputLanguages[0] ?? editingLanguage)
      : editingLanguage);
  const currentLanguageUsesGemini =
    !!audioLang &&
    languageUsesSpeechProvider(audioLang, "gemini", speechConfig);
  // Speech keeps the entry list on screen during runs (audio fills in live via
  // the run's snapshot) and after failures (failed rows are marked); the run
  // card only shows before the first speech run. Translate keeps the original
  // behavior: run card until the stage is done.
  const showRunCard = isSpeechStage
    ? !(stageDone || isRunning || hasStageError)
    : !stageDone || isRunning;
  const ttsProgress =
    isSpeechStage && isRunning ? stepProgress("tts") : undefined;

  const toggleWordHighlighting = useCallback(() => {
    const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<
      string,
      unknown
    >;
    const existingSpeech =
      currentConfig.speech && typeof currentConfig.speech === "object"
        ? { ...(currentConfig.speech as Record<string, unknown>) }
        : {};
    currentConfig.speech = {
      ...existingSpeech,
      word_highlighting: !wordHighlightingEnabled,
    };
    updateConfig.mutate({ label: bookLabel, config: currentConfig });
  }, [
    bookConfigData?.config,
    bookLabel,
    updateConfig,
    wordHighlightingEnabled,
  ]);

  const toggleEntryMuted = useCallback(
    (textId: string) => {
      const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<
        string,
        unknown
      >;
      const existingSpeech =
        currentConfig.speech && typeof currentConfig.speech === "object"
          ? { ...(currentConfig.speech as Record<string, unknown>) }
          : {};
      // Toggle against the effective (merged) exclusions so the write matches
      // what the user currently sees.
      const next = new Set(
        pendingExcludedTextIdsRef.current ?? effectiveExcludedTextIds,
      );
      if (next.has(textId)) next.delete(textId);
      else next.add(textId);
      const nextIds = Array.from(next);
      pendingExcludedTextIdsRef.current = nextIds;
      setPendingExcludedTextIds(nextIds);
      currentConfig.speech = {
        ...existingSpeech,
        // Empty array is intentional: it overrides any project-level excluded ids.
        excluded_text_ids: nextIds,
      };
      configUpdateQueueRef.current = configUpdateQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const updated = await updateConfig.mutateAsync({
            label: bookLabel,
            config: currentConfig,
          });
          await queryClient.invalidateQueries({
            queryKey: ["debug", "config", bookLabel],
          });
          return updated;
        })
        .finally(() => {
          if (pendingExcludedTextIdsRef.current === nextIds) {
            pendingExcludedTextIdsRef.current = null;
            setPendingExcludedTextIds(null);
          }
        });
      void configUpdateQueueRef.current.catch(() => undefined);
    },
    [
      bookConfigData?.config,
      bookLabel,
      effectiveExcludedTextIds,
      queryClient,
      updateConfig,
    ],
  );

  // Fetch word timestamps for the active language on the speech page
  const { data: timestampData } = useQuery({
    queryKey: ["books", bookLabel, "tts-timestamps", audioLang],
    queryFn: () => api.getWordTimestamps(bookLabel, audioLang!),
    enabled: isSpeechStage && !!bookLabel && !!audioLang,
  });
  const timestampMap = timestampData?.entries ?? {};

  // Pending state for edits (keyed by language)
  const [pendingEntries, setPendingEntries] = useState<
    TextCatalogEntry[] | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [generateErrorById, setGenerateErrorById] = useState<
    Record<string, string>
  >({});
  const [uploadErrorById, setUploadErrorById] = useState<
    Record<string, string>
  >({});

  // Get translated entries for selected language
  const translationData = selectedLang
    ? catalog?.translations?.[selectedLang]
    : undefined;
  const translatedEntries = isSourceLang
    ? entries
    : (translationData?.entries ?? []);
  const translationVersion = isSourceLang
    ? (catalog?.version ?? null)
    : (translationData?.version ?? null);

  // Reset pending when version or language changes
  useEffect(() => {
    setPendingEntries(null);
    setAppliedSuggestionEntryIds(new Set());
  }, [translationVersion, selectedLang]);

  // Effective translated entries (pending overrides fetched data)
  const effectiveEntries = pendingEntries ?? translatedEntries;
  const translatedMap = useMemo(
    () => new Map(effectiveEntries.map((entry) => [entry.id, entry.text])),
    [effectiveEntries],
  );

  const {
    label: pendingLabel,
    labelKey: pendingLabelKey,
    hasChanges: dirty,
  } = usePendingChanges({
    prev: translatedEntries,
    next: pendingEntries,
    keyOf: (e) => e.id,
    isEqual: (a, b) => a.text === b.text,
    noun: { one: t`translation`, other: t`translations` },
  });

  const saveTranslation = useCallback(async () => {
    if (!pendingEntries || !selectedLang) return;
    setSaving(true);
    const minDelay = new Promise((r) => setTimeout(r, 400));
    await api.updateTranslation(bookLabel, selectedLang, {
      entries: pendingEntries,
    });
    setPendingEntries(null);
    setAppliedSuggestionEntryIds(new Set());
    await queryClient.invalidateQueries({
      queryKey: ["books", bookLabel, "text-catalog"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["evaluations", "translations", bookLabel],
    });
    // Audio was generated from the previous text, so it no longer matches.
    await queryClient.invalidateQueries({
      queryKey: ["books", bookLabel, "tts"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["books", bookLabel, "step-status"],
    });
    await minDelay;
    setSaving(false);
  }, [pendingEntries, selectedLang, bookLabel, queryClient]);

  const saveRef = useRef(saveTranslation);
  saveRef.current = saveTranslation;

  const updateEntry = (entryId: string, newText: string) => {
    const base = pendingEntries ?? translatedEntries;
    // If no existing entry for this id, add one
    const exists = base.some((e) => e.id === entryId);
    if (exists) {
      setPendingEntries(
        base.map((e) => (e.id === entryId ? { ...e, text: newText } : e)),
      );
    } else {
      setPendingEntries([...base, { id: entryId, text: newText }]);
    }
  };

  const applyReviewSuggestion = (entryId: string, suggestedText: string) => {
    updateEntry(entryId, suggestedText);
    setAppliedSuggestionEntryIds((current) => {
      const next = new Set(current);
      next.add(entryId);
      return next;
    });
  };

  const translationEvaluationKey = [
    "evaluations",
    "translations",
    bookLabel,
    selectedLang,
  ] as const;
  const reviewEntryIds = useMemo(
    () => categoryFilteredEntries.map((entry) => entry.id),
    [categoryFilteredEntries],
  );
  const translationEvaluation = useQuery({
    queryKey: translationEvaluationKey,
    queryFn: () => api.getTranslationEvaluation(bookLabel, selectedLang!),
    enabled:
      translationEvaluationEnabled &&
      !!bookLabel &&
      !!selectedLang &&
      !isSourceLang &&
      !isSpeechStage,
    retry: false,
  });
  const evaluationStatus = translationEvaluationEnabled
    ? (translationEvaluation.data ?? null)
    : null;
  const shouldAutoSurfaceReviewRef = useRef(false);
  const autoSurfaceAfterReviewVersionRef = useRef<number | null>(null);
  const hasTranslationEvaluationRunFailure =
    (evaluationStatus?.evaluation?.metadata?.failed_pages ?? 0) > 0;
  const evaluationItemsByEntryId = useMemo(() => {
    const map = new Map<string, TranslationEvaluationItem>();
    if (
      !evaluationStatus?.evaluation ||
      evaluationStatus.isStale ||
      hasTranslationEvaluationRunFailure
    )
      return map;
    const selectedIds = evaluationStatus.evaluation.metadata?.selected_entry_ids;
    const visibleIds = new Set(reviewEntryIds);
    const matchesVisibleScope = selectedIds
      ? selectedIds.some((entryId) => visibleIds.has(entryId))
      : true;
    if (!matchesVisibleScope) return map;
    for (const item of evaluationStatus.evaluation.items) {
      if (!visibleIds.has(item.entry_id)) continue;
      const currentSourceText = sourceEntriesById.get(item.entry_id);
      const currentTranslatedText = translatedMap.get(item.entry_id);
      if (item.source_text !== undefined && item.source_text !== currentSourceText)
        continue;
      if (
        item.translated_text !== undefined &&
        item.translated_text !== currentTranslatedText
      )
        continue;
      map.set(item.entry_id, item);
    }
    return map;
  }, [
    evaluationStatus,
    hasTranslationEvaluationRunFailure,
    reviewEntryIds,
    sourceEntriesById,
    translatedMap,
  ]);
  const hasReviewResults =
    translationEvaluationEnabled &&
    !isSourceLang &&
    !isSpeechStage &&
    !!evaluationStatus?.evaluation &&
    !evaluationStatus.isStale &&
    !hasTranslationEvaluationRunFailure &&
    evaluationItemsByEntryId.size > 0;
  const reviewItemsForCategory = useMemo(
    () =>
      categoryFilteredEntries
        .map((entry) => evaluationItemsByEntryId.get(entry.id))
        .filter((item): item is TranslationEvaluationItem => !!item),
    [categoryFilteredEntries, evaluationItemsByEntryId],
  );
  const reviewCounts = useMemo(() => {
    const acceptable = reviewItemsForCategory.filter(
      (item) => item.acceptable,
    ).length;
    const acceptedAnyway = reviewItemsForCategory.filter(
      (item) => item.accepted_anyway,
    ).length;
    const pendingSave = reviewItemsForCategory.filter(
      (item) =>
        !item.acceptable &&
        !item.accepted_anyway &&
        appliedSuggestionEntryIds.has(item.entry_id),
    ).length;
    const needsAttention = reviewItemsForCategory.filter(
      (item) =>
        !item.acceptable &&
        !item.accepted_anyway &&
        !appliedSuggestionEntryIds.has(item.entry_id),
    ).length;
    return {
      total: reviewItemsForCategory.length,
      acceptable,
      acceptedAnyway,
      pendingSave,
      needsAttention,
    };
  }, [appliedSuggestionEntryIds, reviewItemsForCategory]);
  const displayEntries = useMemo(() => {
    if (!hasReviewResults || reviewFilter === "all")
      return categoryFilteredEntries;
    return categoryFilteredEntries.filter((entry) => {
      const item = evaluationItemsByEntryId.get(entry.id);
      if (!item) return false;
      if (reviewFilter === "acceptable") return item.acceptable;
      if (reviewFilter === "accepted-anyway") return item.accepted_anyway;
      if (reviewFilter === "pending-save") {
        return (
          !item.acceptable &&
          !item.accepted_anyway &&
          appliedSuggestionEntryIds.has(entry.id)
        );
      }
      return (
        !item.acceptable &&
        !item.accepted_anyway &&
        !appliedSuggestionEntryIds.has(entry.id)
      );
    });
  }, [
    appliedSuggestionEntryIds,
    categoryFilteredEntries,
    evaluationItemsByEntryId,
    hasReviewResults,
    reviewFilter,
  ]);
  const activeEvaluationTask = useMemo(() => {
    if (!translationEvaluationEnabled) return null;
    return (
      [...tasks]
        .filter(
          (task) =>
            task.kind === "translation-evaluation" &&
            (task.status === "running" || task.status === "queued"),
        )
        .sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0))[0] ??
      null
    );
  }, [tasks, translationEvaluationEnabled]);
  const runTranslationReview = useMutation({
    mutationFn: async () => {
      if (!translationEvaluationEnabled)
        throw new Error(
          i18n._(msg`Translation review is disabled for this book.`),
        );
      if (!selectedLang)
        throw new Error(i18n._(msg`Select a target language first.`));
      if (reviewEntryIds.length === 0)
        throw new Error(i18n._(msg`No visible translations to review.`));
      return api.runTranslationEvaluation(
        bookLabel,
        selectedLang,
        apiKey,
        {
          pageId: selectedPageId ?? undefined,
          entryIds: reviewEntryIds,
        },
        {
          anthropicApiKey: anthropicKey || undefined,
          googleApiKey: googleKey || undefined,
          customBaseUrl: customBaseUrl || undefined,
          customApiKey: customApiKey || undefined,
        },
      );
    },
    onSuccess: async (result) => {
      shouldAutoSurfaceReviewRef.current = true;
      autoSurfaceAfterReviewVersionRef.current =
        result.status === "current"
          ? null
          : (evaluationStatus?.evaluationVersion ?? null);
      await queryClient.invalidateQueries({
        queryKey: ["evaluations", "translations", bookLabel],
      });
      await queryClient.invalidateQueries({ queryKey: translationEvaluationKey });
    },
  });
  const acceptAnyway = useMutation({
    mutationFn: async (entryId: string) => {
      if (!selectedLang)
        throw new Error(i18n._(msg`Select a target language first.`));
      return api.acceptTranslationEvaluationItemAnyway(
        bookLabel,
        selectedLang,
        entryId,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["evaluations", "translations", bookLabel],
      });
      await queryClient.invalidateQueries({ queryKey: translationEvaluationKey });
    },
  });
  const canReviewVisibleTranslations =
    translationEvaluationEnabled &&
    !isSourceLang &&
    !isSpeechStage &&
    !!selectedLang &&
    reviewEntryIds.length > 0 &&
    !runTranslationReview.isPending &&
    !isTaskRunning("translation-evaluation") &&
    !dirty;
  const runTranslationReviewMutate = runTranslationReview.mutate;
  const runTranslationReviewPending = runTranslationReview.isPending;

  // Build audio lookup — use selected language, or editing language when no output languages
  const audioMap = new Map<
    string,
    { fileName: string; voice: string; cacheKey?: string }
  >();
  if (ttsData && audioLang && ttsData.languages[audioLang]) {
    for (const e of ttsData.languages[audioLang].entries) {
      audioMap.set(e.textId, {
        fileName: e.fileName,
        voice: e.voice,
        cacheKey: e.cacheKey,
      });
    }
  }
  // Per-item generation failures for the selected language (from the last run,
  // or streamed live while a run is in progress)
  const failedAudioMap = new Map<string, string>();
  if (ttsData && audioLang) {
    for (const f of ttsData.languages[audioLang]?.failed ?? []) {
      failedAudioMap.set(f.textId, f.error);
    }
  }
  // Separate base-language audio map for the source column in translation view
  const baseAudioMap = new Map<
    string,
    { fileName: string; voice: string; cacheKey?: string }
  >();
  if (
    ttsData &&
    editingLanguage &&
    ttsData.languages[editingLanguage] &&
    audioLang !== editingLanguage
  ) {
    for (const e of ttsData.languages[editingLanguage].entries) {
      baseAudioMap.set(e.textId, {
        fileName: e.fileName,
        voice: e.voice,
        cacheKey: e.cacheKey,
      });
    }
  }
  // Build per-language model/voice summary from TTS data
  const langTtsSummary = useMemo(() => {
    const map = new Map<
      string,
      { provider: string; model: string; voice: string }
    >();
    if (!ttsData) return map;
    for (const [lang, data] of Object.entries(ttsData.languages)) {
      const first = data.entries[0];
      if (first) {
        map.set(lang, {
          provider: first.provider ?? "",
          model: first.model,
          voice: first.voice,
        });
      }
    }
    return map;
  }, [ttsData]);

  const totalAudioFiles = ttsData
    ? Object.values(ttsData.languages).reduce(
        (sum, lang) => sum + lang.entries.length,
        0,
      )
    : 0;
  // Muted entries neither need audio nor count as missing
  const speakableEntries = displayEntries.filter(
    (entry) => !getEntryTtsExclusion(entry.id, ttsExclusionConfig).excluded,
  );
  const generatedAudioCount = speakableEntries.filter((entry) =>
    audioMap.has(entry.id),
  ).length;
  const missingAudioCount = Math.max(
    speakableEntries.length - generatedAudioCount,
    0,
  );
  // Speakable entries still without audio — the same set the "N missing" pill
  // counts. When the Missing filter is on, the list renders only these.
  const missingEntries = speakableEntries.filter(
    (entry) => !audioMap.has(entry.id),
  );
  const missingFilterActive =
    isSpeechStage && showMissingOnly && missingAudioCount > 0;
  const visibleEntries = missingFilterActive ? missingEntries : displayEntries;

  // Once every missing item has been generated (or the language changes so the
  // pill disappears), drop back to the full list instead of leaving the user
  // staring at an empty filtered view.
  useEffect(() => {
    if (showMissingOnly && missingAudioCount === 0) setShowMissingOnly(false);
  }, [showMissingOnly, missingAudioCount]);

  // Track playback state for the currently-playing entry (only one plays at a time)
  const [playingEntryId, setPlayingEntryId] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const showReviewFilter = useCallback(
    (filter: ReviewFilter, scrollToFirst = false) => {
      setReviewFilter(filter);
      if (scrollToFirst) {
        window.setTimeout(
          () => virtualizer.scrollToIndex(0, { align: "start" }),
          0,
        );
      }
    },
    [virtualizer],
  );

  // After a review finishes, jump straight to what needs attention.
  useEffect(() => {
    if (!shouldAutoSurfaceReviewRef.current || !hasReviewResults) return;
    const currentVersion = evaluationStatus?.evaluationVersion ?? null;
    const previousVersion = autoSurfaceAfterReviewVersionRef.current;
    if (previousVersion !== null && currentVersion === previousVersion) return;
    shouldAutoSurfaceReviewRef.current = false;
    autoSurfaceAfterReviewVersionRef.current = null;
    if (reviewCounts.needsAttention > 0) {
      showReviewFilter("needs-attention", true);
    } else {
      showReviewFilter("all");
    }
  }, [
    evaluationStatus?.evaluationVersion,
    hasReviewResults,
    reviewCounts.needsAttention,
    showReviewFilter,
  ]);

  const generateAudioMutation = useMutation({
    mutationFn: async (variables: { textId: string; language: string }) => {
      if (!geminiKey) {
        throw new Error(
          i18n._(msg`Gemini API key is required to generate audio.`),
        );
      }
      return api.generateGeminiTTSForItem(
        bookLabel,
        variables.textId,
        variables.language,
        {
          geminiApiKey: geminiKey,
          openaiApiKey: apiKey || undefined,
          azure:
            azureKey && azureRegion
              ? { key: azureKey, region: azureRegion }
              : undefined,
        },
      );
    },
    onMutate: (variables) => {
      setGenerateErrorById((prev) => {
        if (!(variables.textId in prev)) return prev;
        const next = { ...prev };
        delete next[variables.textId];
        return next;
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "tts"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "step-status"],
        }),
      ]);
    },
    onError: (error, variables) => {
      setGenerateErrorById((prev) => ({
        ...prev,
        [variables.textId]:
          error instanceof Error ? error.message : String(error),
      }));
      queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "step-status"],
      });
    },
  });

  const handleGenerateAudio = useCallback(
    (textId: string) => {
      if (!audioLang || !currentLanguageUsesGemini) return;
      generateAudioMutation.mutate({ textId, language: audioLang });
    },
    [audioLang, currentLanguageUsesGemini, generateAudioMutation],
  );

  const uploadAudioMutation = useMutation({
    mutationFn: async (variables: {
      textId: string;
      language: string;
      file: File;
    }) =>
      api.uploadTTSForItem(
        bookLabel,
        variables.textId,
        variables.language,
        variables.file,
      ),
    onMutate: (variables) => {
      setUploadErrorById((prev) => {
        if (!(variables.textId in prev)) return prev;
        const next = { ...prev };
        delete next[variables.textId];
        return next;
      });
      setGenerateErrorById((prev) => {
        if (!(variables.textId in prev)) return prev;
        const next = { ...prev };
        delete next[variables.textId];
        return next;
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "tts"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "tts-timestamps", audioLang],
        }),
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "step-status"],
        }),
      ]);
    },
    onError: (error, variables) => {
      setUploadErrorById((prev) => ({
        ...prev,
        [variables.textId]:
          error instanceof Error ? error.message : String(error),
      }));
    },
  });

  const handleUploadAudio = useCallback(
    (textId: string, file: File) => {
      if (!audioLang) return;
      uploadAudioMutation.mutate({ textId, language: audioLang, file });
    },
    [audioLang, uploadAudioMutation],
  );

  const transcribeMutation = useMutation({
    mutationFn: async (variables: { textId: string; language: string }) => {
      if (!apiKey) throw new Error("OpenAI API key required for transcription");
      return api.transcribeOne(
        bookLabel,
        variables.textId,
        variables.language,
        apiKey,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "tts-timestamps", audioLang],
      });
    },
  });

  const transcribeAllMutation = useMutation({
    mutationFn: async (language: string) => {
      if (!apiKey) throw new Error("OpenAI API key required for transcription");
      return api.transcribeAll(bookLabel, language, apiKey);
    },
  });

  const saveTimestampsMutation = useMutation({
    mutationFn: async (variables: {
      textId: string;
      language: string;
      words: WordTimestamp[];
      duration: number;
    }) => {
      return api.saveWordTimestamps(
        bookLabel,
        variables.language,
        variables.textId,
        {
          words: variables.words,
          duration: variables.duration,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "tts-timestamps", audioLang],
      });
    },
  });

  const handleSaveTimestamps = useCallback(
    (textId: string, words: WordTimestamp[], duration: number) => {
      if (!audioLang) return;
      saveTimestampsMutation.mutate({
        textId,
        language: audioLang,
        words,
        duration,
      });
    },
    [audioLang, saveTimestampsMutation],
  );

  const handleTranscribe = useCallback(
    (textId: string) => {
      if (!audioLang || !apiKey) return;
      transcribeMutation.mutate({ textId, language: audioLang });
    },
    [audioLang, apiKey, transcribeMutation],
  );

  // Resolve speech config summary for display.
  const speechSummary = useMemo(() => {
    const provider =
      (speechConfig && typeof speechConfig === "object"
        ? ((speechConfig as Record<string, unknown>).default_provider as string)
        : undefined) ?? "openai";
    const defaultVoice =
      DEFAULT_TTS_VOICE[provider] ?? DEFAULT_TTS_VOICE.openai;
    const defaultModel =
      DEFAULT_TTS_MODEL[provider] ?? DEFAULT_TTS_MODEL.openai;
    if (!speechConfig || typeof speechConfig !== "object") {
      return { provider, voice: defaultVoice, model: defaultModel };
    }
    const sc = speechConfig as Record<string, unknown>;
    const voice = (sc.voice as string) ?? defaultVoice;
    const model = (sc.model as string) ?? undefined;
    const providers = sc.providers as
      Record<string, Record<string, unknown>> | undefined;
    const providerModel = providers?.[provider]?.model as string | undefined;
    return { provider, voice, model: providerModel ?? model ?? defaultModel };
  }, [speechConfig]);

  const headerControls = catalog ? (
    <div className="flex items-center gap-1.5 ml-auto">
      {isSpeechStage && isRunning && (
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          {ttsProgress?.totalPages
            ? t`Generating ${String(ttsProgress.page ?? 0)}/${String(ttsProgress.totalPages)}`
            : t`Preparing speech...`}
        </span>
      )}

      <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(visibleEntries.length)} texts`}</span>
      {outputLanguages.length > 1 && (
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(outputLanguages.length)} languages`}</span>
      )}
      {currentLanguageUsesGemini ? (
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">
          {t`${String(generatedAudioCount)}/${String(speakableEntries.length)} audio`}
        </span>
      ) : (
        totalAudioFiles > 0 && (
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(totalAudioFiles)} audio`}</span>
        )
      )}
      {currentLanguageUsesGemini && missingAudioCount > 0 && (
        <button
          type="button"
          onClick={() => setShowMissingOnly((v) => !v)}
          aria-pressed={missingFilterActive}
          title={
            missingFilterActive
              ? t`Show all entries`
              : t`Show only entries missing audio`
          }
          className={cn(
            "text-[10px] rounded-full px-2 py-0.5 inline-flex items-center gap-1 transition-colors cursor-pointer",
            missingFilterActive
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-amber-100 text-amber-900 hover:bg-amber-200",
          )}
        >
          {t`${missingAudioCount} missing`}
          {missingFilterActive && <X className="w-2.5 h-2.5" />}
        </button>
      )}
      {selectedLang &&
        translationVersion != null &&
        !isSourceLang &&
        !isSpeechStage && (
          <VersionPicker
            step="text-catalog-translation"
            itemId={selectedLang}
            currentVersion={translationVersion}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            pendingLabel={pendingLabel}
            pendingLabelKey={pendingLabelKey}
            onPreview={(d) => {
              const data = d as { entries?: TextCatalogEntry[] };
              setPendingEntries(data?.entries ?? []);
              setAppliedSuggestionEntryIds(new Set());
            }}
            onSave={() => saveRef.current()}
            onDiscard={() => {
              setPendingEntries(null);
              setAppliedSuggestionEntryIds(new Set());
            }}
          />
        )}
      {translationEvaluationEnabled &&
        selectedLang &&
        !isSourceLang &&
        !isSpeechStage && (
          <button
            type="button"
            onClick={() => runTranslationReviewMutate()}
            disabled={!canReviewVisibleTranslations}
            title={
              dirty
                ? t`Save changes before reviewing`
                : t`Review visible translations`
            }
            className="inline-flex h-6 items-center gap-1 rounded bg-white/20 px-2 text-[10px] font-medium text-white transition-colors hover:bg-white/30 disabled:cursor-default disabled:opacity-40"
          >
            {runTranslationReviewPending || activeEvaluationTask ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : hasReviewResults &&
              reviewCounts.needsAttention === 0 &&
              reviewCounts.pendingSave === 0 ? (
              <Check className="h-3 w-3" />
            ) : (
              <WandSparkles className="h-3 w-3" />
            )}
            {runTranslationReviewPending || activeEvaluationTask
              ? t`Reviewing...`
              : hasReviewResults && reviewCounts.needsAttention > 0
                ? t`${reviewCounts.needsAttention} issue/issues`
                : hasReviewResults && reviewCounts.pendingSave > 0
                  ? t`${reviewCounts.pendingSave} pending save`
                  : hasReviewResults
                    ? t`Reviewed`
                    : t`Review`}
          </button>
        )}
      <div className="w-px h-4 bg-white/20" />
      <button
        type="button"
        onClick={() => {
          if (!hasApiKey || isRunning) return;
          queueRun({
            fromStage: "translate",
            toStage: stageSlug as "translate" | "speech",
            apiKey,
          });
        }}
        disabled={!hasApiKey || isRunning}
        title={isSpeechStage ? t`Re-run speech` : t`Re-run translation`}
        className="text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      {isSpeechStage && (
        <>
          <button
            type="button"
            onClick={() => {
              if (!audioLang) return;
              const langDisplay = displayLang(audioLang);
              if (
                !window.confirm(
                  t`Are you sure you want to generate word-level timestamps for ${langDisplay}?`,
                )
              )
                return;
              transcribeAllMutation.mutate(audioLang);
            }}
            disabled={
              !apiKey ||
              totalAudioFiles === 0 ||
              isRunning ||
              transcribeAllMutation.isPending ||
              isTaskRunning("transcribe-timestamps")
            }
            title={
              apiKey
                ? t`Calculate word timestamps for all entries`
                : t`OpenAI key required`
            }
            className="text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <Type className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  t`Are you sure you want to delete generated speech?`,
                )
              )
                return;
              handleDeleteTTS();
            }}
            disabled={totalAudioFiles === 0 || isRunning}
            title={t`Delete all speech`}
            className="text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {isRunning && (
            <button
              type="button"
              onClick={() => cancelRun()}
              disabled={isCancelling}
              title={isCancelling ? t`Cancelling…` : t`Cancel run`}
              aria-label={isCancelling ? t`Cancelling run` : t`Cancel run`}
              className="flex text-xs text-white/60 hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              {isCancelling ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <CircleStop className="w-3 h-3" />
              )}
            </button>
          )}
        </>
      )}
    </div>
  ) : null;

  if (!showRunCard && isLoading) {
    return (
      <LoadingState stageSlug="translate" label={t`Loading text catalog...`} />
    );
  }

  if (showRunCard || !catalog || entries.length === 0) {
    return (
      <>
        {headerSlotEl &&
          headerControls &&
          createPortal(headerControls, headerSlotEl)}
        <div className="p-4">
          <StageRunCard
            stageSlug={stageSlug}
            isRunning={isRunning}
            completed={stageDone}
            onRun={handleRun}
            disabled={!hasApiKey || isRunning}
          >
            {!isSpeechStage ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t`Book Language`}</p>
                  <p className="text-sm mt-0.5">
                    {bookLanguage ? (
                      <>
                        {displayLang(bookLanguage)}{" "}
                        <span className="text-muted-foreground">
                          ({bookLanguage})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">{t`Not detected`}</span>
                    )}
                  </p>
                </div>
                {outputLanguages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t`Output Languages`}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {outputLanguages.map((lang) => (
                        <span
                          key={lang}
                          className="inline-flex items-center text-xs bg-muted rounded-md px-2 py-0.5"
                        >
                          {displayLang(lang)}{" "}
                          <span className="text-muted-foreground ml-1">
                            ({lang})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <Link
                  to="/books/$label/$step/settings"
                  params={{ label: bookLabel, step: "translate" }}
                  search={{ tab: "general" }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  {t`Add Translations`}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t`Voice`}</p>
                  <p className="text-sm mt-0.5">
                    <span className="capitalize">{speechSummary.provider}</span>
                    {" · "}
                    {speechSummary.voice}
                    {" · "}
                    <span className="text-muted-foreground">
                      {speechSummary.model}
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-row items-center justify-between rounded-lg border bg-background p-3">
                    <div className="space-y-0.5 pr-3">
                      <Label
                        htmlFor="word-highlight-landing"
                        className="text-sm font-medium cursor-pointer"
                      >
                        {t`Word-level highlighting`}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t`Highlights words in sync with the audio. Adds noticeable time to speech generation.`}
                      </p>
                    </div>
                    <Switch
                      id="word-highlight-landing"
                      checked={wordHighlightingEnabled}
                      onCheckedChange={toggleWordHighlighting}
                      disabled={updateConfig.isPending || isRunning}
                    />
                  </div>
                  <WordHighlightPreview enabled={wordHighlightingEnabled} />
                </div>
                <Link
                  to="/books/$label/$step/settings"
                  params={{ label: bookLabel, step: "speech" }}
                  search={{ tab: "general" }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  {t`Choose Provider`}
                </Link>
              </div>
            )}
          </StageRunCard>
        </div>
      </>
    );
  }

  const showAllButton = selectedPageId ? (
    <div className="flex justify-center pt-2 pb-4">
      <button
        type="button"
        onClick={() => onSelectPage?.(null)}
        className="text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline transition-colors"
      >
        {t`Show all translations`}
      </button>
    </div>
  ) : null;

  // Language tabs + entries
  return (
    <>
      {headerSlotEl &&
        headerControls &&
        createPortal(headerControls, headerSlotEl)}
      <div className="flex flex-col h-full">
        {/* Fixed header: alerts, language tabs, column headers */}
        <div className="shrink-0 px-4 pt-4 space-y-3">
          {isSpeechStage && hasStageError && runError && (
            <Alert variant="destructive" className="rounded-md">
              <AlertDescription className="text-xs whitespace-pre-wrap break-words">
                {runError}
              </AlertDescription>
            </Alert>
          )}

          {showMissingBanner && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs text-amber-900">
                {isSpeechStage
                  ? t`${missingForCurrentStage} entry/entries are missing audio. Re-run to generate the missing items.`
                  : t`${missingForCurrentStage} entry/entries are missing translations. Re-run to fill the missing items.`}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                onClick={handleRun}
                disabled={!hasApiKey || isRunning}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                {isSpeechStage ? t`Re-run speech` : t`Re-run translation`}
              </Button>
            </div>
          )}

          {/* Language filter pills — always shown, base language first */}
          {editingLanguage && (
            <div className="flex gap-1.5 items-center flex-wrap">
              {[
                editingLanguage,
                ...outputLanguages.filter((l) => l !== editingLanguage),
              ].map((lang) => {
                const isBase = lang === editingLanguage;
                const isActive = hasExplicitOutputLanguages
                  ? selectedLang === lang
                  : isBase;
                const ttsSummary = isSpeechStage
                  ? langTtsSummary.get(lang)
                  : undefined;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setSelectedLang(lang)}
                    className={cn(
                      "text-xs px-3 rounded-md font-medium transition-colors cursor-pointer text-left",
                      isSpeechStage && ttsSummary ? "h-auto py-1.5" : "h-7",
                      isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span>
                      {displayLang(lang)}
                      <span
                        className={cn(
                          "ml-1 text-[10px]",
                          isActive ? "opacity-60" : "opacity-50",
                        )}
                      >
                        {isBase ? t`(base)` : `(${lang})`}
                      </span>
                    </span>
                    {isSpeechStage && ttsSummary && (
                      <span
                        className={cn(
                          "block text-[10px] leading-tight mt-0.5",
                          isActive ? "opacity-50" : "opacity-40",
                        )}
                      >
                        {ttsSummary.model} · {ttsSummary.voice}
                      </span>
                    )}
                  </button>
                );
              })}
              {!isSpeechStage && (
                <Link
                  to="/books/$label/$step/settings"
                  params={{ label: bookLabel, step: "translate" }}
                  search={{ tab: "general" }}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
                  title={t`Add language`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}

          {/* Category filter pills */}
          {pageFilteredEntries.length > 0 && (
            <div className="flex gap-1.5">
              {(
                [
                  ["all", t`All`],
                  ["text", t`Text`],
                  ["captions", t`Captions`],
                  ["answers", t`Answers`],
                  ["glossary", t`Glossary`],
                  ["easy-read", t`Easy Read`],
                ] as const
              ).map(([key, label]) => {
                const count =
                  key === "all"
                    ? pageFilteredEntries.length
                    : pageFilteredEntries.filter(
                        (e) => getEntryCategory(e.id) === key,
                      ).length;
                if (key !== "all" && count === 0) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategoryFilter(key)}
                    className={cn(
                      "text-xs h-7 px-3 rounded-md font-medium transition-colors cursor-pointer",
                      categoryFilter === key
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "ml-1 text-[10px] tabular-nums",
                        categoryFilter === key ? "opacity-60" : "opacity-50",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Each banner is its own polite live region: the review runs
              asynchronously, so a screen-reader user would otherwise never hear
              the outcome. They are alternatives in practice, so at most one
              announces at a time. */}
          {!isSourceLang && !isSpeechStage && hasReviewResults && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950"
            >
                <div className="flex flex-wrap items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <span className="font-medium text-emerald-900">
                    {reviewCounts.needsAttention > 0
                      ? reviewCounts.pendingSave > 0
                        ? t`Review complete: ${reviewCounts.acceptable} acceptable, ${reviewCounts.needsAttention} need attention, ${reviewCounts.pendingSave} pending save.`
                        : t`Review complete: ${reviewCounts.acceptable} acceptable, ${reviewCounts.needsAttention} need attention.`
                      : reviewCounts.pendingSave > 0
                        ? t`Review complete: ${reviewCounts.acceptable} acceptable, ${reviewCounts.pendingSave} pending save.`
                        : t`Review complete: all ${reviewCounts.total} reviewed translations are acceptable.`}
                  </span>
                  {reviewCounts.pendingSave > 0 && (
                    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                      {t`${reviewCounts.pendingSave} pending save`}
                    </span>
                  )}
                  {reviewCounts.acceptedAnyway > 0 && (
                    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                      {t`${reviewCounts.acceptedAnyway} accepted anyway`}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    {(
                      [
                        ["all", t`All`, reviewCounts.total],
                        [
                          "needs-attention",
                          t`Needs attention`,
                          reviewCounts.needsAttention,
                        ],
                        [
                          "pending-save",
                          t`Pending save`,
                          reviewCounts.pendingSave,
                        ],
                        ["acceptable", t`Acceptable`, reviewCounts.acceptable],
                        [
                          "accepted-anyway",
                          t`Accepted anyway`,
                          reviewCounts.acceptedAnyway,
                        ],
                      ] as const
                    ).map(([filter, label, count]) => {
                      if (filter !== "all" && count === 0) return null;
                      return (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => showReviewFilter(filter)}
                          aria-pressed={reviewFilter === filter}
                          className={cn(
                            "h-6 rounded px-2 text-[11px] font-medium transition-colors",
                            reviewFilter === filter
                              ? "bg-emerald-700 text-white"
                              : "bg-white/80 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100",
                          )}
                        >
                          {label}
                          <span className="ml-1 opacity-70 tabular-nums">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                    {reviewCounts.needsAttention > 0 && (
                      <button
                        type="button"
                        onClick={() => showReviewFilter("needs-attention", true)}
                        className="h-6 rounded bg-orange-100 px-2 text-[11px] font-medium text-orange-800 ring-1 ring-orange-200 hover:bg-orange-200"
                      >
                        {t`Next issue`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          {!isSourceLang && !isSpeechStage && activeEvaluationTask && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
            >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {activeEvaluationTask.progressMessage ??
                    t`Translation review is running.`}
                </span>
                {typeof activeEvaluationTask.progressPercent === "number" && (
                  <span className="ml-auto tabular-nums">
                    {Math.round(activeEvaluationTask.progressPercent)}%
                  </span>
                )}
              </div>
            )}

          {!isSourceLang && !isSpeechStage && evaluationStatus?.isStale && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {t`The saved translation review is stale. Run Review again for the visible translations.`}
            </div>
          )}

          {!isSourceLang &&
            !isSpeechStage &&
            hasTranslationEvaluationRunFailure && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                {t`The last translation review failed before producing reliable item-level results. Run Review again for the visible translations.`}
              </div>
            )}

          {translationEvaluationEnabled &&
            !isSourceLang &&
            !isSpeechStage &&
            runTranslationReview.error && (
              <Alert variant="destructive" className="rounded-md">
                <AlertDescription className="text-xs whitespace-pre-wrap break-words">
                  {runTranslationReview.error.message}
                </AlertDescription>
              </Alert>
            )}

          {translationEvaluationEnabled &&
            !isSourceLang &&
            !isSpeechStage &&
            acceptAnyway.error && (
              <Alert variant="destructive" className="rounded-md">
                <AlertDescription className="text-xs whitespace-pre-wrap break-words">
                  {acceptAnyway.error.message}
                </AlertDescription>
              </Alert>
            )}

          {!isSourceLang &&
            !isSourceLanguagePending &&
            visibleEntries.length > 0 && (
              <div className="grid grid-cols-2 gap-3 px-3 py-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {displayLang(editingLanguage)}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {selectedLang ? displayLang(selectedLang) : selectedLang}
                </span>
              </div>
            )}
        </div>

        {/* Entries */}
        {isSourceLanguagePending ? (
          <LoadingState
            stageSlug="translate"
            label={t`Resolving source language...`}
          />
        ) : hasReviewResults &&
          displayEntries.length === 0 &&
          categoryFilteredEntries.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium">
              {reviewFilter === "needs-attention"
                ? t`No translations need attention.`
                : reviewFilter === "acceptable"
                  ? t`No acceptable review results for this view.`
                  : reviewFilter === "pending-save"
                    ? t`No suggestions are pending save in this view.`
                    : reviewFilter === "accepted-anyway"
                      ? t`No translations were accepted anyway in this view.`
                      : t`No review results for this view.`}
            </p>
          </div>
        ) : selectedPageId &&
          displayEntries.length === 0 &&
          entries.length > 0 ? (
          <StageEmptyState
            icon={isSpeechStage ? AudioLines : Languages}
            color={isSpeechStage ? "rose" : "pink"}
            title={
              isSpeechStage
                ? t`No audio for this page`
                : t`No translations for this page`
            }
            subtitle={
              isSpeechStage
                ? t`This page has no entries to synthesize`
                : t`This page has no translatable text entries`
            }
          />
        ) : (
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = visibleEntries[virtualRow.index];
                const translated = translatedMap.get(entry.id);
                const audio = audioMap.get(entry.id);
                const baseAudio = baseAudioMap.get(entry.id);
                const isImg = isImageEntry(entry.id);
                const isAnswer = isAnswerEntry(entry.id);
                const evaluationItem = evaluationItemsByEntryId.get(entry.id);
                const exclusion = getEntryTtsExclusion(
                  entry.id,
                  ttsExclusionConfig,
                );
                // Easy Read variants inherit their source entry's mute — only the
                // source row can undo it, so lock the toggle on the variant row.
                const mutedViaSource =
                  exclusion.byId &&
                  isEasyReadEntry(entry.id) &&
                  !excludedTextIdSet.has(entry.id);
                const muteLockedReason = exclusion.byCategory
                  ? t`Muted by a content type switch in the Speech settings`
                  : mutedViaSource
                    ? t`Muted via its source text entry`
                    : undefined;
                const muteToggle = (
                  <TtsMuteToggle
                    muted={exclusion.excluded}
                    lockedReason={muteLockedReason}
                    onToggle={() => toggleEntryMuted(entry.id)}
                  />
                );
                // Audio status for the selected language: a recorded failure shows
                // immediately (even mid-run); plain "no audio" only after a run has
                // finished. Muting an entry clears both — it no longer needs audio.
                const audioFailure =
                  isSpeechStage && !isAnswer && !exclusion.excluded && !audio
                    ? failedAudioMap.get(entry.id)
                    : undefined;
                const audioMissing =
                  isSpeechStage &&
                  !isAnswer &&
                  !exclusion.excluded &&
                  !audio &&
                  !audioFailure &&
                  !isRunning &&
                  (stageDone || hasStageError);
                const audioStatusBadges = (
                  <>
                    {audioFailure && (
                      <span
                        title={audioFailure}
                        className="ml-1.5 text-[9px] font-medium text-red-700 bg-red-100 rounded px-1 py-0.5 cursor-help"
                      >
                        {t`Failed`}
                      </span>
                    )}
                    {audioMissing && (
                      <span className="ml-1.5 text-[9px] font-medium text-amber-700 bg-amber-100 rounded px-1 py-0.5">
                        {t`No audio`}
                      </span>
                    )}
                  </>
                );

                return (
                  <div
                    key={entry.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="pb-1">
                      {isSourceLang ? (
                        <div
                          className={cn(
                            "px-3 py-2.5 rounded-md border",
                            isAnswer ? "bg-amber-50/60" : "bg-card",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            {isImg && (
                              <img
                                src={`${BASE_URL}/books/${bookLabel}/images/${entry.id}`}
                                alt=""
                                className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border cursor-zoom-in hover:ring-blue-500"
                                onClick={() =>
                                  setLightbox({
                                    src: `${BASE_URL}/books/${bookLabel}/images/${entry.id}`,
                                    caption: entry.text,
                                  })
                                }
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] text-muted-foreground">
                                {entry.id}
                                {isAnswer && (
                                  <span className="ml-1.5 text-[9px] font-medium text-amber-700 bg-amber-100 rounded px-1 py-0.5">{t`Answer`}</span>
                                )}
                                {exclusion.excluded && (
                                  <span className="ml-1.5 text-[9px] font-medium text-rose-700 bg-rose-100 rounded px-1 py-0.5">{t`Muted`}</span>
                                )}
                                {audioStatusBadges}
                                {isSpeechStage &&
                                  audio &&
                                  !exclusion.excluded && (
                                    <span className="ml-1.5 text-[9px] text-muted-foreground/60">
                                      {audio.fileName}
                                    </span>
                                  )}
                                {muteToggle}
                              </span>
                              <HighlightedText
                                text={entry.text}
                                timestamps={
                                  isSpeechStage
                                    ? timestampMap[entry.id]
                                    : undefined
                                }
                                currentTime={
                                  playingEntryId === entry.id ? playbackTime : 0
                                }
                                isPlaying={playingEntryId === entry.id}
                              />
                            </div>
                          </div>
                          {isSpeechStage &&
                            !isAnswer &&
                            !exclusion.excluded &&
                            (audio || !isRunning) && (
                              <AudioAction
                                audio={audio}
                                audioLang={audioLang}
                                bookLabel={bookLabel}
                                textId={entry.id}
                                canGenerate={currentLanguageUsesGemini}
                                hasGeminiKey={geminiKey.length > 0}
                                onGenerate={handleGenerateAudio}
                                isGenerating={
                                  generateAudioMutation.isPending &&
                                  generateAudioMutation.variables?.textId ===
                                    entry.id &&
                                  generateAudioMutation.variables?.language ===
                                    audioLang
                                }
                                onUpload={handleUploadAudio}
                                isUploading={
                                  uploadAudioMutation.isPending &&
                                  uploadAudioMutation.variables?.textId ===
                                    entry.id &&
                                  uploadAudioMutation.variables?.language ===
                                    audioLang
                                }
                                errorMessage={
                                  uploadErrorById[entry.id] ??
                                  generateErrorById[entry.id]
                                }
                                timestamps={timestampMap[entry.id]}
                                onTranscribe={handleTranscribe}
                                isTranscribing={
                                  transcribeMutation.isPending &&
                                  transcribeMutation.variables?.textId ===
                                    entry.id
                                }
                                hasOpenaiKey={!!apiKey}
                                onTimeUpdate={(time) => {
                                  setPlaybackTime(time);
                                  setPlayingEntryId(entry.id);
                                }}
                                onPlayingChange={(p) => {
                                  if (!p) setPlayingEntryId(null);
                                  else setPlayingEntryId(entry.id);
                                }}
                                onSaveTimestamps={(words, dur) =>
                                  handleSaveTimestamps(entry.id, words, dur)
                                }
                                isSavingTimestamps={
                                  saveTimestampsMutation.isPending &&
                                  saveTimestampsMutation.variables?.textId ===
                                    entry.id
                                }
                                timestampColumns={4}
                              />
                            )}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "px-3 py-2.5 rounded-md border",
                            isAnswer ? "bg-amber-50/60" : "bg-card",
                          )}
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-start gap-3">
                                {isImg && (
                                  <img
                                    src={`${BASE_URL}/books/${bookLabel}/images/${entry.id}`}
                                    alt=""
                                    className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border cursor-zoom-in hover:ring-blue-500"
                                    onClick={() =>
                                      setLightbox({
                                        src: `${BASE_URL}/books/${bookLabel}/images/${entry.id}`,
                                        caption: entry.text,
                                      })
                                    }
                                  />
                                )}
                                <div className="min-w-0">
                                  <span className="text-[10px] text-muted-foreground">
                                    {entry.id}
                                    {isAnswer && (
                                      <span className="ml-1.5 text-[9px] font-medium text-amber-700 bg-amber-100 rounded px-1 py-0.5">{t`Answer`}</span>
                                    )}
                                    {exclusion.excluded && (
                                      <span className="ml-1.5 text-[9px] font-medium text-rose-700 bg-rose-100 rounded px-1 py-0.5">{t`Muted`}</span>
                                    )}
                                    {isSpeechStage &&
                                      baseAudio &&
                                      !exclusion.excluded && (
                                        <span className="ml-1.5 text-[9px] text-muted-foreground/60">
                                          {baseAudio.fileName}
                                        </span>
                                      )}
                                    {muteToggle}
                                  </span>
                                  <p className="text-sm leading-relaxed mt-0.5">
                                    {entry.text}
                                  </p>
                                </div>
                              </div>
                              {isSpeechStage &&
                                !isAnswer &&
                                !exclusion.excluded &&
                                baseAudio &&
                                editingLanguage && (
                                  <WaveformPlayer
                                    key={`base-${editingLanguage}:${baseAudio.fileName}:${baseAudio.cacheKey ?? ""}`}
                                    audioUrl={getAudioUrl(
                                      bookLabel,
                                      editingLanguage,
                                      baseAudio.fileName,
                                      baseAudio.cacheKey,
                                    )}
                                  />
                                )}
                            </div>
                            <div>
                              <div className="flex items-start gap-3">
                                {isImg &&
                                  (() => {
                                    const translatedId = selectedLang
                                      ? translatedImageMap.get(
                                          `${entry.id}::${selectedLang}`,
                                        )
                                      : undefined;
                                    if (translatedId) {
                                      const url = `${BASE_URL}/books/${bookLabel}/images/${translatedId}`;
                                      return (
                                        <img
                                          src={url}
                                          alt=""
                                          className="shrink-0 w-16 h-12 rounded object-cover ring-1 ring-border cursor-zoom-in hover:ring-blue-500"
                                          onClick={() =>
                                            setLightbox({
                                              src: url,
                                              caption: translated || entry.text,
                                            })
                                          }
                                        />
                                      );
                                    }
                                    return (
                                      <div
                                        className="shrink-0 w-16 h-12 rounded ring-1 ring-dashed ring-border bg-muted/30 flex items-center justify-center"
                                        title={t`Image not translated for this language`}
                                      >
                                        <span className="text-[8px] text-muted-foreground uppercase tracking-wide">{t`No image`}</span>
                                      </div>
                                    );
                                  })()}
                                <div className="min-w-0 flex-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    &nbsp;
                                    {audioStatusBadges}
                                    {isSpeechStage &&
                                      audio &&
                                      !exclusion.excluded && (
                                        <span className="text-[9px] text-muted-foreground/60">
                                          {audio.fileName}
                                        </span>
                                      )}
                                  </span>
                                  {isSpeechStage ? (
                                    <HighlightedText
                                      text={translated || ""}
                                      timestamps={timestampMap[entry.id]}
                                      currentTime={
                                        playingEntryId === entry.id
                                          ? playbackTime
                                          : 0
                                      }
                                      isPlaying={playingEntryId === entry.id}
                                    />
                                  ) : (
                                    <>
                                    <textarea
                                      value={translated ?? ""}
                                      onChange={(e) =>
                                        updateEntry(entry.id, e.target.value)
                                      }
                                      placeholder={t`Pending...`}
                                      className="w-full text-sm leading-relaxed mt-0.5 resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground placeholder:italic"
                                      style={
                                        {
                                          fieldSizing: "content",
                                        } as React.CSSProperties
                                      }
                                      rows={1}
                                    />
                                      {evaluationItem ? (
                                        <TranslationReviewInline
                                          item={evaluationItem}
                                          suggestionApplied={appliedSuggestionEntryIds.has(
                                            entry.id,
                                          )}
                                          onApplySuggestion={(suggestedText) =>
                                            applyReviewSuggestion(
                                              entry.id,
                                              suggestedText,
                                            )
                                          }
                                          onAcceptAnyway={() =>
                                            acceptAnyway.mutate(entry.id)
                                          }
                                          acceptingAnyway={
                                            acceptAnyway.isPending &&
                                            acceptAnyway.variables === entry.id
                                          }
                                        />
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </div>
                              {isSpeechStage &&
                                !isAnswer &&
                                !exclusion.excluded &&
                                (audio || !isRunning) && (
                                  <AudioAction
                                    audio={audio}
                                    audioLang={audioLang}
                                    bookLabel={bookLabel}
                                    textId={entry.id}
                                    canGenerate={currentLanguageUsesGemini}
                                    hasGeminiKey={geminiKey.length > 0}
                                    onGenerate={handleGenerateAudio}
                                    isGenerating={
                                      generateAudioMutation.isPending &&
                                      generateAudioMutation.variables
                                        ?.textId === entry.id &&
                                      generateAudioMutation.variables
                                        ?.language === audioLang
                                    }
                                    onUpload={handleUploadAudio}
                                    isUploading={
                                      uploadAudioMutation.isPending &&
                                      uploadAudioMutation.variables?.textId ===
                                        entry.id &&
                                      uploadAudioMutation.variables
                                        ?.language === audioLang
                                    }
                                    errorMessage={
                                      uploadErrorById[entry.id] ??
                                      generateErrorById[entry.id]
                                    }
                                    timestamps={timestampMap[entry.id]}
                                    onTranscribe={handleTranscribe}
                                    isTranscribing={
                                      transcribeMutation.isPending &&
                                      transcribeMutation.variables?.textId ===
                                        entry.id
                                    }
                                    hasOpenaiKey={!!apiKey}
                                    onTimeUpdate={(time) => {
                                      setPlaybackTime(time);
                                      setPlayingEntryId(entry.id);
                                    }}
                                    onPlayingChange={(p) => {
                                      if (!p) setPlayingEntryId(null);
                                      else setPlayingEntryId(entry.id);
                                    }}
                                    onSaveTimestamps={(words, dur) =>
                                      handleSaveTimestamps(entry.id, words, dur)
                                    }
                                    isSavingTimestamps={
                                      saveTimestampsMutation.isPending &&
                                      saveTimestampsMutation.variables
                                        ?.textId === entry.id
                                    }
                                  />
                                )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {showAllButton}
          </div>
        )}
        {lightbox && (
          <ImageLightbox
            src={lightbox.src}
            caption={lightbox.caption}
            onClose={() => setLightbox(null)}
          />
        )}
      </div>
    </>
  );
}

/** Number of bars in the waveform visualisation */
const WAVEFORM_BARS = 120;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Decode audio data into an array of normalised amplitudes (0-1) for waveform rendering.
 * Falls back to a flat line on error so the player still works.
 */
async function decodeWaveform(url: string, bars: number): Promise<number[]> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    const decoded = await ctx.decodeAudioData(buf);
    const raw = decoded.getChannelData(0);
    const step = Math.floor(raw.length / bars);
    const amps: number[] = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const v = raw[i * step + j];
        sum += v * v;
      }
      amps.push(Math.sqrt(sum / step));
    }
    const max = Math.max(...amps, 0.001);
    await ctx.close();
    return amps.map((a) => a / max);
  } catch {
    return Array(bars).fill(0.3) as number[];
  }
}

/** Global stop handle — only one waveform plays at a time */
let activePlayerStop: (() => void) | null = null;

function WaveformPlayer({
  audioUrl,
  onTimeUpdate,
  onPlayingChange,
}: {
  audioUrl: string;
  onTimeUpdate?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  // Decode waveform on mount
  useEffect(() => {
    let cancelled = false;
    decodeWaveform(audioUrl, WAVEFORM_BARS).then((w) => {
      if (!cancelled) setWaveform(w);
    });
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Time update loop
  const tick = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) {
      setProgress(el.currentTime);
      onTimeUpdateRef.current?.(el.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio(audioUrl);
      el.addEventListener("loadedmetadata", () => setDuration(el.duration));
      el.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
        onPlayingChangeRef.current?.(false);
        onTimeUpdateRef.current?.(0);
        cancelAnimationFrame(rafRef.current);
      });
      audioRef.current = el;
    }
    return audioRef.current;
  }, [audioUrl]);

  const stopThis = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setProgress(0);
    onPlayingChangeRef.current?.(false);
    onTimeUpdateRef.current?.(0);
    if (activePlayerStop === stopThisRef.current) activePlayerStop = null;
  }, []);
  const stopThisRef = useRef(stopThis);
  stopThisRef.current = stopThis;

  const startPlaying = useCallback(
    (el: HTMLAudioElement) => {
      // Stop any other playing instance first
      if (activePlayerStop && activePlayerStop !== stopThisRef.current)
        activePlayerStop();
      activePlayerStop = stopThisRef.current;
      el.play();
      setPlaying(true);
      onPlayingChangeRef.current?.(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const toggle = useCallback(() => {
    const el = ensureAudio();
    if (playing) {
      el.pause();
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      onPlayingChangeRef.current?.(false);
      if (activePlayerStop === stopThisRef.current) activePlayerStop = null;
    } else {
      startPlaying(el);
    }
  }, [playing, ensureAudio, startPlaying]);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ensureAudio();
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      el.currentTime = ratio * (el.duration || 0);
      setProgress(el.currentTime);
      if (!playing) {
        startPlaying(el);
      }
    },
    [ensureAudio, playing, startPlaying],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (activePlayerStop === stopThisRef.current) activePlayerStop = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const progressRatio = duration > 0 ? progress / duration : 0;

  return (
    <div className="flex items-center gap-2 mt-1.5 w-full">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-all cursor-pointer",
          playing
            ? "bg-pink-500 text-white hover:bg-pink-600 scale-110"
            : "bg-muted text-muted-foreground hover:bg-pink-100 hover:text-pink-600 hover:scale-110",
        )}
      >
        {playing ? (
          <Pause className="w-2.5 h-2.5" />
        ) : (
          <Play className="w-2.5 h-2.5 ml-0.5" />
        )}
      </button>

      {/* Waveform */}
      <div
        ref={waveContainerRef}
        onClick={seek}
        className="flex-1 flex items-center h-8 cursor-pointer"
      >
        {(waveform ?? (Array(WAVEFORM_BARS).fill(0.1) as number[])).map(
          (amp, i) => {
            const barRatio = (i + 0.5) / WAVEFORM_BARS;
            const isPast = barRatio <= progressRatio;
            const minH = 1;
            const maxH = 28;
            const h = Math.max(minH, amp * maxH);
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors",
                  isPast ? "bg-pink-400" : "bg-gray-300",
                )}
                style={{ height: `${h}px`, minWidth: "1px" }}
              />
            );
          },
        )}
      </div>

      {/* Time */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground w-8 text-right">
        {duration > 0 ? formatTime(playing ? progress : duration) : ""}
      </span>
    </div>
  );
}

/** Render the entry text with word-by-word highlighting synced to audio playback. */
function HighlightedText({
  text,
  timestamps,
  currentTime,
  isPlaying,
}: {
  text: string;
  timestamps?: WordTimestampEntry;
  currentTime: number;
  isPlaying: boolean;
}) {
  if (!timestamps || !isPlaying) {
    return <p className="text-sm leading-relaxed mt-0.5">{text}</p>;
  }
  return (
    <p className="text-sm leading-relaxed mt-0.5">
      {timestamps.words.map((w, i) => {
        const active = currentTime >= w.start && currentTime < w.end;
        const past = currentTime >= w.end;
        return (
          <span
            key={i}
            className={cn(
              "rounded-sm px-0.5 transition-all duration-100 inline",
              active
                ? "bg-pink-500 text-white"
                : past
                  ? "text-foreground"
                  : "text-muted-foreground/50",
            )}
          >
            {w.word}{" "}
          </span>
        );
      })}
    </p>
  );
}

/** Editable timecode field with visible up/down clicker arrows, increments by 0.1.
 * Clamps to [min, max]. Flashes red briefly when the user attempts to push past
 * a bound. */
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
        onChange={(e) => setDraft(e.target.value)}
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
function WordTimestampViewer({
  timestamps,
  onSave,
  isSaving,
  columns = 2,
}: {
  timestamps: WordTimestampEntry;
  onSave?: (words: WordTimestamp[], duration: number) => void;
  isSaving?: boolean;
  columns?: number;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const [editWords, setEditWords] = useState<WordTimestamp[] | null>(null);

  const words = editWords ?? timestamps.words;
  const dirty = editWords != null;

  const handleExpand = () => {
    setExpanded(!expanded);
    setEditWords(null);
  };

  const updateWord = (index: number, field: "start" | "end", value: number) => {
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
    setEditWords(updated);
  };

  const handleSave = () => {
    if (!editWords || !onSave) return;
    const maxEnd = editWords.reduce((max, w) => Math.max(max, w.end), 0);
    onSave(editWords, maxEnd);
    setEditWords(null);
  };

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
                onClick={() => setEditWords(null)}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-3 w-3" />
                {t`Discard`}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 text-[10px] font-medium text-pink-600 hover:text-pink-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                {isSaving ? (
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

/** Per-entry read-aloud mute toggle. Locked (non-interactive) when the mute
 * comes from a content-type switch or is inherited from the source entry. */
function TtsMuteToggle({
  muted,
  lockedReason,
  onToggle,
}: {
  muted: boolean;
  lockedReason?: string;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const title =
    lockedReason ??
    (muted ? t`Include in read-aloud` : t`Exclude from read-aloud`);
  return (
    <button
      type="button"
      onClick={lockedReason ? undefined : onToggle}
      disabled={!!lockedReason}
      title={title}
      aria-label={title}
      className={cn(
        "ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded align-middle transition-colors",
        muted
          ? "text-rose-600 hover:bg-rose-50"
          : "text-muted-foreground/40 hover:text-foreground hover:bg-muted",
        lockedReason ? "opacity-50 cursor-default" : "cursor-pointer",
      )}
    >
      {muted ? (
        <VolumeX className="w-3 h-3" />
      ) : (
        <Volume2 className="w-3 h-3" />
      )}
    </button>
  );
}

function AudioAction({
  audio,
  audioLang,
  bookLabel,
  textId,
  canGenerate,
  hasGeminiKey,
  onGenerate,
  isGenerating,
  onUpload,
  isUploading,
  errorMessage,
  timestamps,
  onTranscribe,
  isTranscribing,
  hasOpenaiKey,
  onTimeUpdate,
  onPlayingChange,
  onSaveTimestamps,
  isSavingTimestamps,
  timestampColumns = 2,
}: {
  audio?: { fileName: string; voice: string; cacheKey?: string };
  audioLang: string | null;
  bookLabel: string;
  textId: string;
  canGenerate: boolean;
  hasGeminiKey: boolean;
  onGenerate: (textId: string) => void;
  isGenerating: boolean;
  onUpload?: (textId: string, file: File) => void;
  isUploading?: boolean;
  errorMessage?: string;
  timestamps?: WordTimestampEntry;
  onTranscribe?: (textId: string) => void;
  isTranscribing?: boolean;
  hasOpenaiKey?: boolean;
  onTimeUpdate?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onSaveTimestamps?: (words: WordTimestamp[], duration: number) => void;
  isSavingTimestamps?: boolean;
  timestampColumns?: number;
}) {
  const { t } = useLingui();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !onUpload) return;
    onUpload(textId, file);
  };

  const uploadButton =
    onUpload && audioLang ? (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant={audio ? "ghost" : "outline"}
          size="sm"
          className="h-7 px-2 text-[10px]"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          title={
            audio ? t`Replace this audio file` : t`Upload your own audio file`
          }
        >
          {isUploading ? (
            <Loader2 className={cn("h-3 w-3 animate-spin", !audio && "mr-1")} />
          ) : (
            <Upload className={cn("h-3 w-3", !audio && "mr-1")} />
          )}
          {!audio && t`Upload`}
        </Button>
      </>
    ) : null;

  if (audio && audioLang) {
    return (
      <div>
        {uploadButton && (
          <div className="mb-1 flex justify-end">{uploadButton}</div>
        )}
        <WaveformPlayer
          key={`${audioLang}:${audio.fileName}:${audio.cacheKey ?? ""}`}
          audioUrl={getAudioUrl(
            bookLabel,
            audioLang,
            audio.fileName,
            audio.cacheKey,
          )}
          onTimeUpdate={onTimeUpdate}
          onPlayingChange={onPlayingChange}
        />
        {timestamps ? (
          <WordTimestampViewer
            timestamps={timestamps}
            onSave={
              onSaveTimestamps
                ? (words, duration) => onSaveTimestamps(words, duration)
                : undefined
            }
            isSaving={isSavingTimestamps}
            columns={timestampColumns}
          />
        ) : (
          onTranscribe && (
            <button
              type="button"
              onClick={() => onTranscribe(textId)}
              disabled={isTranscribing || !hasOpenaiKey}
              className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
              title={
                hasOpenaiKey
                  ? t`Generate word timestamps`
                  : t`OpenAI key required`
              }
            >
              {isTranscribing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Type className="h-3 w-3" />
              )}
              {t`Timestamps`}
            </button>
          )
        )}
        {errorMessage && (
          <p className="mt-1 max-w-52 text-[10px] leading-tight text-red-500 text-right ml-auto">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  if (!canGenerate && !uploadButton) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {canGenerate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px]"
            disabled={isGenerating || !hasGeminiKey}
            onClick={() => onGenerate(textId)}
            title={
              hasGeminiKey
                ? t`Generate missing Gemini audio`
                : t`Set a Gemini API key to generate audio`
            }
          >
            {isGenerating ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <WandSparkles className="mr-1 h-3 w-3" />
            )}
            {t`Generate`}
          </Button>
        )}
        {uploadButton}
      </div>
      {errorMessage && (
        <p className="max-w-44 text-[10px] leading-tight text-red-500 text-right">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
