import { useState, useEffect } from "react"
import { Plus, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RENDER_TYPES } from "@/lib/config-constants"

export interface RenderStrategyState {
  render_type: string
  config: {
    prompt?: string
    model?: string
    max_retries?: string
    timeout?: string
    answer_prompt?: string
    template?: string
  }
}

export interface AdvancedLayoutPanelProps {
  defaultRenderStrategy: string
  onDefaultRenderStrategyChange: (value: string) => void
  renderStrategies: Record<string, RenderStrategyState>
  onRenderStrategiesChange: (strategies: Record<string, RenderStrategyState>) => void
  textTypes: Record<string, string>
  onTextTypesChange: (types: Record<string, string>) => void
  textGroupTypes: Record<string, string>
  onTextGroupTypesChange: (types: Record<string, string>) => void
  sectionTypes: Record<string, string>
  onSectionTypesChange: (types: Record<string, string>) => void
  prunedTextTypes: Set<string>
  onTogglePrunedText: (type: string) => void
  prunedSectionTypes: Set<string>
  onTogglePrunedSection: (type: string) => void
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h4>
      </button>
      {open && <div className="mt-2 pl-5">{children}</div>}
    </div>
  )
}

function KeyValueRow({
  entryKey,
  description,
  onKeyChange,
  onDescriptionChange,
  onRemove,
}: {
  entryKey: string
  description: string
  onKeyChange: (newKey: string) => void
  onDescriptionChange: (desc: string) => void
  onRemove?: () => void
}) {
  const [localKey, setLocalKey] = useState(entryKey)

  useEffect(() => {
    setLocalKey(entryKey)
  }, [entryKey])

  return (
    <div className="flex items-center gap-2">
      <Input
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={() => {
          const trimmed = localKey.trim()
          if (trimmed && trimmed !== entryKey) {
            onKeyChange(trimmed)
          }
          setLocalKey(entryKey)
        }}
        placeholder="type_name"
        className="h-7 text-xs w-40 font-mono"
      />
      <Input
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Description"
        className="h-7 text-xs flex-1"
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function KeyValueEditor({
  entries,
  onChange,
  canRemove = false,
  addLabel = "Add",
}: {
  entries: Record<string, string>
  onChange: (entries: Record<string, string>) => void
  canRemove?: boolean
  addLabel?: string
}) {
  const pairs = Object.entries(entries)

  const handleKeyChange = (oldKey: string, newKey: string) => {
    if (newKey in entries) return
    const result: Record<string, string> = {}
    for (const [k, v] of pairs) {
      result[k === oldKey ? newKey : k] = v
    }
    onChange(result)
  }

  const handleDescChange = (key: string, desc: string) => {
    onChange({ ...entries, [key]: desc })
  }

  const addEntry = () => {
    let name = "new_type"
    let i = 1
    while (name in entries) name = `new_type_${i++}`
    onChange({ ...entries, [name]: "" })
  }

  const removeEntry = (key: string) => {
    const next = { ...entries }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="space-y-1.5">
      {pairs.map(([key, desc]) => (
        <KeyValueRow
          key={key}
          entryKey={key}
          description={desc}
          onKeyChange={(newKey) => handleKeyChange(key, newKey)}
          onDescriptionChange={(newDesc) => handleDescChange(key, newDesc)}
          onRemove={canRemove ? () => removeEntry(key) : undefined}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={addEntry}
      >
        <Plus className="mr-1 h-3 w-3" />
        {addLabel}
      </Button>
    </div>
  )
}

function RenderStrategyEditor({
  name,
  strategy,
  onNameChange,
  onChange,
  onRemove,
}: {
  name: string
  strategy: RenderStrategyState
  onNameChange: (newName: string) => void
  onChange: (updated: RenderStrategyState) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const updateConfig = (field: string, value: string) => {
    onChange({
      ...strategy,
      config: { ...strategy.config, [field]: value || undefined },
    })
  }

  const showPromptFields = strategy.render_type === "llm" || strategy.render_type === "activity"
  const showTemplateField = strategy.render_type === "template"
  const showAnswerPrompt = strategy.render_type === "activity"

  return (
    <div className="rounded-md border bg-background p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
        </button>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="strategy name"
          className="h-7 text-xs font-medium flex-1"
        />
        <Select
          value={strategy.render_type}
          onValueChange={(v) => onChange({ ...strategy, render_type: v })}
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RENDER_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="pl-5 space-y-2">
          {showPromptFields && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Prompt</Label>
                  <Input
                    value={strategy.config.prompt ?? ""}
                    onChange={(e) => updateConfig("prompt", e.target.value)}
                    placeholder="e.g., web_generation_html"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Model</Label>
                  <Input
                    value={strategy.config.model ?? ""}
                    onChange={(e) => updateConfig("model", e.target.value)}
                    placeholder="e.g., openai:gpt-5.2"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Max Retries</Label>
                  <Input
                    type="number"
                    min={0}
                    value={strategy.config.max_retries ?? ""}
                    onChange={(e) => updateConfig("max_retries", e.target.value)}
                    placeholder="25"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Timeout (s)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={strategy.config.timeout ?? ""}
                    onChange={(e) => updateConfig("timeout", e.target.value)}
                    placeholder="180"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              {showAnswerPrompt && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Answer Prompt</Label>
                  <Input
                    value={strategy.config.answer_prompt ?? ""}
                    onChange={(e) => updateConfig("answer_prompt", e.target.value)}
                    placeholder="e.g., activity_multiple_choice_answers"
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </>
          )}
          {showTemplateField && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Template</Label>
              <Input
                value={strategy.config.template ?? ""}
                onChange={(e) => updateConfig("template", e.target.value)}
                placeholder="e.g., two_column_render"
                className="h-7 text-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AdvancedLayoutPanel({
  defaultRenderStrategy,
  onDefaultRenderStrategyChange,
  renderStrategies,
  onRenderStrategiesChange,
  textTypes,
  onTextTypesChange,
  textGroupTypes,
  onTextGroupTypesChange,
  sectionTypes,
  onSectionTypesChange,
  prunedTextTypes,
  onTogglePrunedText,
  prunedSectionTypes,
  onTogglePrunedSection,
}: AdvancedLayoutPanelProps) {
  const strategyNames = Object.keys(renderStrategies)
  const dropdownOptions = [
    "dynamic",
    ...strategyNames.filter((name) => renderStrategies[name]?.render_type !== "activity"),
  ]

  const addRenderStrategy = () => {
    const base = "new_strategy"
    let name = base
    let i = 1
    while (name in renderStrategies) {
      name = `${base}_${i++}`
    }
    onRenderStrategiesChange({
      ...renderStrategies,
      [name]: { render_type: "llm", config: {} },
    })
  }

  const removeRenderStrategy = (name: string) => {
    const next = { ...renderStrategies }
    delete next[name]
    onRenderStrategiesChange(next)
    if (defaultRenderStrategy === name && Object.keys(next).length > 0) {
      onDefaultRenderStrategyChange(Object.keys(next)[0])
    }
  }

  const renameRenderStrategy = (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return
    if (newName in renderStrategies) return
    const entries = Object.entries(renderStrategies).map(([k, v]) =>
      k === oldName ? [newName, v] : [k, v]
    )
    onRenderStrategiesChange(Object.fromEntries(entries))
    if (defaultRenderStrategy === oldName) {
      onDefaultRenderStrategyChange(newName)
    }
  }

  const updateRenderStrategy = (name: string, updated: RenderStrategyState) => {
    onRenderStrategiesChange({ ...renderStrategies, [name]: updated })
  }

  const allTextTypeKeys = Object.keys(textTypes)
  const allSectionTypeKeys = Object.keys(sectionTypes)

  return (
    <div className="space-y-4">
      {/* 1. Render Strategy — dropdown */}
      <div>
        <h4 className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Render Strategy
        </h4>
        <Select
          value={defaultRenderStrategy}
          onValueChange={onDefaultRenderStrategyChange}
        >
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="Select strategy..." />
          </SelectTrigger>
          <SelectContent>
            {dropdownOptions.map((name) => (
              <SelectItem key={name} value={name} className="text-xs">
                {name.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground mt-1">
          {defaultRenderStrategy === "dynamic"
            ? "Automatically picks the best strategy per section type"
            : "All sections rendered with this strategy"}
        </p>
      </div>

      {/* 2. Available Render Strategies — collapsed */}
      <CollapsibleSection title="Available Render Strategies">
        <div className="space-y-2">
          {Object.entries(renderStrategies).map(([name, strategy]) => (
            <RenderStrategyEditor
              key={name}
              name={name}
              strategy={strategy}
              onNameChange={(newName) => renameRenderStrategy(name, newName)}
              onChange={(updated) => updateRenderStrategy(name, updated)}
              onRemove={() => removeRenderStrategy(name)}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 text-xs"
          onClick={addRenderStrategy}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Strategy
        </Button>
      </CollapsibleSection>

      {/* 3. Text Types — collapsed */}
      <CollapsibleSection title="Text Types">
        <KeyValueEditor
          entries={textTypes}
          onChange={onTextTypesChange}
          addLabel="Add Text Type"
        />
      </CollapsibleSection>

      {/* 4. Text Groups — collapsed */}
      <CollapsibleSection title="Text Groups">
        <KeyValueEditor
          entries={textGroupTypes}
          onChange={onTextGroupTypesChange}
          canRemove
          addLabel="Add Text Group"
        />
      </CollapsibleSection>

      {/* 5. Section Types — collapsed */}
      <CollapsibleSection title="Section Types">
        <KeyValueEditor
          entries={sectionTypes}
          onChange={onSectionTypesChange}
          addLabel="Add Section Type"
        />
      </CollapsibleSection>

      {/* 6. Text Filters — collapsed */}
      <CollapsibleSection title="Text Filters">
        <p className="text-[10px] text-muted-foreground mb-2">
          Active (filled) types are excluded from rendering
        </p>
        <div className="flex flex-wrap gap-1.5">
          {allTextTypeKeys.map((t) => (
            <Badge
              key={t}
              variant={prunedTextTypes.has(t) ? "default" : "outline"}
              className="cursor-pointer text-[10px]"
              onClick={() => onTogglePrunedText(t)}
            >
              {t.replace(/_/g, " ")}
            </Badge>
          ))}
          {allTextTypeKeys.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              No text types defined
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* 7. Section Filters — collapsed */}
      <CollapsibleSection title="Section Filters">
        <p className="text-[10px] text-muted-foreground mb-2">
          Active (filled) sections are excluded from rendering
        </p>
        <div className="flex flex-wrap gap-1.5">
          {allSectionTypeKeys.map((t) => (
            <Badge
              key={t}
              variant={prunedSectionTypes.has(t) ? "default" : "outline"}
              className="cursor-pointer text-[10px]"
              onClick={() => onTogglePrunedSection(t)}
            >
              {t.replace(/_/g, " ")}
            </Badge>
          ))}
          {allSectionTypeKeys.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              No section types defined
            </p>
          )}
        </div>
      </CollapsibleSection>
    </div>
  )
}
