import { useAtom, useAtomValue } from "jotai";
import { Fragment, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  currentSectionIdAtom,
  pagesAtom,
  tocAtom,
  type PageEntry,
  type TocEntry,
} from "@/features/navigation/state/nav.atoms";
import { activeNavTabAtom } from "@/shared/state/ui.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { cn } from "@/shared/lib/utils";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { DockContent } from "@/features/dock/components/DockLayout";

export function TocContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const toc = useAtomValue(tocAtom);
  const pages = useAtomValue(pagesAtom);
  const currentSectionId = useAtomValue(currentSectionIdAtom);
  const [tab, setTab] = useAtom(activeNavTabAtom);
  const { t } = useTranslation();

  const tocEntries: TocEntry[] = useMemo(
    () =>
      toc.length > 0
        ? toc
        : pages.map((p) => ({
            section_id: p.section_id,
            href: p.href,
            title: p.section_id,
            chapter_id: p.section_id,
            level: undefined,
          })),
    [toc, pages],
  );

  const filteredTocEntries = useMemo(
    () =>
      tocEntries.filter((entry) =>
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [tocEntries, searchTerm],
  );

  return (
    <DockContent className="gap-3">
      <DockContent.Title>{t("toc-title") || "Contents"}</DockContent.Title>
      <DockContent.Search className="w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (typeof v === "string") setTab(v);
        }}
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList className="w-full grid grid-cols-2 shrink-0">
          <TabsTrigger value="toc">{t("toc-title") || "Contents"}</TabsTrigger>
          <TabsTrigger value="pages">
            {t("nav-page-tab-label") || "Page list"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="toc" className="min-h-0">
          <ScrollArea className="h-full">
            <TocList entries={filteredTocEntries} currentSectionId={currentSectionId} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="pages" className="min-h-0">
          <ScrollArea className="h-full">
            <PageList
              pages={pages}
              toc={toc}
              currentSectionId={currentSectionId}
              printPageLabel={t("print-page-label") || "Print Page"}
              coverLabel={t("cover-label") || "Cover"}
            />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </DockContent>
  );
}

function TocList({
  entries,
  currentSectionId,
}: {
  entries: TocEntry[];
  currentSectionId: string | null;
}) {
  return (
    <ul className="py-1">
      {entries.map((entry) => {
        const active = entry.section_id === currentSectionId;
        return (
          <li key={entry.section_id}>
            <button
              type="button"
              title={entry.title}
              onClick={() => {
                window.location.href = entry.href;
              }}
              className={cn(
                "w-full text-left rounded-md px-2.5 py-1.5 text-base",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active && "bg-accent text-accent-foreground font-medium",
                entry.level === 2 && "pl-6",
                entry.level === 3 && "pl-9",
                entry.level === 4 && "pl-12",
                entry.level === 5 && "pl-14",
                entry.level === 6 && "pl-16",
              )}
              aria-current={active ? "page" : undefined}
            >
              {entry.title}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface PageListItem {
  page: PageEntry;
  displayLabel: string;
  pdfPageLabel: string | null;
  chapterHeading: TocEntry | null;
}

function PageList({
  pages,
  toc,
  currentSectionId,
  printPageLabel,
  coverLabel,
}: {
  pages: PageEntry[];
  toc: TocEntry[];
  currentSectionId: string | null;
  printPageLabel: string;
  coverLabel: string;
}) {
  const items = useMemo<PageListItem[]>(() => {
    const chapterLookup = new Map<string, TocEntry>();
    for (const chapter of toc) {
      if (chapter.section_id) chapterLookup.set(chapter.section_id, chapter);
    }
    const seen = new Set<string>();
    return pages.map((page, index) => {
      const sequential = index + 1;
      const displayLabel =
        sequential === 1 ? `${sequential} (${coverLabel})` : String(sequential);
      const pdfPageLabel =
        page.page_number !== undefined && page.page_number !== null
          ? String(page.page_number)
          : null;

      let chapterHeading: TocEntry | null = null;
      const chapter = chapterLookup.get(page.section_id);
      if (chapter && !seen.has(chapter.section_id)) {
        chapterHeading = chapter;
        seen.add(chapter.section_id);
      }

      return { page, displayLabel, pdfPageLabel, chapterHeading };
    });
  }, [pages, toc, coverLabel]);

  if (pages.length === 0) return null;

  return (
    <ol className="py-1">
      {items.map(({ page, displayLabel, pdfPageLabel, chapterHeading }) => {
        const active = page.section_id === currentSectionId;
        const ariaLabel = pdfPageLabel
          ? `Page ${displayLabel}, ${printPageLabel} ${pdfPageLabel}`
          : `Page ${displayLabel}`;
        return (
          <Fragment key={page.section_id}>
            {chapterHeading ? (
              <li
                className="px-1 pt-3 pb-1 text-base font-semibold tracking-wide text-muted-foreground uppercase"
                data-chapter-id={chapterHeading.chapter_id || undefined}
              >
                {chapterHeading.title}
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={() => {
                  window.location.href = page.href;
                }}
                aria-label={ariaLabel}
                title={ariaLabel}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-base text-left",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  active && "bg-accent text-accent-foreground font-medium",
                )}
              >
                <span className="truncate">{displayLabel}</span>
                {pdfPageLabel ? (
                  <span className="text-base text-muted-foreground whitespace-nowrap">
                    {printPageLabel} {pdfPageLabel}
                  </span>
                ) : null}
              </button>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
