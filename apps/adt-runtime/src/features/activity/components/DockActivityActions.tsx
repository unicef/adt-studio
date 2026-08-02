import { useAtomValue } from "jotai";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "@/features/activity/state/activity.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { cn } from "@/shared/lib/utils";

export function DockActivityActions() {
  const submitEnabled = useAtomValue(submitEnabledAtom);
  const validate = useAtomValue(validateHandlerAtom);
  const submitState = useAtomValue(submitStateAtom);
  const submitLabelOverride = useAtomValue(submitLabelAtom);
  const { t } = useTranslation();

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
                // WCAG AA: white text on bg-blue-600 ≈ 8.6:1, on bg-emerald-600 ≈ 4.8:1.
                // Bumped from text-sm (button default) to text-base for legibility.
                "px-6 py-3 text-base font-semibold text-white",
                submitState === "next"
                  ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400",
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
