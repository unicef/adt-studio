import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/**
 * In-view entrance shared by the landing scenes: fade + small rise, once,
 * exponential ease-out. Under `prefers-reduced-motion` the content renders
 * static and always visible (no transform, no fade).
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT_QUINT }}
    >
      {children}
    </motion.div>
  );
}
