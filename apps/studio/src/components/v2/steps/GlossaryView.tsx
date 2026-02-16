import { Badge } from "@/components/ui/badge"

const MOCK_GLOSSARY = [
  { term: "Condensation", definition: "The process by which water vapor in the air is changed into liquid water.", pages: [2, 3] },
  { term: "Evaporation", definition: "The process by which water changes from a liquid to a gas or vapor.", pages: [2] },
  { term: "Groundwater", definition: "Water held underground in the soil or in pores and crevices in rock.", pages: [4, 6] },
  { term: "Photosynthesis", definition: "The process by which green plants use sunlight to synthesize foods from carbon dioxide and water.", pages: [5] },
  { term: "Precipitation", definition: "Rain, snow, sleet, or hail that falls to the ground from clouds.", pages: [3, 4] },
  { term: "Transpiration", definition: "The process by which moisture is carried through plants from roots to small pores on the leaves, where it evaporates.", pages: [5, 6] },
  { term: "Water cycle", definition: "The continuous movement of water on, above, and below the surface of the Earth.", pages: [1, 2, 3] },
  { term: "Watershed", definition: "An area of land that channels rainfall and snowmelt to creeks, streams, and rivers.", pages: [7] },
]

export function GlossaryView({ bookLabel: _ }: { bookLabel: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Glossary</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {MOCK_GLOSSARY.length} terms extracted
        </p>
      </div>

      <div className="space-y-1">
        {MOCK_GLOSSARY.map((item) => (
          <div
            key={item.term}
            className="flex items-start gap-3 px-3 py-2.5 rounded-md border bg-card hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium text-emerald-700 shrink-0 w-28">
              {item.term}
            </span>
            <span className="text-xs text-muted-foreground flex-1 leading-relaxed">
              {item.definition}
            </span>
            <div className="flex gap-1 shrink-0">
              {item.pages.map((p) => (
                <Badge key={p} variant="outline" className="text-[10px] h-4 px-1.5">
                  p.{p}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
