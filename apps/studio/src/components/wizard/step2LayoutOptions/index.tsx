import { RenderStrategyPicker } from "./RenderStrategyPicker"
import { PageGroupingMode } from "./PageGroupingMode"
import { MarkSpreads } from "./MarkSpreads"
import { SectioningMode } from "./SectioningMode"

export function Step2() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <RenderStrategyPicker />
      <div className="flex flex-col">
        <PageGroupingMode />
        <MarkSpreads />
      </div>
      <SectioningMode />
    </div>
  )
}
