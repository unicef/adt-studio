import { RenderStrategyPicker } from "./RenderStrategyPicker"
import { PageGroupingMode } from "./PageGroupingMode"
import { SectioningMode } from "./SectioningMode"

export function Step2() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <RenderStrategyPicker />
      <PageGroupingMode />
      <SectioningMode />
    </div>
  )
}
