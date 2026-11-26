import { useLingui } from "@lingui/react/macro"
import { FilePen, Hand, ListChecks, Zap, type LucideIcon } from "lucide-react"
import type { ChatMode } from "@adt/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ChatModeSelectProps {
  value: ChatMode
  onChange: (mode: ChatMode) => void
}

export function ChatModeSelect({ value, onChange }: ChatModeSelectProps) {
  const { t } = useLingui()
  const modes: { value: ChatMode; label: string; description: string; icon: LucideIcon }[] = [
    { value: "manual", label: t`Manual`, description: t`Ask before every change`, icon: Hand },
    { value: "acceptEdits", label: t`Accept edits`, description: t`Apply edits to existing content, ask for the rest`, icon: FilePen },
    { value: "auto", label: t`Auto`, description: t`Apply every change without asking`, icon: Zap },
    { value: "plan", label: t`Plan`, description: t`Only read and propose a plan`, icon: ListChecks },
  ]
  const current = modes.find((mode) => mode.value === value) ?? modes[0]
  const CurrentIcon = current.icon

  return (
    <Select value={value} onValueChange={(next) => onChange(next as ChatMode)}>
      <SelectTrigger
        aria-label={t`Approval mode`}
        className="h-7 w-auto gap-1.5 rounded-md border-none bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-muted"
      >
        <SelectValue>
          <span className="flex items-center gap-1.5">
            <CurrentIcon className="size-3.5" />
            {current.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent side="top" align="start" className="w-64">
        {modes.map((mode) => (
          <SelectItem key={mode.value} value={mode.value} className="items-start py-2">
            <span className="flex items-start gap-2">
              <mode.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">{mode.label}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{mode.description}</span>
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
