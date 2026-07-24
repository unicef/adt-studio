import { useAtomValue, useSetAtom } from "jotai";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
  type PageEntry,
} from "@/features/navigation/state/nav.atoms";
import { dockMenuValueAtom } from "@/shared/state/ui.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { DockIconButton } from "@/features/dock/components/DockIconButton";

/**
 * Section IDs encode their page range, e.g.:
 *   pg001_sec001    → page 1
 *   pg004005_sec001 → pages 4-5
 *   pg010_sec001    → page 10
 * 6-digit prefix = start (first 3) + end (last 3); 3-digit prefix = single page.
 * Returns `[start, end]` or `null` if the id doesn't match the convention.
 */
function pageRangeFromSectionId(id: string): [number, number] | null {
  const match = id.match(/^pg(\d+)/);
  if (!match) return null;
  const digits = match[1];
  if (digits.length === 6) {
    const start = Number.parseInt(digits.slice(0, 3), 10);
    const end = Number.parseInt(digits.slice(3, 6), 10);
    if (Number.isFinite(start) && Number.isFinite(end)) return [start, end];
  }
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? [n, n] : null;
}

function pageRangeForEntry(entry: PageEntry): [number, number] | null {
  const fromId = pageRangeFromSectionId(entry.section_id);
  if (fromId) return fromId;
  if (typeof entry.page_number === "number") {
    return [entry.page_number, entry.page_number];
  }
  return null;
}

/**
 * Prev / "N / total" / next page navigation block in the dock. Each click
 * is a real `window.location.href` change because every page is its own
 * HTML document.
 */
export function PageNav() {
  const pages = useAtomValue(pagesAtom);
  const currentSectionId = useAtomValue(currentSectionIdAtom);
  const currentPageFromMeta = useAtomValue(currentPageNumberAtom);
  const dockMenuValue = useAtomValue(dockMenuValueAtom);
  const setDockMenuValue = useSetAtom(dockMenuValueAtom);
  const { t } = useTranslation();

  const idx = pages.findIndex((p) => p.section_id === currentSectionId);
  const prev = idx > 0 ? pages[idx - 1] : undefined;
  const next = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : undefined;

  const currentEntry = idx >= 0 ? pages[idx] : undefined;
  const currentRange = currentEntry ? pageRangeForEntry(currentEntry) : null;
  const pageNumber = currentPageFromMeta ?? currentRange?.[0] ?? null;

  const totalPages = pages.length

  const go = (href: string | undefined) => {
    if (!href) return;
    // Turning the page dismisses the read-aloud panel. `dockMenuValue` is
    // persisted, so clearing it keeps the panel closed on the next document
    // rather than re-opening. Playback resumes independently via the
    // persisted `isPlaying` flag, so audio keeps reading the new page.
    if (dockMenuValue === "audio") setDockMenuValue("");
    window.location.href = href;
  };

  return (
    <div className="flex items-center gap-0.5 px-1">
      <DockIconButton
        ariaLabel={t("next-page") || "Next page"}
        disabled={!next}
        onClick={() => go(next?.href)}
        className="order-4"
      >
        <ChevronRight />
      </DockIconButton>

      <div className="order-3 min-w-12 flex text-base tabular-nums px-2 text-foreground/80 select-none">
        <span className="font-medium text-foreground">{pageNumber ?? ""}</span>
        <span className="text-muted-foreground"> /</span>
        {totalPages > 0 && (
          <span className="text-muted-foreground">{totalPages}</span>
        )}
      </div>
      <DockIconButton
        ariaLabel={t("previous-page") || "Previous page"}
        disabled={!prev}
        onClick={() => go(prev?.href)}
        className="order-2"
      >
        <ChevronLeft />
      </DockIconButton>
    </div>
  );
}
