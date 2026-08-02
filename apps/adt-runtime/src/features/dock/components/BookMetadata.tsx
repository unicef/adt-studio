import { useAtom, useAtomValue } from "jotai";
import { useMemo, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useDockContext } from "@/features/dock/context/dock-context";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-is-mobile";
import {
  dockMenuValueAtom,
  type DockMenuValue,
} from "@/shared/state/ui.atoms"
import { DockPanel } from "@/features/dock/components/DockPanel";
import { TocContent } from "@/features/toc/components/TocDockContent";
import {
  currentSectionIdAtom,
  tocAtom,
} from "@/features/navigation/state/nav.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import {
  List,
} from "lucide-react";
interface BookMetadata {
  ariaLabel: string;
  tooltip?: string;
  className?: string;
}
export function BookMetadata({
  ariaLabel,
  tooltip,
  className,
}: BookMetadata) {
  const [value, setValue] = useAtom(dockMenuValueAtom)
  const toggle = (next: DockMenuValue) =>
    setValue((prev) => (prev === next ? "" : next))

  const { t } = useTranslation();
  const toc = useAtomValue(tocAtom);
  const currentSectionId = useAtomValue(currentSectionIdAtom);
  const { popoverSide } = useDockContext();
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeTitle = useMemo(() => {
    const entry = toc.find((e) => e.section_id === currentSectionId);
    return entry?.title ?? "";
  }, [toc, currentSectionId]);

  const displayTitle = activeTitle || t("toc-title") || "Contents";
  const label = tooltip ?? ariaLabel;
  const pressed = value === "toc";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              aria-label={ariaLabel}
              title={label}
              aria-pressed={pressed}
              data-dock-trigger=""
              className={cn(
                "rounded-lg flex items-center justify-start shrink-0",
                "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                "transition-colors duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:opacity-30 disabled:hover:bg-transparent",
                "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
                "aria-pressed:bg-accent aria-pressed:text-accent-foreground",
                isMobile ? "h-11 w-11 justify-center" : "h-11 gap-3 px-3 max-w-64",
                className,
              )}
              onClick={() => toggle("toc")}
            >
              <List className="size-6 shrink-0" />
              {!isMobile ? (
                <span className="text-base text-left font-medium truncate w-full">
                  {displayTitle}
                </span>
              ) : null}
            </button>
          }
        />
        <TooltipContent side={popoverSide}>{label}</TooltipContent>
      </Tooltip>
      <DockPanel
        open={pressed}
        onClose={() => setValue("")}
        anchor={triggerRef}
        side={popoverSide}
      >
        <TocContent />
      </DockPanel>
    </>
  );
}
