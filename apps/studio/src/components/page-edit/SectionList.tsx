import { useState, useCallback, useMemo } from "react"
import { ArrowUp, ArrowDown, Plus, FileText, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionCard } from "./SectionCard"
import type { PageDetail } from "@/api/client"

type Sectioning = NonNullable<PageDetail["sectioning"]>
type Section = Sectioning["sections"][number]

interface SectionListProps {
  pageId: string
  sections: Sectioning["sections"]
  draftSectioning: Sectioning | null
  serverSectioning: Sectioning | null
  onUpdate: (updater: (prev: Sectioning) => Sectioning) => void
  textGroups: Array<{ groupId: string; groupType: string }>
  images: Array<{ imageId: string; isPruned: boolean }>
}

function buildNextSectionId(pageId: string, sections: Sectioning["sections"]): string {
  const prefix = `${pageId}_sec`
  let maxIndex = 0

  for (const section of sections) {
    if (!section.sectionId.startsWith(prefix)) continue
    const suffix = section.sectionId.slice(prefix.length)
    const parsed = Number.parseInt(suffix, 10)
    if (Number.isFinite(parsed) && parsed > maxIndex) {
      maxIndex = parsed
    }
  }

  const nextIndex = maxIndex > 0 ? maxIndex + 1 : sections.length + 1
  return `${prefix}${String(nextIndex).padStart(3, "0")}`
}

export function SectionList({
  pageId,
  sections,
  draftSectioning,
  serverSectioning,
  onUpdate,
  textGroups,
  images,
}: SectionListProps) {
  const [editingIndices, setEditingIndices] = useState<Set<number>>(new Set())

  const startEdit = useCallback((index: number) => {
    setEditingIndices((prev) => new Set(prev).add(index))
  }, [])

  const stopEdit = useCallback((index: number) => {
    setEditingIndices((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }, [])

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
      for (const part of s.parts) {
        set.add(part.type === "image" ? part.imageId : part.groupId)
      }
    }
    return set
  }, [sections])

  const unassignedParts = useMemo(
    () => allPartIds.filter((p) => !assignedPartIds.has(p.id)),
    [allPartIds, assignedPartIds]
  )

  const isSectionDirty = (index: number): boolean => {
    if (!draftSectioning || !serverSectioning) return false
    const serverSection = serverSectioning.sections[index]
    if (!serverSection) return true // New section
    return JSON.stringify(sections[index]) !== JSON.stringify(serverSection)
  }

  const updateSection = useCallback(
    (index: number, patch: Partial<Section>) => {
      onUpdate((prev) => ({
        ...prev,
        sections: prev.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      }))
    },
    [onUpdate]
  )

  const deleteSection = useCallback(
    (index: number) => {
      onUpdate((prev) => ({
        ...prev,
        sections: prev.sections.filter((_, i) => i !== index),
      }))
      setEditingIndices((prev) => {
        const next = new Set<number>()
        for (const idx of prev) {
          if (idx < index) next.add(idx)
          else if (idx > index) next.add(idx - 1)
        }
        return next
      })
    },
    [onUpdate]
  )

  const moveSection = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= sections.length) return
      // Close all cards when reordering
      setEditingIndices(new Set())
      onUpdate((prev) => {
        const next = [...prev.sections]
        ;[next[index], next[target]] = [next[target], next[index]]
        return { ...prev, sections: next }
      })
    },
    [sections.length, onUpdate]
  )

  const mergeSections = useCallback(
    (index: number) => {
      if (index >= sections.length - 1) return
      // Close all cards when merging
      setEditingIndices(new Set())
      onUpdate((prev) => {
        const merged: Section = {
          ...prev.sections[index],
          parts: [...prev.sections[index].parts, ...prev.sections[index + 1].parts],
        }
        return {
          ...prev,
          sections: [
            ...prev.sections.slice(0, index),
            merged,
            ...prev.sections.slice(index + 2),
          ],
        }
      })
    },
    [sections.length, onUpdate]
  )

  const addPart = useCallback(
    (sectionIndex: number, partId: string) => {
      // Build a SectionPart object from the available text groups / images
      const textGroup = textGroups.find((g) => g.groupId === partId)
      const image = images.find((img) => img.imageId === partId)

      // Try to reuse the existing part object if it's being moved from another section
      const findExistingPart = (sections: Section[]) => {
        for (const s of sections) {
          const existing = s.parts.find((p) =>
            p.type === "image" ? p.imageId === partId : p.groupId === partId
          )
          if (existing) return existing
        }
        return null
      }

      onUpdate((prev) => {
        const existingPart = findExistingPart(prev.sections)
        const newPart: Section["parts"][number] = existingPart
          ? existingPart
          : textGroup
            ? { type: "text_group" as const, groupId: textGroup.groupId, groupType: textGroup.groupType, texts: [], isPruned: false }
            : image
              ? { type: "image" as const, imageId: image.imageId, isPruned: image.isPruned }
              : { type: "text_group" as const, groupId: partId, groupType: "unknown", texts: [], isPruned: false }

        return {
          ...prev,
          sections: prev.sections.map((s, i) => {
            if (i === sectionIndex) {
              return { ...s, parts: [...s.parts, newPart] }
            }
            // Auto-move from other sections
            const hasIt = s.parts.some((p) =>
              p.type === "image" ? p.imageId === partId : p.groupId === partId
            )
            if (hasIt) {
              return { ...s, parts: s.parts.filter((p) =>
                p.type === "image" ? p.imageId !== partId : p.groupId !== partId
              ) }
            }
            return s
          }),
        }
      })
    },
    [onUpdate, textGroups, images]
  )

  const removePart = useCallback(
    (sectionIndex: number, partId: string) => {
      onUpdate((prev) => ({
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sectionIndex
            ? { ...s, parts: s.parts.filter((p) =>
                p.type === "image" ? p.imageId !== partId : p.groupId !== partId
              ) }
            : s
        ),
      }))
    },
    [onUpdate]
  )

  const addSection = useCallback(() => {
    onUpdate((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          sectionId: buildNextSectionId(pageId, prev.sections),
          sectionType: "text_only",
          parts: [],
          backgroundColor: "#ffffff",
          textColor: "#333333",
          pageNumber: null,
          isPruned: false,
        },
      ],
    }))
    // Auto-open the new section
    setEditingIndices((prev) => new Set(prev).add(sections.length))
  }, [pageId, sections.length, onUpdate])

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <div key={i}>
          {/* Reorder buttons above each card */}
          {editingIndices.has(i) && (
            <div className="mb-1 flex justify-center gap-1">
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
          )}
          <SectionCard
            section={section}
            index={i}
            isEditing={editingIndices.has(i)}
            isDirty={isSectionDirty(i)}
            isLast={i === sections.length - 1}
            onStartEdit={() => startEdit(i)}
            onStopEdit={() => stopEdit(i)}
            onUpdate={(patch) => updateSection(i, patch)}
            onDelete={() => deleteSection(i)}
            onMergeWithNext={() => mergeSections(i)}
            textGroups={textGroups}
            images={images}
            allPartIds={allPartIds}
            assignedPartIds={assignedPartIds}
            onAddPart={(partId) => addPart(i, partId)}
            onRemovePart={(partId) => removePart(i, partId)}
          />
        </div>
      ))}
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
            Click a section to edit it and add these parts.
          </p>
        </div>
      )}
    </div>
  )
}
