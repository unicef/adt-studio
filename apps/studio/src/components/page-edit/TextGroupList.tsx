import { useState, useCallback } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TextGroupCard } from "./TextGroupCard"
import type { PageDetail } from "@/api/client"

type TextClassification = NonNullable<PageDetail["textClassification"]>
type TextGroup = TextClassification["groups"][number]

interface TextGroupListProps {
  groups: TextClassification["groups"]
  draftGroups: TextClassification | null
  serverGroups: TextClassification | null
  onUpdate: (updater: (prev: TextClassification) => TextClassification) => void
  audioMap?: Map<string, string>
}

export function TextGroupList({ groups, draftGroups, serverGroups, onUpdate, audioMap }: TextGroupListProps) {
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  const startEdit = useCallback((groupId: string) => {
    setEditingIds((prev) => new Set(prev).add(groupId))
  }, [])

  const stopEdit = useCallback((groupId: string) => {
    setEditingIds((prev) => {
      const next = new Set(prev)
      next.delete(groupId)
      return next
    })
  }, [])

  const isGroupDirty = (group: TextGroup): boolean => {
    if (!draftGroups || !serverGroups) return false
    const serverGroup = serverGroups.groups.find((g) => g.groupId === group.groupId)
    if (!serverGroup) return true // New group
    return JSON.stringify(group) !== JSON.stringify(serverGroup)
  }

  const updateGroup = useCallback(
    (groupId: string, updated: TextGroup) => {
      onUpdate((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.groupId === groupId ? updated : g)),
      }))
    },
    [onUpdate]
  )

  const removeGroup = useCallback(
    (groupId: string) => {
      onUpdate((prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.groupId !== groupId),
      }))
      setEditingIds((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    },
    [onUpdate]
  )

  const addGroup = useCallback(() => {
    const existingIds = new Set(groups.map((g) => g.groupId))
    let counter = groups.length + 1
    let newId = `custom_g${counter}`
    while (existingIds.has(newId)) {
      counter++
      newId = `custom_g${counter}`
    }
    onUpdate((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          groupId: newId,
          groupType: "paragraph",
          texts: [{ textType: "paragraph", text: "", isPruned: false }],
        },
      ],
    }))
    // Auto-open the new group in edit mode
    setEditingIds((prev) => new Set(prev).add(newId))
  }, [groups, onUpdate])

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <TextGroupCard
          key={group.groupId}
          group={group}
          isEditing={editingIds.has(group.groupId)}
          isDirty={isGroupDirty(group)}
          onStartEdit={() => startEdit(group.groupId)}
          onStopEdit={() => stopEdit(group.groupId)}
          onUpdate={(updated) => updateGroup(group.groupId, updated)}
          onRemove={() => removeGroup(group.groupId)}
          audioMap={audioMap}
        />
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
