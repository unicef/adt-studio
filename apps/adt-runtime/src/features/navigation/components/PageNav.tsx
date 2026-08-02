import { useAtomValue, useSetAtom } from "jotai";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
} from "@/features/navigation/state/nav.atoms";
import { dockMenuValueAtom } from "@/shared/state/ui.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { DockIconButton } from "@/features/dock/components/DockIconButton";
import {
  getAdjacentPages,
  navigateToHref,
  pageRangeForEntry,
} from "@/features/navigation/lib/page-navigation";

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

  const { current: currentEntry, prev, next } = getAdjacentPages(
    pages,
    currentSectionId,
  );

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
    navigateToHref(href);
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
