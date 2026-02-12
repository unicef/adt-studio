import { useMemo } from "react"
import { ArrowUp, ArrowDown, Trash2, Plus, Merge, FileText, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SECTION_TYPE_GROUPS, getSectionTypeLabel } from "@/lib/section-constants"

interface Section {
  sectionType: string
  partIds: string[]
  backgroundColor: string
  textColor: string
  pageNumber: number | null
  isPruned: boolean
}

interface SectionEditorProps {
  sections: Section[]
  reasoning: string
  onChange: (sections: Section[]) => void
  textGroups: Array<{ groupId: string; groupType: string }>
  images: Array<{ imageId: string; isPruned: boolean }>
}

export function SectionEditor({
  sections,
  onChange,
  textGroups,
  images,
}: SectionEditorProps) {
  // Compute all valid part IDs and which are assigned
  const allPartIds = useMemo(() => {
    const ids: Array<{ id: string; label: string; kind: "text" | "image" }> = []
    for (const g of textGroups) {
      ids.push({ id: g.groupId, label: `${g.groupId} (${g.groupType})`, kind: "text" })
    }
    for (const img of images) {
      if (!img.isPruned) {
        ids.push({ id: img.imageId, label: img.imageId, kind: "image" })
      }
    }
    return ids
  }, [textGroups, images])

  const assignedPartIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of sections) {
      for (const id of s.partIds) set.add(id)
    }
    return set
  }, [sections])

  const unassignedParts = useMemo(
    () => allPartIds.filter((p) => !assignedPartIds.has(p.id)),
    [allPartIds, assignedPartIds]
  )

  const updateSection = (index: number, patch: Partial<Section>) => {
    onChange(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const deleteSection = (index: number) => {
    onChange(sections.filter((_, i) => i !== index))
  }

  const addSection = () => {
    onChange([
      ...sections,
      {
        sectionType: "text_only",
        partIds: [],
        backgroundColor: "#ffffff",
        textColor: "#333333",
        pageNumber: null,
        isPruned: false,
      },
    ])
  }

  const mergeSections = (index: number) => {
    if (index >= sections.length - 1) return
    const merged: Section = {
      ...sections[index],
      partIds: [...sections[index].partIds, ...sections[index + 1].partIds],
    }
    onChange([
      ...sections.slice(0, index),
      merged,
      ...sections.slice(index + 2),
    ])
  }

  const removePart = (sectionIndex: number, partId: string) => {
    updateSection(sectionIndex, {
      partIds: sections[sectionIndex].partIds.filter((id) => id !== partId),
    })
  }

  const addPart = (sectionIndex: number, partId: string) => {
    // Auto-move: remove from any other section that has this part
    const updated = sections.map((s, i) => {
      if (i === sectionIndex) {
        return { ...s, partIds: [...s.partIds, partId] }
      }
      if (s.partIds.includes(partId)) {
        return { ...s, partIds: s.partIds.filter((id) => id !== partId) }
      }
      return s
    })
    onChange(updated)
  }

  /** Parts available for a given section: all parts not already in THIS section */
  const getAvailableParts = (sectionIndex: number) =>
    allPartIds.filter((p) => !sections[sectionIndex].partIds.includes(p.id))

  const getPartInfo = (partId: string) => {
    const tg = textGroups.find((g) => g.groupId === partId)
    if (tg) return { label: `${partId} (${tg.groupType})`, kind: "text" as const }
    const img = images.find((im) => im.imageId === partId)
    if (img) return { label: partId, kind: "image" as const }
    return { label: partId, kind: "text" as const }
  }

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <div
          key={i}
          className={`rounded border ${section.isPruned ? "opacity-60" : ""}`}
        >
          {/* Header row */}
          <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
            <div className="flex gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={i === 0}
                onClick={() => moveSection(i, -1)}
                title="Move up"
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={i === sections.length - 1}
                onClick={() => moveSection(i, 1)}
                title="Move down"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              Section {i + 1}
            </span>
            <Select
              value={section.sectionType}
              onValueChange={(val) => updateSection(i, { sectionType: val })}
            >
              <SelectTrigger className="h-7 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_TYPE_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-xs">{group.label}</SelectLabel>
                    {group.types.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Label htmlFor={`prune-section-${i}`} className="text-xs">
                  Pruned
                </Label>
                <Switch
                  id={`prune-section-${i}`}
                  checked={section.isPruned}
                  onCheckedChange={(checked: boolean) =>
                    updateSection(i, { isPruned: checked })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => deleteSection(i)}
                title="Delete section"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-4 border-b px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">BG:</label>
              <input
                type="color"
                value={section.backgroundColor}
                onChange={(e) =>
                  updateSection(i, { backgroundColor: e.target.value })
                }
                className="h-6 w-6 cursor-pointer rounded border p-0"
              />
              <Input
                value={section.backgroundColor}
                onChange={(e) =>
                  updateSection(i, { backgroundColor: e.target.value })
                }
                className="h-6 w-20 px-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Text:</label>
              <input
                type="color"
                value={section.textColor}
                onChange={(e) =>
                  updateSection(i, { textColor: e.target.value })
                }
                className="h-6 w-6 cursor-pointer rounded border p-0"
              />
              <Input
                value={section.textColor}
                onChange={(e) =>
                  updateSection(i, { textColor: e.target.value })
                }
                className="h-6 w-20 px-1 text-xs"
              />
            </div>
          </div>

          {/* Parts */}
          <div className="px-3 py-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Parts ({section.partIds.length})
            </p>
            {section.partIds.length > 0 ? (
              <div className="space-y-1">
                {section.partIds.map((partId) => {
                  const info = getPartInfo(partId)
                  return (
                    <div
                      key={partId}
                      className="flex items-center justify-between rounded bg-muted/30 px-2 py-1"
                    >
                      <span className="flex items-center gap-1.5 text-xs">
                        {info.kind === "image" ? (
                          <Image className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <FileText className="h-3 w-3 text-muted-foreground" />
                        )}
                        {info.label}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removePart(i, partId)}
                        title="Remove from section"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No parts assigned</p>
            )}
            {/* Add part dropdown — shows all parts not in this section; auto-moves from other sections */}
            {getAvailableParts(i).length > 0 && (
              <Select onValueChange={(val) => addPart(i, val)} value="">
                <SelectTrigger className="mt-1.5 h-7 text-xs">
                  <SelectValue placeholder="+ Add part..." />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableParts(i).map((p) => {
                    const isAssigned = assignedPartIds.has(p.id)
                    return (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.kind === "image" ? "🖼 " : "📝 "}
                        {p.label}
                        {isAssigned ? " (move)" : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Merge with next */}
          {i < sections.length - 1 && (
            <div className="border-t px-3 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-full text-xs text-muted-foreground"
                onClick={() => mergeSections(i)}
              >
                <Merge className="mr-1 h-3 w-3" />
                Merge with next section
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* Add new section */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addSection}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add Section
      </Button>

      {/* Unassigned parts warning */}
      {unassignedParts.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-medium text-amber-800">
            Unassigned Parts ({unassignedParts.length})
          </p>
          <div className="space-y-0.5">
            {unassignedParts.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs text-amber-700">
                {p.kind === "image" ? (
                  <Image className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {p.label}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-amber-600">
            Use the "+ Add part" dropdown in any section above to assign these.
          </p>
        </div>
      )}
    </div>
  )
}
