import { Image } from "lucide-react"

const MOCK_CAPTIONS = [
  { id: 1, page: 2, caption: "Diagram showing the complete water cycle including evaporation, condensation, and precipitation stages.", imageIndex: 1 },
  { id: 2, page: 3, caption: "Interactive activity area for labeling the water cycle diagram components.", imageIndex: 2 },
  { id: 3, page: 5, caption: "Cross-section illustration of a plant root system showing water absorption through root hairs.", imageIndex: 3 },
  { id: 4, page: 6, caption: "Photograph of a river delta showing how water shapes the landscape over time.", imageIndex: 4 },
  { id: 5, page: 8, caption: "Bar chart comparing daily water usage across different household activities.", imageIndex: 5 },
  { id: 6, page: 10, caption: "Map showing major freshwater sources and rivers across the African continent.", imageIndex: 6 },
]

export function CaptionsView({ bookLabel: _ }: { bookLabel: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Image Captions</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {MOCK_CAPTIONS.length} images captioned
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {MOCK_CAPTIONS.map((item) => (
          <div key={item.id} className="rounded-md border bg-card overflow-hidden">
            <div className="aspect-[4/3] bg-muted flex items-center justify-center">
              <Image className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-medium text-teal-600">Image {item.imageIndex}</span>
                <span className="text-[10px] text-muted-foreground">Page {item.page}</span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{item.caption}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
