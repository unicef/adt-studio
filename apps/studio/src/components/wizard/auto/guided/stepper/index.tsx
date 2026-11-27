import { createContext, useContext } from "react"
import type { StepperProps } from "./shared"
import { StepperCompact } from "./StepperCompact"
import { StepperDots } from "./StepperDots"
import { StepperHeader } from "./StepperHeader"
import { StepperIcons } from "./StepperIcons"
import { StepperPills } from "./StepperPills"
import { StepperSegments } from "./StepperSegments"

/** The stepper designs being compared (dev lab, `?stepper=`); "dots" ships until one is chosen. */
export const STEPPER_VARIANTS = {
  dots: StepperDots,
  segments: StepperSegments,
  pills: StepperPills,
  icons: StepperIcons,
  compact: StepperCompact,
  header: StepperHeader,
} as const
export type StepperVariant = keyof typeof STEPPER_VARIANTS

/** Which design to show: the lab sets it in development; everywhere else it's "dots". */
export const StepperVariantContext = createContext<StepperVariant>("dots")

/** The stepper above the page (nothing when the chosen design lives in the header). */
export function Stepper(props: StepperProps) {
  const variant = useContext(StepperVariantContext)
  if (variant === "header") return null
  const Design = STEPPER_VARIANTS[variant]
  return <Design {...props} />
}

/** The stepper in the app's top bar, for the "header" design only. */
export function HeaderStepper(props: StepperProps) {
  return useContext(StepperVariantContext) === "header" ? <StepperHeader {...props} /> : null
}

export type { StepperProps }
