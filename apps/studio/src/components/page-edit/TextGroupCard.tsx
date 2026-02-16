import { useState, useRef, useCallback } from "react"
import { Plus, Trash2, Volume2, Square } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InlineEditCard } from "./InlineEditCard"

/** Build TTS textId from groupId and text index (0-based) */
function textIdFor(groupId: string, textIndex: number): string {
  return `${groupId}_tx${String(textIndex + 1).padStart(3, "0")}`
}

function PlayButton({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = useCallback(() => {
    if (playing && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
      return
    }

    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => setPlaying(false)
    audio.onerror = () => setPlaying(false)
    audio.play()
    setPlaying(true)
  }, [url, playing])

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggle() }}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
      title={playing ? "Stop" : "Play TTS"}
    >
      {playing ? (
        <Square className="h-2.5 w-2.5 fill-current" />
      ) : (
        <Volume2 className="h-3 w-3" />
      )}
    </button>
  )
}

interface TextGroup {
  groupId: string
  groupType: string
  texts: Array<{ textType: string; text: string; isPruned: boolean }>
}

interface TextGroupCardProps {
  group: TextGroup
  isEditing: boolean
  isDirty: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onUpdate: (group: TextGroup) => void
  onRemove: () => void
  audioMap?: Map<string, string>
}

export function TextGroupCard({
  group,
  isEditing,
  isDirty,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onRemove,
  audioMap,
}: TextGroupCardProps) {
  const updateGroupType = (groupType: string) => {
    onUpdate({ ...group, groupType })
  }

  const updateText = (textIndex: number, field: string, value: unknown) => {
    onUpdate({
      ...group,
      texts: group.texts.map((t, ti) =>
        ti === textIndex ? { ...t, [field]: value } : t
      ),
    })
  }

  const addTextEntry = () => {
    onUpdate({
      ...group,
      texts: [...group.texts, { textType: "paragraph", text: "", isPruned: false }],
    })
  }

  const removeTextEntry = (textIndex: number) => {
    onUpdate({
      ...group,
      texts: group.texts.filter((_, ti) => ti !== textIndex),
    })
  }

  const viewContent = (
    <>
      <div className="mb-1 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{group.groupType}</Badge>
        <span className="text-xs text-muted-foreground">{group.groupId}</span>
      </div>
      <div className="space-y-0.5">
        {group.texts.map((t, i) => {
          const audioUrl = audioMap?.get(textIdFor(group.groupId, i))
          return (
            <div
              key={i}
              className={`group/text flex items-start gap-1 text-xs ${t.isPruned ? "text-muted-foreground line-through" : ""}`}
            >
              {audioUrl && !t.isPruned && <PlayButton url={audioUrl} />}
              <span>
                <span className="mr-1 text-muted-foreground opacity-0 group-hover/text:opacity-100 transition-opacity">[{t.textType}]</span>
                {t.text}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )

  const editContent = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={group.groupType}
          onChange={(e) => updateGroupType(e.target.value)}
          className="h-6 w-28 px-1.5 text-xs"
        />
        <span className="text-xs text-muted-foreground">{group.groupId}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          title="Remove group"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-3">
        {group.texts.map((t, ti) => {
          const audioUrl = audioMap?.get(textIdFor(group.groupId, ti))
          return (
            <div key={ti} className={`space-y-1 rounded border p-2 ${t.isPruned ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">[{t.textType}]</span>
                  {audioUrl && !t.isPruned && <PlayButton url={audioUrl} />}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`prune-${group.groupId}-${ti}`} className="text-xs">Pruned</Label>
                  <Switch
                    id={`prune-${group.groupId}-${ti}`}
                    checked={t.isPruned}
                    onCheckedChange={(checked: boolean) => updateText(ti, "isPruned", checked)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeTextEntry(ti)}
                    title="Remove text entry"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={t.text}
                onChange={(e) => updateText(ti, "text", e.target.value)}
                className={`min-h-[60px] text-xs ${t.isPruned ? "line-through" : ""}`}
              />
            </div>
          )
        })}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-full text-xs text-muted-foreground"
          onClick={addTextEntry}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add text entry
        </Button>
      </div>
    </>
  )

  return (
    <InlineEditCard
      isEditing={isEditing}
      isDirty={isDirty}
      onStartEdit={onStartEdit}
      onStopEdit={onStopEdit}
      viewContent={viewContent}
      editContent={editContent}
    />
  )
}
