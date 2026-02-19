import { useState, useEffect } from "react"
import { Eye, EyeOff, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "openai", label: "OpenAI" },
  { key: "azure", label: "Azure Speech" },
] as const

type TabKey = (typeof TABS)[number]["key"]

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: string
  onSaveApiKey: (key: string) => void
  azureKey: string
  onSaveAzureKey: (key: string) => void
  azureRegion: string
  onSaveAzureRegion: (region: string) => void
}

function isValidOpenAIKey(key: string): boolean {
  return key.trim().length > 0 && key.trim().startsWith("sk-")
}

export function ApiKeyDialog({
  open,
  onOpenChange,
  apiKey,
  onSaveApiKey,
  azureKey,
  onSaveAzureKey,
  azureRegion,
  onSaveAzureRegion,
}: ApiKeyDialogProps) {
  const [tab, setTab] = useState<TabKey>("openai")
  const [openaiDraft, setOpenaiDraft] = useState(apiKey)
  const [azureKeyDraft, setAzureKeyDraft] = useState(azureKey)
  const [azureRegionDraft, setAzureRegionDraft] = useState(azureRegion)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (open) {
      setOpenaiDraft(apiKey)
      setAzureKeyDraft(azureKey)
      setAzureRegionDraft(azureRegion)
      setShowKey(false)
    }
  }, [open, apiKey, azureKey, azureRegion])

  function handleSave() {
    // Save the current tab's credentials
    if (tab === "openai") {
      const trimmed = openaiDraft.trim()
      if (isValidOpenAIKey(trimmed)) {
        onSaveApiKey(trimmed)
      }
    } else {
      const trimmedKey = azureKeyDraft.trim()
      const trimmedRegion = azureRegionDraft.trim()
      if (trimmedKey) onSaveAzureKey(trimmedKey)
      if (trimmedRegion) onSaveAzureRegion(trimmedRegion)
    }
    onOpenChange(false)
  }

  const canSave =
    tab === "openai"
      ? isValidOpenAIKey(openaiDraft)
      : azureKeyDraft.trim().length > 0 && azureRegionDraft.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
          <DialogDescription>
            Configure API keys for AI pipeline features.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b mb-3">
          {TABS.map((t) => {
            const isSaved =
              t.key === "openai" ? apiKey.length > 0 : azureKey.length > 0
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setShowKey(false) }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {isSaved && <Check className="h-3 w-3 text-green-500" />}
              </button>
            )
          })}
        </div>

        {tab === "openai" && (
          <div className="space-y-2">
            <Label htmlFor="openai-key-input">OpenAI API Key</Label>
            <div className="relative">
              <Input
                id="openai-key-input"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={openaiDraft}
                onChange={(e) => setOpenaiDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10"
                onClick={() => setShowKey(!showKey)}
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {openaiDraft.length > 0 && !isValidOpenAIKey(openaiDraft) && (
              <p className="text-sm text-destructive">Key must start with &quot;sk-&quot;</p>
            )}
          </div>
        )}

        {tab === "azure" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="azure-key-input">Subscription Key</Label>
              <div className="relative">
                <Input
                  id="azure-key-input"
                  type={showKey ? "text" : "password"}
                  placeholder="Azure Speech subscription key"
                  value={azureKeyDraft}
                  onChange={(e) => setAzureKeyDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowKey(!showKey)}
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="azure-region-input">Region</Label>
              <Input
                id="azure-region-input"
                placeholder="e.g. eastus, westeurope"
                value={azureRegionDraft}
                onChange={(e) => setAzureRegionDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
