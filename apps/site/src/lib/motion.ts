/**
 * Motion vocabulary for the landing. Entrances and exits use EASE_OUT
 * ("respond immediately, settle quietly"); on-screen movement uses
 * EASE_IN_OUT; pressable surfaces and shared indicators use springs.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const SPRING_PRESS = {
  type: "spring",
  stiffness: 700,
  damping: 32,
  mass: 0.8,
} as const;

export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.9,
} as const;

export const DURATION = {
  press: 0.12,
  popover: 0.18,
  sheet: 0.2,
  morph: 0.26,
  reveal: 0.6,
} as const;
