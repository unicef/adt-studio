import { DockActivityActions } from "./DockActivityActions";
import { cn } from "@/shared/lib/utils";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { useAtomValue } from "jotai";
import { activityModeAtom, submitStateAtom } from "@/features/activity/state/activity.atoms";
import { useDockContext } from "@/features/dock/context/dock-context";
import { embedModeAtom } from "@/shared/state/ui.atoms";

export function ActivityDock() {
  const { t } = useTranslation();
  const { isCompact, shouldHide, isTop } = useDockContext();
  const activityMode = useAtomValue(activityModeAtom);
  const embed = useAtomValue(embedModeAtom);
  const submitState = useAtomValue(submitStateAtom);
  // In embed mode the BottomDock is hidden, so sit flush near the edge
  // instead of leaving room above the (absent) reader dock.
  const topClassname = embed ? "top-3" : isCompact ? "top-21" : "top-18";
  const bottomClassname = embed ? "bottom-3" : isCompact ? "bottom-21" : "bottom-18";

  if (!activityMode) return null;

  // Storyboard preview (`?embed=1`): once the activity is answered correctly the
  // button would flip to a navigating "Next", but advancing only swaps the
  // iframe while the storyboard chrome stays put. Hide the dock instead — the
  // storyboard's own arrows move between items. The full reader keeps "Next".
  if (embed && submitState === "next") return null;


  return (
    <div
      className={cn(
        "justify-center",
        "flex items-center gap-1 p-1 h-full w-fit",
        "bg-popover/95 text-popover-foreground backdrop-blur-md",
        "shadow-lg ring-1 ring-border",
        "transition-all duration-200 ease-out will-change-transform",
        "rounded-2xl",
        "fixed z-[56] h-auto left-0 right-0 mx-auto",
        isTop ? topClassname : bottomClassname,
        shouldHide && "opacity-0 pointer-events-none",
        shouldHide && (isTop ? "-translate-y-[150%]" : "translate-y-[150%]"),
      )}
      aria-label={t("dock-label") || "Activity controls"}
    >
      <DockActivityActions />
    </div>
  );
}
