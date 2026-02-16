import { Play, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const MOCK_AUDIO = [
  { id: 1, section: "Chapter 1: Water and Life", page: 1, duration: "0:45", voice: "Aria", status: "complete" as const },
  { id: 2, section: "Introduction to water cycles", page: 1, duration: "2:12", voice: "Aria", status: "complete" as const },
  { id: 3, section: "Evaporation and condensation", page: 2, duration: "1:48", voice: "Aria", status: "complete" as const },
  { id: 4, section: "Precipitation", page: 3, duration: "1:33", voice: "Aria", status: "complete" as const },
  { id: 5, section: "Chapter 2: Plants and Water", page: 4, duration: "0:38", voice: "Aria", status: "complete" as const },
  { id: 6, section: "How plants use water", page: 4, duration: "2:05", voice: "Aria", status: "pending" as const },
  { id: 7, section: "Water conservation", page: 6, duration: "--:--", voice: "Aria", status: "pending" as const },
]

export function TextToSpeechView({ bookLabel: _ }: { bookLabel: string }) {
  const completedCount = MOCK_AUDIO.filter((a) => a.status === "complete").length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Text to Speech</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount} of {MOCK_AUDIO.length} segments generated
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          Voice: Aria
        </Badge>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-3 py-1.5 bg-muted/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="w-8" />
          <span>Section</span>
          <span>Page</span>
          <span>Duration</span>
          <span>Status</span>
        </div>
        {MOCK_AUDIO.map((audio) => (
          <div
            key={audio.id}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-3 py-2 border-t bg-card hover:bg-muted/30 transition-colors"
          >
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              disabled={audio.status === "pending"}
            >
              <Play className="w-3 h-3" />
            </Button>
            <span className="text-sm truncate">{audio.section}</span>
            <span className="text-xs text-muted-foreground">p.{audio.page}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {audio.duration}
            </span>
            <Badge
              variant={audio.status === "complete" ? "secondary" : "outline"}
              className="text-[10px]"
            >
              {audio.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}
