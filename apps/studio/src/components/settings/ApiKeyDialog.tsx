import { useState, useEffect, useRef } from "react"
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
import { toast } from "@/components/ui/sonner"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"

type TabKey = "openai" | "anthropic" | "google" | "custom" | "azure"

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  embedded?: boolean
  apiKey: string
  onSaveApiKey: (key: string) => void
  anthropicKey: string
  onSaveAnthropicKey: (key: string) => void
  googleKey: string
  onSaveGoogleKey: (key: string) => void
  customBaseUrl: string
  onSaveCustomBaseUrl: (url: string) => void
  customApiKey: string
  onSaveCustomApiKey: (key: string) => void
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
  embedded = false,
  apiKey,
  onSaveApiKey,
  anthropicKey,
  onSaveAnthropicKey,
  googleKey,
  onSaveGoogleKey,
  customBaseUrl,
  onSaveCustomBaseUrl,
  customApiKey,
  onSaveCustomApiKey,
  azureKey,
  onSaveAzureKey,
  azureRegion,
  onSaveAzureRegion,
}: ApiKeyDialogProps) {
  const { t } = useLingui()
  const [tab, setTab] = useState<TabKey>("openai")
  const [openaiDraft, setOpenaiDraft] = useState(apiKey)
  const [anthropicDraft, setAnthropicDraft] = useState(anthropicKey)
  const [googleDraft, setGoogleDraft] = useState(googleKey)
  const [customBaseUrlDraft, setCustomBaseUrlDraft] = useState(customBaseUrl)
  const [customApiKeyDraft, setCustomApiKeyDraft] = useState(customApiKey)
  const [azureKeyDraft, setAzureKeyDraft] = useState(azureKey)
  const [azureRegionDraft, setAzureRegionDraft] = useState(azureRegion)
  const [showKey, setShowKey] = useState(false)
  const prevOpenRef = useRef(false)

  const tabs = [
    { key: "openai" as const, label: t`OpenAI` },
    { key: "anthropic" as const, label: t`Anthropic` },
    { key: "google" as const, label: t`Google` },
    { key: "custom" as const, label: t`Custom` },
    { key: "azure" as const, label: t`Azure` },
  ]

  // Reset drafts only when dialog opens (not on every prop change while open)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setOpenaiDraft(apiKey)
      setAnthropicDraft(anthropicKey)
      setGoogleDraft(googleKey)
      setCustomBaseUrlDraft(customBaseUrl)
      setCustomApiKeyDraft(customApiKey)
      setAzureKeyDraft(azureKey)
      setAzureRegionDraft(azureRegion)
      setShowKey(false)
    }
    prevOpenRef.current = open
  }, [open, apiKey, anthropicKey, googleKey, customBaseUrl, customApiKey, azureKey, azureRegion])

  function handleSave() {
    // Save all tabs, not just the active one.
    const trimmedOpenai = openaiDraft.trim()
    if (isValidOpenAIKey(trimmedOpenai) || trimmedOpenai === "") onSaveApiKey(trimmedOpenai)

    onSaveAnthropicKey(anthropicDraft.trim())
    onSaveGoogleKey(googleDraft.trim())
    onSaveCustomBaseUrl(customBaseUrlDraft.trim())
    onSaveCustomApiKey(customApiKeyDraft.trim())
    onSaveAzureKey(azureKeyDraft.trim())
    onSaveAzureRegion(azureRegionDraft.trim())

    if (embedded) toast.success(t`API keys saved.`)
    if (!embedded) onOpenChange(false)
  }

  // Check if there are any meaningful changes to save
  const hasChanges =
    openaiDraft.trim() !== apiKey.trim() ||
    anthropicDraft.trim() !== anthropicKey.trim() ||
    googleDraft.trim() !== googleKey.trim() ||
    customBaseUrlDraft.trim() !== customBaseUrl.trim() ||
    customApiKeyDraft.trim() !== customApiKey.trim() ||
    azureKeyDraft.trim() !== azureKey.trim() ||
    azureRegionDraft.trim() !== azureRegion.trim()

  // Validate the OpenAI key if it was changed to a non-empty value
  const openaiValid = openaiDraft.trim() === "" || openaiDraft.trim() === apiKey.trim() || isValidOpenAIKey(openaiDraft)
  const canSave = hasChanges && openaiValid

  const content = (
    <>
        {!embedded && (
          <DialogHeader>
            <DialogTitle><Trans>API Keys</Trans></DialogTitle>
            <DialogDescription>
              <Trans>Configure API keys for AI pipeline features.</Trans>
            </DialogDescription>
          </DialogHeader>
        )}

        <div className="flex gap-1 border-b mb-3">
          {tabs.map((item) => {
            const isSaved =
              item.key === "openai" ? apiKey.length > 0
                : item.key === "anthropic" ? anthropicKey.length > 0
                  : item.key === "google" ? googleKey.length > 0
                    : item.key === "custom" ? customBaseUrl.length > 0
                      : azureKey.length > 0
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => { setTab(item.key); setShowKey(false) }}
                className={cn(
                  "flex min-h-11 items-center gap-1 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  tab === item.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                {isSaved && <Check className="h-3 w-3 text-green-500" />}
              </button>
            )
          })}
        </div>

        {tab === "openai" && (
          <div className="space-y-2">
            <Label htmlFor="openai-key-input">
              <Trans>OpenAI API Key</Trans>
            </Label>
            <div className="relative">
              <Input
                id="openai-key-input"
                type={showKey ? "text" : "password"}
                placeholder={t`sk-...`}
                value={openaiDraft}
                onChange={(e) => setOpenaiDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? t`Hide API key` : t`Show API key`}
                title={showKey ? t`Hide API key` : t`Show API key`}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {openaiDraft.length > 0 && !isValidOpenAIKey(openaiDraft) && (
              <p className="text-sm text-destructive">
                <Trans>Key must start with "sk-"</Trans>
              </p>
            )}
          </div>
        )}

        {tab === "anthropic" && (
          <div className="space-y-2">
            <Label htmlFor="anthropic-key-input">
              <Trans>Anthropic API Key</Trans>
            </Label>
            <div className="relative">
              <Input
                id="anthropic-key-input"
                type={showKey ? "text" : "password"}
                placeholder={t`sk-ant-...`}
                value={anthropicDraft}
                onChange={(e) => setAnthropicDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? t`Hide API key` : t`Show API key`}
                title={showKey ? t`Hide API key` : t`Show API key`}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>
                Used for Claude models (claude-opus-4-6, claude-sonnet-4-6, etc.)
              </Trans>
            </p>
          </div>
        )}

        {tab === "google" && (
          <div className="space-y-2">
            <Label htmlFor="google-key-input">
              <Trans>Google AI API Key</Trans>
            </Label>
            <div className="relative">
              <Input
                id="google-key-input"
                type={showKey ? "text" : "password"}
                placeholder={t`AIza...`}
                value={googleDraft}
                onChange={(e) => setGoogleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? t`Hide API key` : t`Show API key`}
                title={showKey ? t`Hide API key` : t`Show API key`}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>
                Used for Gemini models — both LLM (gemini-2.5-pro, etc.) and TTS (gemini-2.5-pro-preview-tts, etc.)
              </Trans>
            </p>
          </div>
        )}

        {tab === "custom" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="custom-base-url-input">
                <Trans>Base URL</Trans>
              </Label>
              <Input
                id="custom-base-url-input"
                placeholder={t`e.g. http://localhost:11434/v1`}
                value={customBaseUrlDraft}
                onChange={(e) => setCustomBaseUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-api-key-input">
                <Trans>API Key (optional)</Trans>
              </Label>
              <div className="relative">
                <Input
                  id="custom-api-key-input"
                  type={showKey ? "text" : "password"}
                  placeholder={t`Leave empty if not required`}
                  value={customApiKeyDraft}
                  onChange={(e) => setCustomApiKeyDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? t`Hide API key` : t`Show API key`}
                  title={showKey ? t`Hide API key` : t`Show API key`}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>
                Any OpenAI-compatible endpoint (Ollama, vLLM, Together AI, etc.). Use the "custom:" prefix when selecting models, e.g. custom:llama3.
              </Trans>
            </p>
          </div>
        )}

        {tab === "azure" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="azure-key-input">
                <Trans>Azure Speech Subscription Key</Trans>
              </Label>
              <div className="relative">
                <Input
                  id="azure-key-input"
                  type={showKey ? "text" : "password"}
                  placeholder={t`Azure Speech subscription key`}
                  value={azureKeyDraft}
                  onChange={(e) => setAzureKeyDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? t`Hide API key` : t`Show API key`}
                  title={showKey ? t`Hide API key` : t`Show API key`}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="azure-region-input">
                <Trans>Region</Trans>
              </Label>
              <Input
                id="azure-region-input"
                placeholder={t`e.g. eastus, westeurope`}
                value={azureRegionDraft}
                onChange={(e) => setAzureRegionDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave() }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>Used for Azure Speech TTS provider.</Trans>
            </p>
          </div>
        )}

        <DialogFooter>
          {!embedded && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
          )}
          <Button onClick={handleSave} disabled={!canSave}>
            <Trans>Save</Trans>
          </Button>
        </DialogFooter>
    </>
  )

  if (embedded) {
    return (
      <div className="rounded-xl border bg-card p-5">
        {content}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{content}</DialogContent>
    </Dialog>
  )
}
