import { isLandscapeRatio } from "@/components/app/screens/pipeline/shared/usePageAspect"

export function largeRailThumbClass(ratio: number): string {
  return isLandscapeRatio(ratio) ? "h-[52px] w-[74px]" : "h-[70px] w-[52px]"
}
