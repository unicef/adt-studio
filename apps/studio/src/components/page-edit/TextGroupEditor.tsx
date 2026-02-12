import { Plus, Trash2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TextGroupEditorProps {
  groups: Array<{
    groupId: string
    groupType: string
    texts: Array<{ textType: string; text: string; isPruned: boolean }>
  }>
  onChange: (groups: TextGroupEditorProps["groups"]) => void
}

export function TextGroupEditor({ groups, onChange }: TextGroupEditorProps) {
  const updateText = (groupIndex: number, textIndex: number, field: string, value: unknown) => {
    const newGroups = groups.map((g, gi) => {
      if (gi !== groupIndex) return g
      return {
        ...g,
        texts: g.texts.map((t, ti) => {
          if (ti !== textIndex) return t
          return { ...t, [field]: value }
        }),
      }
    })
    onChange(newGroups)
  }

  const updateGroupType = (groupIndex: number, groupType: string) => {
    onChange(groups.map((g, i) => (i === groupIndex ? { ...g, groupType } : g)))
  }

  const addTextEntry = (groupIndex: number) => {
    onChange(
      groups.map((g, i) =>
        i === groupIndex
          ? { ...g, texts: [...g.texts, { textType: "paragraph", text: "", isPruned: false }] }
          : g
      )
    )
  }

  const removeTextEntry = (groupIndex: number, textIndex: number) => {
    onChange(
      groups.map((g, i) =>
        i === groupIndex
          ? { ...g, texts: g.texts.filter((_, ti) => ti !== textIndex) }
          : g
      )
    )
  }

  const addGroup = () => {
    // Generate a unique groupId based on existing IDs
    const existingIds = new Set(groups.map((g) => g.groupId))
    let counter = groups.length + 1
    let newId = `custom_g${counter}`
    while (existingIds.has(newId)) {
      counter++
      newId = `custom_g${counter}`
    }
    onChange([
      ...groups,
      {
        groupId: newId,
        groupType: "paragraph",
        texts: [{ textType: "paragraph", text: "", isPruned: false }],
      },
    ])
  }

  const removeGroup = (groupIndex: number) => {
    onChange(groups.filter((_, i) => i !== groupIndex))
  }

  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div key={group.groupId} className="rounded border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Input
              value={group.groupType}
              onChange={(e) => updateGroupType(gi, e.target.value)}
              className="h-6 w-28 px-1.5 text-xs"
            />
            <span className="text-xs text-muted-foreground">{group.groupId}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeGroup(gi)}
              title="Remove group"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-3">
            {group.texts.map((t, ti) => (
              <div key={ti} className={`space-y-1 rounded border p-2 ${t.isPruned ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">[{t.textType}]</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`prune-${gi}-${ti}`} className="text-xs">Pruned</Label>
                    <Switch
                      id={`prune-${gi}-${ti}`}
                      checked={t.isPruned}
                      onCheckedChange={(checked: boolean) => updateText(gi, ti, "isPruned", checked)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTextEntry(gi, ti)}
                      title="Remove text entry"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={t.text}
                  onChange={(e) => updateText(gi, ti, "text", e.target.value)}
                  className={`min-h-[60px] text-sm ${t.isPruned ? "line-through" : ""}`}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full text-xs text-muted-foreground"
              onClick={() => addTextEntry(gi)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add text entry
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addGroup}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add Text Group
      </Button>
    </div>
  )
}
