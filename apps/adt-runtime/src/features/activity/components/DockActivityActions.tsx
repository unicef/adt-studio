import { useAtomValue } from "jotai";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  submitVisibleAtom,
  validateHandlerAtom,
} from "@/features/activity/state/activity.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { cn } from "@/shared/lib/utils";

export function DockActivityActions() {
  const submitEnabled = useAtomValue(submitEnabledAtom);
  const submitVisible = useAtomValue(submitVisibleAtom);
  const validate = useAtomValue(validateHandlerAtom);
  const submitState = useAtomValue(submitStateAtom);
  const submitLabelOverride = useAtomValue(submitLabelAtom);
  const { t } = useTranslation();

  // Standalone quizzes validate on click and hide this button entirely.
  if (!submitVisible) return null;

  const defaultLabel =
    submitState === "next"
      // The post-submit button advances to the next page, which may or may not
      // be another activity — use the neutral "Next" rather than "Next activity".
      ? t("next") || "Next"
      : t("submit-text") || "Submit";
  const submitLabel = submitLabelOverride ?? defaultLabel;

  return (
    <div className="flex flex-1 items-center justify-center max-w-3xl p-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              onClick={validate ?? undefined}
              disabled={!submitEnabled || !validate}
              size="lg"
              title={submitLabel}
              className={cn(
                // Theme tokens, so a book's reader design (Studio Reader step)
                // colours the main call to action. "Next" reads as a step on
                // from a checked answer: the highlight pair, outlined in primary.
                // Bumped from text-sm (button default) to text-base for legibility.
                "px-6 py-3 text-base font-semibold",
                submitState === "next"
                  ? "bg-accent text-accent-foreground ring-2 ring-primary hover:bg-accent/80"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {submitLabel}
            </Button>
          }
        />
        <TooltipContent>{submitLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
