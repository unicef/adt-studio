import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { ToggleRow } from "@/features/settings/components/ToggleRow";
import { TermDetails } from "@/features/glossary/components/TermDetails";
import { SignLanguageVideo } from "@/features/glossary/components/SignLanguageVideo";
import {
  glossaryDataAtom,
  glossaryFilterAtom,
} from "@/features/glossary/state/glossary.atoms";
import {
  activeGlossaryTabAtom,
  dockMenuValueAtom,
  glossaryModeAtom,
  selectedGlossaryTermAtom,
} from "@/shared/state/ui.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { trackToggleEvent } from "@/shared/lib/analytics";
import { DockContent } from "@/features/dock/components/DockLayout";
import { GlossaryEntry } from "@/features/glossary/state/glossary.atoms";

export function GlossaryPanel() {
  const { t } = useTranslation();
  const data = useAtomValue(glossaryDataAtom);
  const [glossaryMode, setGlossaryMode] = useAtom(glossaryModeAtom);
  const [tab, setTab] = useAtom(activeGlossaryTabAtom);
  const filter = useAtomValue(glossaryFilterAtom);
  const [selected, setSelected] = useAtom(selectedGlossaryTermAtom);

  const allTerms = useMemo(
    () => Object.values(data).sort((a, b) => a.word.localeCompare(b.word)),
    [data],
  );

  const pageTerms = useMemo(() => {
    if (typeof document === "undefined") return [] as typeof allTerms;
    const content = document.getElementById("content");
    if (!content) return [];
    const haystack = (content.textContent ?? "").toLowerCase();
    if (!haystack.trim()) return [];
    return allTerms.filter((entry) => {
      const candidates = [entry.word, ...(entry.variations ?? [])];
      return candidates.some((c) => haystack.includes(c.toLowerCase()));
    });
  }, [allTerms]);

  const filteredBookTerms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allTerms;
    return allTerms.filter(
      (entry) =>
        entry.word.toLowerCase().includes(q) ||
        entry.definition.toLowerCase().includes(q) ||
        entry.variations?.some((v) => v.toLowerCase().includes(q)),
    );
  }, [allTerms, filter]);

  if (selected) return <TermDetails />;

  return (
    <DockContent>
      <DockContent.Header>
        <DockContent.Title className="text-lg font-semibold">
          {t("glossary-label") || "Glossary"}
        </DockContent.Title>
        <ToggleRow
          label={t("glossary-highlight-words") || "Highlight words"}
          checked={glossaryMode}
          onChange={(v) => {
            trackToggleEvent("GlossaryHighlight", v);
            setGlossaryMode(v);
          }}
          className="py-0"
        />
      </DockContent.Header>

      <DockContent.Search className="text-lg font-semibold" />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (typeof v === "string") setTab(v as "page" | "book");
        }}
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList className="w-full grid grid-cols-2 shrink-0">
          <TabsTrigger value="page">
            {t("glossary-page-label") || "On this page"}
          </TabsTrigger>
          <TabsTrigger value="book">
            {t("glossary-book-label") || "Book glossary"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="page" className="min-h-0">
          <ScrollArea className="h-full">
            <ListItems
              entries={pageTerms}
              filter={filter}
              onSelect={setSelected}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="book" className="min-h-0">
          <ScrollArea className="h-full">
            <ListItems
              entries={filteredBookTerms}
              filter={filter}
              onSelect={setSelected}
            />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </DockContent>
  );
}

function ListItems({
  entries,
  filter,
  onSelect,
}: {
  entries: GlossaryEntry[];
  filter: string;
  onSelect: (word: string) => void;
}) {
  const { t } = useTranslation();
  // Word whose sign-language video is currently expanded (one at a time).
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground text-center">
        {filter.trim().length > 0
          ? t("glossary-no-terms-filter") ||
            "No glossary terms found. Clear filter to view all terms."
          : t("glossary-no-terms") || "No glossary terms found."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {entries.map((entry) => {
        const playing = playingWord === entry.word;
        return (
          <li key={entry.word} className="border-b border-border">
            <div className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => onSelect(entry.word)}
                className="flex-1 min-w-0 flex flex-col items-start gap-1.5 text-left rounded-md hover:bg-accent transition-colors focus:outline-none focus:bg-accent"
              >
                <span className="flex items-center gap-2">
                  {entry.emoji && (
                    <span className="text-2xl shrink-0" aria-hidden>
                      {entry.emoji}
                    </span>
                  )}
                  <span className="text-base font-medium capitalize">
                    {entry.word}
                  </span>
                </span>
                <span className="text-base font-medium">
                  {entry.definition}
                </span>
              </button>
              {entry.image && (
                <img
                  src={entry.image}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-lg bg-muted object-contain p-1"
                />
              )}
            </div>
            {entry.video && (
              <div className="px-4 pb-3">
                <button
                  type="button"
                  aria-expanded={playing}
                  onClick={() => setPlayingWord(playing ? null : entry.word)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* FontAwesome ships with every book bundle (page <head>
                      links all.min.css), so the classic signing-hands glyph
                      is available here. */}
                  <i className="fa fa-sign-language text-sm leading-none" aria-hidden="true" />
                  {t("sign-language-label") || "Sign language"}
                </button>
                {playing && (
                  <SignLanguageVideo
                    src={entry.video}
                    className="mt-2 w-full max-w-xs rounded-lg bg-black"
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
