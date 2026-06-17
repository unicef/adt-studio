import { type ReactNode, useState, useRef, useLayoutEffect, useCallback } from "react";
import {
  Loader2,
  BookOpen,
  AlertCircle,
  HelpCircle,
  Image,
  List,
  Hand,
  AudioLines,
  Check,
  Globe,
  FileText,
  Building2,
  ChevronDown,
  ChevronUp,
  Database,
  FolderArchive,
  type LucideIcon,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useBook } from "@/hooks/use-books";
import { usePages, usePageImage } from "@/hooks/use-pages";
import { useBookConfig } from "@/hooks/use-book-config";
import { getDisplayName, normalizeLocale } from "@/lib/languages";
import {
  useAvailableExportFeatures,
  useAllProjectFeatures,
  type ExportFeatureToggles,
} from "@/hooks/use-export-features";
import {
  buildExportFormatConfig,
  type ExportFormat,
} from "./export-formats";

function BookCover({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui();
  const { data: book } = useBook(bookLabel);
  const { data: pages } = usePages(bookLabel);
  const coverPageNumber = book?.metadata?.cover_page_number ?? 1;
  const coverPage = pages?.find((p) => p.pageNumber === coverPageNumber);
  const { data: coverImage } = usePageImage(
    bookLabel,
    coverPage?.pageId ?? "",
  );

  const { data: configData } = useBookConfig(bookLabel);
  const config = configData?.config as Record<string, unknown> | undefined;
  const outputLanguages = Array.from(
    new Set(
      ((config?.output_languages as string[] | undefined) ?? []).map((code) =>
        normalizeLocale(code),
      ),
    ),
  );

  const title = book?.metadata?.title ?? book?.title ?? bookLabel;
  const authors = book?.metadata?.authors?.join(", ");
  const publisher = book?.metadata?.publisher;
  const bookLanguage = book?.languageCode ?? book?.metadata?.language_code;
  const pageCount = pages?.length;

  return (
    <div className="flex flex-col justify-center gap-2 overflow-hidden border-r border-slate-200 bg-slate-50/50">
      <div className="flex items-center justify-center p-5 pb-0 min-h-0">
        {coverImage ? (
          <img
            src={`data:image/png;base64,${coverImage.imageBase64}`}
            alt={t`Cover of ${title}`}
            className="max-w-full max-h-full object-contain shadow-md rounded-sm border border-slate-200"
          />
        ) : (
          <div className="w-full aspect-[3/4] max-w-[180px] rounded-sm border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center gap-3 shadow-md">
            <BookOpen className="w-10 h-10 text-slate-300" />
            <p className="text-[11px] text-slate-400 font-medium px-4 text-center leading-tight">
              <Trans>No cover available</Trans>
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pb-1 space-y-1.5">
        <p className="font-semibold text-lg leading-snug line-clamp-2 text-slate-900">
          {title}
        </p>
        {authors && (
          <p className="text-slate-600 text-xs leading-tight line-clamp-1">
            {authors}
          </p>
        )}
      </div>

      <div className="px-5 pb-5 space-y-2.5 text-xs text-slate-500">
        {publisher && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{publisher}</span>
          </div>
        )}
        {pageCount != null && (
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              <Trans>{pageCount} pages</Trans>
            </span>
          </div>
        )}
        {(bookLanguage || outputLanguages.length > 0) && (
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {bookLanguage && (
                <span className="inline-flex items-center rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-300/50">
                  {getDisplayName(bookLanguage)}
                </span>
              )}
              {outputLanguages.length > 0 && (
                <LanguageSummary languages={outputLanguages} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LanguageSummary({ languages }: { languages: string[] }) {
  const count = languages.length;

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-200/60 transition-all duration-150 hover:bg-teal-100/80 hover:ring-teal-300/60 cursor-pointer"
        >
          <span>
            +<Trans>{count} translations</Trans>
          </span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-52 p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <Trans>Output languages</Trans>
          </p>
        </div>
        <div className="max-h-52 overflow-y-auto scrollbar-thin py-1">
          {languages.map((lang) => (
            <div
              key={lang}
              className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
            >
              <span className="w-1 h-1 rounded-full bg-teal-400 flex-shrink-0" />
              {getDisplayName(lang)}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FeatureToggleRow({
  icon: Icon,
  label,
  description,
  textColor,
  bgLight,
  borderColor,
  checked,
  onCheckedChange,
  disabled,
  badge,
}: {
  icon: LucideIcon;
  label: ReactNode;
  description: ReactNode;
  textColor: string;
  bgLight: string;
  borderColor: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50/80 transition-all duration-150 cursor-pointer">
      <div
        className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${bgLight} ${borderColor} border`}
      >
        <Icon className={`w-4 h-4 ${textColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{label}</span>
          {badge}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-tight">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="flex-shrink-0"
      />
    </label>
  );
}

function ProjectIncludedItem({
  icon: Icon,
  label,
  textColor,
  bgLight,
  borderColor,
  done,
}: {
  icon: LucideIcon;
  label: ReactNode;
  textColor: string;
  bgLight: string;
  borderColor: string;
  done: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        done
          ? `${bgLight} ${borderColor}`
          : "bg-slate-50/50 border-slate-200/80"
      }`}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${done ? textColor : "text-slate-300"}`}
      />
      <span
        className={`text-sm font-medium flex-1 ${done ? "text-slate-700" : "text-slate-400"}`}
      >
        {label}
      </span>
      {done ? (
        <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
      ) : (
        <span className="text-[10px] text-slate-400">
          <Trans>Not generated</Trans>
        </span>
      )}
    </div>
  );
}

interface AccessibilityItem {
  icon: LucideIcon;
  label: ReactNode;
  wcagCode: string;
  wcagUrl: string;
  reason: ReactNode;
  done: boolean;
  iconBg: string;
  iconText: string;
}

function AccessibilityChecklist({ items }: { items: AccessibilityItem[] }) {
  const doneCount = items.filter((i) => i.done).length;
  const totalCount = items.length;

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <Trans>Accessibility</Trans>
          </h4>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-slate-500 bg-slate-100 border-slate-200">
          {doneCount}/{totalCount}
        </span>
      </div>
      <p className="px-4 pt-3 pb-2 text-xs text-slate-500 leading-relaxed">
        <Trans>
          These features improve access for people with disabilities. Running
          them before exporting helps your book meet ADT accessibility standards.
        </Trans>
      </p>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.wcagCode} className="px-4 py-3 flex items-start gap-3">
              <div
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${item.iconBg}`}
              >
                {item.done ? (
                  <Check className={`w-3 h-3 ${item.iconText}`} />
                ) : (
                  <Icon className={`w-3 h-3 ${item.iconText}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${item.done ? "text-slate-900" : "text-slate-700"}`}
                  >
                    {item.label}
                  </span>
                  <a
                    href={item.wcagUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono font-medium text-slate-400 hover:text-slate-600 hover:underline transition-colors"
                  >
                    {item.wcagCode}
                  </a>
                </div>
                <p className="text-xs mt-0.5 leading-relaxed text-slate-500">
                  {item.reason}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Collapsible, FLIP-animated language reorder list.
 *
 * Collapsed (default): compact summary showing count + default language.
 * Expanded: full reorder list with up/down arrows and toggle switches.
 * Uses FLIP animation so items slide smoothly on reorder.
 * Max-height with scroll prevents the list from dominating the dialog.
 */
function LanguageOrderSection({
  configLanguages,
  orderedLanguages,
  includedSet,
  isPreparing,
  onMove,
  onToggle,
}: {
  configLanguages: string[];
  orderedLanguages: string[];
  includedSet: Set<string>;
  isPreparing: boolean;
  onMove: (lang: string, dir: "up" | "down") => void;
  onToggle: (lang: string, included: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());

  const capturePositions = useCallback(() => {
    if (!containerRef.current) return;
    const map = new Map<string, DOMRect>();
    for (const el of containerRef.current.querySelectorAll<HTMLElement>(
      "[data-lang-key]",
    )) {
      map.set(el.dataset.langKey!, el.getBoundingClientRect());
    }
    positionsRef.current = map;
  }, []);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const prev = positionsRef.current;
    if (prev.size === 0) return;

    for (const el of containerRef.current.querySelectorAll<HTMLElement>(
      "[data-lang-key]",
    )) {
      const key = el.dataset.langKey!;
      const oldRect = prev.get(key);
      if (!oldRect) continue;
      const newRect = el.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      el.offsetHeight;
      el.style.transition = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
    }
    positionsRef.current = new Map();
  });

  const handleMove = (lang: string, dir: "up" | "down") => {
    capturePositions();
    onMove(lang, dir);
  };

  const handleToggle = (lang: string, included: boolean) => {
    capturePositions();
    onToggle(lang, included);
  };

  const includedCount = orderedLanguages.length;
  const totalCount = configLanguages.length;
  const isCustomized = includedCount !== totalCount || orderedLanguages.some((l, i) => l !== configLanguages[i]);
  const excludedLanguages = configLanguages.filter((l) => !includedSet.has(l));

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 bg-slate-50 flex items-center gap-3 hover:bg-slate-100/80 transition-colors"
      >
        <Globe className="w-4 h-4 text-teal-600 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2 text-left">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <Trans>Languages</Trans>
          </h4>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-slate-500 bg-slate-100 border-slate-200">
            {includedCount}/{totalCount}
          </span>
          {isCustomized && (
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pt-2 pb-1">
            <p className="text-[10px] text-slate-400">
              <Trans>First language is the default</Trans>
            </p>
          </div>
          <div
            ref={containerRef}
            className="px-3 pb-3 space-y-1 max-h-52 overflow-y-auto scrollbar-thin"
          >
            {orderedLanguages.map((lang, idx) => (
              <div
                key={lang}
                data-lang-key={lang}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white"
              >
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-teal-50 border-teal-200 border">
                  <Globe className="w-3 h-3 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {getDisplayName(lang)}
                  </span>
                  {idx === 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full leading-none">
                      <Trans>Default</Trans>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMove(lang, "up")}
                    disabled={isPreparing || idx === 0}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(lang, "down")}
                    disabled={
                      isPreparing || idx === orderedLanguages.length - 1
                    }
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
                <Switch
                  checked={true}
                  onCheckedChange={() => handleToggle(lang, false)}
                  disabled={isPreparing || orderedLanguages.length <= 1}
                  className="flex-shrink-0"
                />
              </div>
            ))}
            {excludedLanguages.map((lang) => (
              <div
                key={lang}
                data-lang-key={lang}
                className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50"
              >
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-slate-100 border-slate-200 border">
                  <Globe className="w-3 h-3 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-400">
                    {getDisplayName(lang)}
                  </span>
                </div>
                <Switch
                  checked={false}
                  onCheckedChange={() => handleToggle(lang, true)}
                  disabled={isPreparing}
                  className="flex-shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFormat: ExportFormat | null;
  bookLabel: string;
  featureToggles: ExportFeatureToggles;
  onFeatureToggleChange: (
    feature: keyof ExportFeatureToggles,
    value: boolean,
  ) => void;
  languageOrder: string[] | null;
  onLanguageOrderChange: (langs: string[] | null) => void;
  onConfirmExport: () => void;
  isPreparing: boolean;
  preparingFormat: string | null;
  error: { format: string; message: string } | null;
}

export function ExportDialog({
  open,
  onOpenChange,
  selectedFormat,
  bookLabel,
  featureToggles,
  onFeatureToggleChange,
  languageOrder,
  onLanguageOrderChange,
  onConfirmExport,
  isPreparing,
  preparingFormat,
  error,
}: ExportDialogProps) {
  const { t } = useLingui();
  const availableFeatures = useAvailableExportFeatures(bookLabel);
  const allFeatures = useAllProjectFeatures(bookLabel);
  const formatConfigByType = buildExportFormatConfig(t);

  const { data: configData } = useBookConfig(bookLabel);
  const { data: book } = useBook(bookLabel);
  const config = configData?.config as Record<string, unknown> | undefined;
  const baseLanguage = normalizeLocale(
    (config?.editing_language as string | undefined) ??
      book?.languageCode ??
      book?.metadata?.language_code ??
      "en",
  );
  const configLanguages = Array.from(
    new Set(
      [
        baseLanguage,
        ...((config?.output_languages as string[] | undefined) ?? []).map(
          (code) => normalizeLocale(code),
        ),
      ],
    ),
  );

  const orderedLanguages = languageOrder ?? configLanguages;
  const includedSet = new Set(orderedLanguages);

  const toggleLanguage = (lang: string, included: boolean) => {
    if (included) {
      onLanguageOrderChange([...orderedLanguages, lang]);
    } else {
      onLanguageOrderChange(orderedLanguages.filter((l) => l !== lang));
    }
  };

  const moveLanguage = (lang: string, direction: "up" | "down") => {
    const list = [...orderedLanguages];
    const idx = list.indexOf(lang);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
    onLanguageOrderChange(list);
  };

  const formatError =
    selectedFormat && error?.format === selectedFormat ? error.message : null;
  const formatConfig = selectedFormat
    ? formatConfigByType[selectedFormat]
    : null;
  const FormatIcon = formatConfig?.icon;

  const accessibilityItems: AccessibilityItem[] = [
    {
      icon: Image,
      label: <Trans>Image Captions</Trans>,
      wcagCode: "WCAG 1.1.1",
      wcagUrl: "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content",
      reason: (
        <Trans>
          Screen readers cannot interpret images without text alternatives.
          Adding captions ensures blind and low-vision readers understand every
          illustration.
        </Trans>
      ),
      done: allFeatures.present.captions,
      iconBg: "bg-teal-50",
      iconText: "text-teal-600",
    },
    {
      icon: List,
      label: <Trans>Table of Contents</Trans>,
      wcagCode: "WCAG 2.4.5",
      wcagUrl: "https://www.w3.org/WAI/WCAG21/Understanding/multiple-ways",
      reason: (
        <Trans>
          A structured table of contents lets readers jump directly to any
          section, which is especially important for keyboard and assistive
          technology users.
        </Trans>
      ),
      done: allFeatures.present.toc,
      iconBg: "bg-amber-50",
      iconText: "text-amber-600",
    },
    {
      icon: FileText,
      label: <Trans>Easy Read</Trans>,
      wcagCode: "WCAG 3.1.5",
      wcagUrl: "https://www.w3.org/WAI/WCAG21/Understanding/reading-level",
      reason: (
        <Trans>
          A simplified Easy Read version makes the text accessible to readers
          with cognitive disabilities, learning differences, or limited reading
          proficiency.
        </Trans>
      ),
      done: allFeatures.present.easyRead,
      iconBg: "bg-cyan-50",
      iconText: "text-cyan-600",
    },
    {
      icon: Hand,
      label: <Trans>Sign Language</Trans>,
      wcagCode: "WCAG 1.2.6",
      wcagUrl:
        "https://www.w3.org/WAI/WCAG21/Understanding/sign-language-prerecorded",
      reason: (
        <Trans>
          Sign language videos provide access for deaf and hard of hearing
          readers who may not be fluent in written language.
        </Trans>
      ),
      done: allFeatures.toggleable.signLanguage,
      iconBg: "bg-cyan-50",
      iconText: "text-cyan-600",
    },
  ];

  const generatedFeatureCount = [
    allFeatures.toggleable.glossary,
    allFeatures.toggleable.readAloud,
    allFeatures.toggleable.quizzes,
    allFeatures.toggleable.signLanguage,
    allFeatures.present.captions,
    allFeatures.present.toc,
    allFeatures.present.easyRead,
  ].filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-6xl overflow-hidden sm:rounded-xl">
        <DialogTitle className="sr-only">
          <Trans>Export Options</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Configure features to include in the export</Trans>
        </DialogDescription>

        <div className="grid grid-cols-[1fr_2fr] max-h-[85vh] overflow-hidden">
          {selectedFormat && (
            <BookCover
              bookLabel={bookLabel}
            />
          )}

          <div className="flex flex-col min-h-0 bg-white">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                {FormatIcon && formatConfig && (
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${formatConfig.bgLight} border ${formatConfig.borderColor}`}
                  >
                    <FormatIcon
                      className={`w-4 h-4 ${formatConfig.textColor}`}
                    />
                  </div>
                )}
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {formatConfig?.label ?? <Trans>Export Options</Trans>}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedFormat === "project" ? (
                      <Trans>Download a full backup of this project</Trans>
                    ) : (
                      <Trans>Choose features to include in this export</Trans>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {selectedFormat === "project" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-slate-400" />
                        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <Trans>Archive contents</Trans>
                        </h4>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <Trans>
                          Creates a ZIP archive of the full project — database,
                          source PDF, and all pipeline outputs. Use it to back up
                          or transfer the project to another machine.
                        </Trans>
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <FolderArchive className="w-3.5 h-3.5 text-slate-400" />
                        <Trans>
                          {generatedFeatureCount} of 6 features generated
                        </Trans>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <Trans>Pipeline features</Trans>
                    </h4>
                    <div className="space-y-1.5">
                      <ProjectIncludedItem
                        icon={BookOpen}
                        label={<Trans>Glossary</Trans>}
                        textColor="text-lime-600"
                        bgLight="bg-lime-50"
                        borderColor="border-lime-200"
                        done={allFeatures.toggleable.glossary}
                      />
                      <ProjectIncludedItem
                        icon={AudioLines}
                        label={<Trans>Speech</Trans>}
                        textColor="text-rose-600"
                        bgLight="bg-rose-50"
                        borderColor="border-rose-200"
                        done={allFeatures.toggleable.readAloud}
                      />
                      <ProjectIncludedItem
                        icon={HelpCircle}
                        label={<Trans>Quizzes</Trans>}
                        textColor="text-orange-600"
                        bgLight="bg-orange-50"
                        borderColor="border-orange-200"
                        done={allFeatures.toggleable.quizzes}
                      />
                      <ProjectIncludedItem
                        icon={Hand}
                        label={<Trans>Sign Language</Trans>}
                        textColor="text-cyan-600"
                        bgLight="bg-cyan-50"
                        borderColor="border-cyan-200"
                        done={allFeatures.toggleable.signLanguage}
                      />
                      <ProjectIncludedItem
                        icon={Image}
                        label={<Trans>Image Captions</Trans>}
                        textColor="text-teal-600"
                        bgLight="bg-teal-50"
                        borderColor="border-teal-200"
                        done={allFeatures.present.captions}
                      />
                      <ProjectIncludedItem
                        icon={List}
                        label={<Trans>Table of Contents</Trans>}
                        textColor="text-amber-600"
                        bgLight="bg-amber-50"
                        borderColor="border-amber-200"
                        done={allFeatures.present.toc}
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedFormat !== "project" &&
                (availableFeatures.glossary ||
                  availableFeatures.readAloud ||
                  availableFeatures.quizzes ||
                  availableFeatures.signLanguage) && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <Trans>Optional Features</Trans>
                    </h4>
                    <div className="space-y-1">
                      {availableFeatures.glossary && (
                        <FeatureToggleRow
                          icon={BookOpen}
                          label={<Trans>Glossary</Trans>}
                          description={
                            <Trans>Lookup definitions for key terms</Trans>
                          }
                          textColor="text-lime-600"
                          bgLight="bg-lime-50"
                          borderColor="border-lime-200"
                          checked={featureToggles.glossary}
                          onCheckedChange={(v) =>
                            onFeatureToggleChange("glossary", v)
                          }
                          disabled={isPreparing}
                        />
                      )}
                      {availableFeatures.readAloud && (
                        <FeatureToggleRow
                          icon={AudioLines}
                          label={<Trans>Speech</Trans>}
                          description={
                            <Trans>
                              Audio narration (largest impact on file size)
                            </Trans>
                          }
                          textColor="text-rose-600"
                          bgLight="bg-rose-50"
                          borderColor="border-rose-200"
                          checked={featureToggles.readAloud}
                          onCheckedChange={(v) =>
                            onFeatureToggleChange("readAloud", v)
                          }
                          disabled={isPreparing}
                          badge={
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                              <Trans>Large</Trans>
                            </span>
                          }
                        />
                      )}
                      {availableFeatures.quizzes && (
                        <FeatureToggleRow
                          icon={HelpCircle}
                          label={<Trans>Quizzes</Trans>}
                          description={
                            <Trans>Interactive assessment questions</Trans>
                          }
                          textColor="text-orange-600"
                          bgLight="bg-orange-50"
                          borderColor="border-orange-200"
                          checked={featureToggles.quizzes}
                          onCheckedChange={(v) =>
                            onFeatureToggleChange("quizzes", v)
                          }
                          disabled={isPreparing}
                        />
                      )}
                      {availableFeatures.signLanguage && (
                        <FeatureToggleRow
                          icon={Hand}
                          label={<Trans>Sign Language</Trans>}
                          description={
                            <Trans>
                              Sign language video overlays for each page
                            </Trans>
                          }
                          textColor="text-cyan-600"
                          bgLight="bg-cyan-50"
                          borderColor="border-cyan-200"
                          checked={featureToggles.signLanguage}
                          onCheckedChange={(v) =>
                            onFeatureToggleChange("signLanguage", v)
                          }
                          disabled={isPreparing}
                          badge={
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                              <Trans>Large</Trans>
                            </span>
                          }
                        />
                      )}
                    </div>
                  </div>
                )}

              {selectedFormat !== "project" && configLanguages.length > 1 && (
                <LanguageOrderSection
                  configLanguages={configLanguages}
                  orderedLanguages={orderedLanguages}
                  includedSet={includedSet}
                  isPreparing={isPreparing}
                  onMove={moveLanguage}
                  onToggle={toggleLanguage}
                />
              )}

              {selectedFormat !== "project" && (
                <AccessibilityChecklist items={accessibilityItems} />
              )}

              {formatError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs leading-tight">{formatError}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPreparing}
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button
                size="sm"
                className={formatConfig?.buttonClass ?? ""}
                onClick={onConfirmExport}
                disabled={isPreparing}
              >
                {isPreparing && preparingFormat === selectedFormat ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  FormatIcon && <FormatIcon className="mr-1.5 h-3.5 w-3.5" />
                )}
                {formatError ? (
                  <Trans>Retry Export</Trans>
                ) : (
                  <Trans>Export</Trans>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
