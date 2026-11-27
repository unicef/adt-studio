import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { Confetti, type ConfettiRef } from "@/shared/ui/confetti";
import { confettiTriggerAtom } from "@/features/activity/state/activity.atoms";
import { reduceMotionAtom } from "@/shared/state/ui.atoms";

/**
 * Fullscreen confetti overlay. Mounts a manual-start `<Confetti>` once and
 * fires it whenever `confettiTriggerAtom` changes — incremented by the quiz
 * validator on a correct answer.
 */
export function ActivityConfetti() {
  const reduceMotion = useAtomValue(reduceMotionAtom);
  const ref = useRef<ConfettiRef>(null);
  const trigger = useAtomValue(confettiTriggerAtom);

  useEffect(() => {
    if (trigger === 0 || reduceMotion) return;
    ref.current?.fire({
      particleCount: 120,
      spread: 90,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.7 },
    });
  }, [trigger]);

  if(reduceMotion) return null;

  return (
    <Confetti
      ref={ref}
      manualstart
      // Decoration only. Hidden from assistive tech so it is not a stray
      // element outside the page's landmarks.
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[200] h-full w-full"
    />
  );
}
