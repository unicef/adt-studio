import { useEffect, useRef, useState } from "react";
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
  const [systemReduceMotion, setSystemReduceMotion] = useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const lastTrigger = useRef(trigger);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (lastTrigger.current === trigger) return;
    lastTrigger.current = trigger;
    if (trigger === 0 || reduceMotion || systemReduceMotion) return;
    ref.current?.fire({
      particleCount: 120,
      spread: 90,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.7 },
      disableForReducedMotion: true,
    });
  }, [trigger, reduceMotion, systemReduceMotion]);

  if (reduceMotion || systemReduceMotion) return null;

  return (
    <Confetti
      ref={ref}
      manualstart
      className="pointer-events-none fixed inset-0 z-[200] h-full w-full"
    />
  );
}
