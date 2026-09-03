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
  const { isSpread } = useDockContext();
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
  const flankClass = isSpread ? "flex-1 basis-0 min-w-0" : "w-64 shrink-0";

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
function DockContainer({ children }: DockContainerProps) {
  const { t } = useTranslation();
  const { isCompact, isTop, shouldHide, ref, isSpread } = useDockContext();
  return (
    <div
      ref={ref}
      className={cn(
        isSpread ? "justify-between" : "justify-center",
        "flex items-center gap-1 p-2 h-full w-full",
        "bg-popover/95 text-popover-foreground backdrop-blur-md",
        "shadow-lg ring-1 ring-border",
        "transition-all duration-200 ease-out will-change-transform",
        isCompact ? "rounded-2xl max-w-3xl" : "rounded-none",
        shouldHide && "opacity-0 pointer-events-none",
        shouldHide && (isTop ? "-translate-y-[150%]" : "translate-y-[150%]"),
        cn(
          "fixed z-[55] h-auto left-0 right-0 mx-auto",
          isCompact
            ? isTop
              ? "top-3"
              : "bottom-3"
            : isTop
              ? "top-0"
              : "bottom-0",
        ),
      )}
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
