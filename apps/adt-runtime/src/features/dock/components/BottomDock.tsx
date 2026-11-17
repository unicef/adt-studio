import { useAtomValue } from "jotai";
import { appConfigAtom } from "@/shared/state/config.atoms";
import { dockReadyAtom, embedModeAtom } from "@/shared/state/ui.atoms";
import { BookMetadata } from "@/features/dock/components/BookMetadata";
import { DockMenu } from "@/features/dock/components/DockMenu";
import { DockSkeleton } from "@/features/dock/components/DockSkeleton";
import { PageNav } from "@/features/navigation/components/PageNav";
import { useDockContext } from "@/features/dock/context/dock-context";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-is-mobile";
import { useTranslation } from "@/features/language/hooks/useTranslation";

function ReaderDockContents() {
  const features = useAtomValue(appConfigAtom).features;
  const { isSpread, isVertical, buttonStyle } = useDockContext();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <BookMetadata ariaLabel={t("main-menu-label") || "Main Menu"} />
        {features.showNavigationControls ? (
          <div className="flex min-w-0 flex-1 justify-center">
            <PageNav />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <DockMenu />
      </>
    );
  }

  if (isVertical) {
    // Rail: contents on top, page turning in the middle, tools at the foot.
    // "Spread" pushes the tools to the far end; "center" keeps them together.
    return (
      <>
        <BookMetadata ariaLabel={t("main-menu-label") || "Main Menu"} />
        <div aria-hidden className="h-px w-8 shrink-0 bg-border" />
        {features.showNavigationControls ? <PageNav /> : null}
        {isSpread ? <div className="min-h-2 flex-1" /> : (
          <div aria-hidden className="h-px w-8 shrink-0 bg-border" />
        )}
        <DockMenu />
      </>
    );
  }

  // Both flanks carry the same sizing so page navigation sits at the dock's
  // centre by construction rather than by coincidence.
  //
  // Spread: `basis-0` makes the two sides split the free space exactly (an
  // `auto` basis left them 4px apart, drifting the controls off-centre), and
  // `min-w-0` lets them shrink together. A hard `min-w-64` on each side used to
  // overflow the dock below ~700px, and `justify-between` then pushed the
  // controls ~24px to the right.
  //
  // Centre: a fixed width on both sides keeps them matched no matter how many
  // trigger icons the book's feature set puts in the menu.
  // Named buttons need more room than the fixed flank allows, so a centred
  // dock with names lets each flank size to its content instead.
  const flankClass = isSpread
    ? "flex-1 basis-0 min-w-0"
    : buttonStyle === "icon"
      ? "w-64 shrink-0"
      : "shrink-0";

  return (
    <>
      {features.showNavigationControls && (
        <div className="order-2 shrink-0">
          <PageNav />
        </div>
      )}

      <div className={cn("order-1", flankClass)}>
        <BookMetadata
          className="w-full"
          ariaLabel={t("main-menu-label") || "Main Menu"}
        />
      </div>

      <DockMenu className={cn("order-3", flankClass)} />
    </>
  );
}

type DockContainerProps = {
  children: React.ReactNode;
};

/** Where the dock sits and how it hides, per edge. */
function placementClasses(
  edge: "top" | "bottom" | "left" | "right",
  isCompact: boolean,
  shouldHide: boolean,
): string {
  switch (edge) {
    case "left":
      return cn(
        "flex-col overflow-y-auto",
        isCompact
          ? "left-3 top-1/2 -translate-y-1/2 max-h-[calc(100dvh-1.5rem)] rounded-2xl"
          : "left-0 top-0 bottom-0 rounded-none",
        shouldHide && "-translate-x-[150%]",
      );
    case "right":
      return cn(
        "flex-col overflow-y-auto",
        isCompact
          ? "right-3 top-1/2 -translate-y-1/2 max-h-[calc(100dvh-1.5rem)] rounded-2xl"
          : "right-0 top-0 bottom-0 rounded-none",
        shouldHide && "translate-x-[150%]",
      );
    case "top":
      return cn(
        "h-auto mx-auto",
        isCompact ? "top-3 rounded-2xl max-w-3xl" : "top-0 rounded-none",
        shouldHide && "-translate-y-[150%]",
      );
    default:
      return cn(
        "h-auto mx-auto",
        isCompact ? "bottom-3 rounded-2xl max-w-3xl" : "bottom-0 rounded-none",
        shouldHide && "translate-y-[150%]",
      );
  }
}

function DockContainer({ children }: DockContainerProps) {
  const { t } = useTranslation();
  const { isCompact, shouldHide, ref, isSpread, isVertical, edge } = useDockContext();
  return (
    <div
      ref={ref}
      data-dock-edge={edge}
      className={cn(
        isVertical
          ? "items-center gap-2 px-2 py-3 w-auto"
          : cn(isSpread ? "justify-between" : "justify-center", "items-center gap-1 p-2 h-full w-full"),
        "flex",
        "bg-popover/95 text-popover-foreground backdrop-blur-md",
        "shadow-lg ring-1 ring-border",
        "transition-all duration-200 ease-out will-change-transform",
        "fixed z-[55]",
        placementClasses(edge, isCompact, shouldHide),
        shouldHide && "opacity-0 pointer-events-none",
      )}
      // A horizontal dock makes room for a drawer that pushes the book, so the
      // controls stay beside the panel instead of under it.
      style={
        isVertical
          ? undefined
          : {
              left: "var(--adt-drawer-left, 0px)",
              right: "var(--adt-drawer-right, 0px)",
            }
      }
      role="group"
      aria-label={t("dock-label") || "Reader controls"}
      aria-hidden={shouldHide || undefined}
    >
      {children}
    </div>
  );
}

export function BottomDock() {
  const ready = useAtomValue(dockReadyAtom);
  const embed = useAtomValue(embedModeAtom);

  if (embed) return null;

  if (!ready) {
    return (
      <DockContainer>
        <DockSkeleton />
      </DockContainer>
    );
  }

  return (
    <DockContainer>
      <ReaderDockContents />
    </DockContainer>
  );
}
