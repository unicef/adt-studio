import { Trash2, FileText, Image, Merge } from "lucide-react"
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
import { InlineEditCard } from "./InlineEditCard"

type SectionPart =
  | { type: "text_group"; groupId: string; groupType: string; texts: Array<{ textType: string; text: string; isPruned: boolean }>; isPruned: boolean }
  | { type: "image"; imageId: string; isPruned: boolean; reason?: string }

interface Section {
  sectionType: string
  parts: SectionPart[]
  backgroundColor: string
  textColor: string
  pageNumber: number | null
  isPruned: boolean
}

interface SectionCardProps {
  section: Section
  index: number
  isEditing: boolean
  isDirty: boolean
  isLast: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onUpdate: (patch: Partial<Section>) => void
  onDelete: () => void
  onMergeWithNext: () => void
  textGroups: Array<{ groupId: string; groupType: string }>
  images: Array<{ imageId: string; isPruned: boolean }>
  allPartIds: Array<{ id: string; label: string; kind: "text" | "image" }>
  assignedPartIds: Set<string>
  onAddPart: (partId: string) => void
  onRemovePart: (partId: string) => void
}

export function SectionCard({
  section,
  index,
  isEditing,
  isDirty,
  isLast,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onDelete,
  onMergeWithNext,
  allPartIds,
  assignedPartIds,
  onAddPart,
  onRemovePart,
}: SectionCardProps) {
  const getPartId = (part: SectionPart) =>
    part.type === "image" ? part.imageId : part.groupId

  const getPartLabel = (part: SectionPart) =>
    part.type === "image" ? part.imageId : `${part.groupId} (${part.groupType})`

  const assignedIds = new Set(section.parts.map(getPartId))
  const availableParts = allPartIds.filter((p) => !assignedIds.has(p.id))

  const viewContent = (
    <div className={section.isPruned ? "opacity-60" : ""}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Section {index + 1}
        </span>
        <Badge variant="outline" className="text-xs">
          {getSectionTypeLabel(section.sectionType)}
        </Badge>
        <div className="flex gap-1">
          <span
            className="inline-block h-3 w-3 rounded border"
            style={{ backgroundColor: section.backgroundColor }}
            title={`bg: ${section.backgroundColor}`}
          />
          <span
            className="inline-block h-3 w-3 rounded border"
            style={{ backgroundColor: section.textColor }}
            title={`text: ${section.textColor}`}
          />
        </div>
        {section.isPruned && (
          <Badge variant="secondary" className="text-xs">Pruned</Badge>
        )}
      </div>
      {section.parts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {section.parts.map((part) => {
            const partId = getPartId(part)
            return (
              <span
                key={partId}
                className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {part.type === "image" ? (
                  <Image className="h-2.5 w-2.5" />
                ) : (
                  <FileText className="h-2.5 w-2.5" />
                )}
                {getPartLabel(part)}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )

  const editContent = (
    <div className={section.isPruned ? "opacity-60" : ""}>
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground shrink-0">
          Section {index + 1}
        </span>
        <Select
          value={section.sectionType}
          onValueChange={(val) => onUpdate({ sectionType: val })}
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
            <Label htmlFor={`prune-section-${index}`} className="text-xs">Pruned</Label>
            <Switch
              id={`prune-section-${index}`}
              checked={section.isPruned}
              onCheckedChange={(checked: boolean) => onUpdate({ isPruned: checked })}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Delete section"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Colors */}
      <div className="mb-2 flex items-center gap-4 rounded border px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">BG:</label>
          <input
            type="color"
            value={section.backgroundColor}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border p-0"
          />
          <Input
            value={section.backgroundColor}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="h-6 w-20 px-1 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Text:</label>
          <input
            type="color"
            value={section.textColor}
            onChange={(e) => onUpdate({ textColor: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border p-0"
          />
          <Input
            value={section.textColor}
            onChange={(e) => onUpdate({ textColor: e.target.value })}
            className="h-6 w-20 px-1 text-xs"
          />
        </div>
      </div>

      {/* Parts */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Parts ({section.parts.length})
        </p>
        {section.parts.length > 0 ? (
          <div className="space-y-1">
            {section.parts.map((part) => {
              const partId = getPartId(part)
              return (
                <div
                  key={partId}
                  className="flex items-center justify-between rounded bg-muted/30 px-2 py-1"
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    {part.type === "image" ? (
                      <Image className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <FileText className="h-3 w-3 text-muted-foreground" />
                    )}
                    {getPartLabel(part)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemovePart(partId)}
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
        {availableParts.length > 0 && (
          <Select onValueChange={(val) => onAddPart(val)} value="">
            <SelectTrigger className="mt-1.5 h-7 text-xs">
              <SelectValue placeholder="+ Add part..." />
            </SelectTrigger>
            <SelectContent>
              {availableParts.map((p) => {
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
      {!isLast && (
        <div className="mt-2 border-t pt-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full text-xs text-muted-foreground"
            onClick={onMergeWithNext}
          >
            <Merge className="mr-1 h-3 w-3" />
            Merge with next section
          </Button>
        </div>
      )}
    </div>
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
