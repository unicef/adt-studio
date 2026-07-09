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
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { ModelSelect, LLM_MODEL_GROUPS } from "@/components/pipeline/components/ModelSelect"

type TabKey = "openai" | "anthropic" | "google" | "custom" | "azure"
type TextProviderKey = "openai" | "anthropic" | "google" | "custom"

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
  providerDefaultModels: Record<TextProviderKey, string>
  onSaveProviderDefaultModel: (provider: TextProviderKey, model: string) => void
}

function isValidOpenAIKey(key: string): boolean {
  return key.trim().length > 0 && key.trim().startsWith("sk-")
}

const TEXT_PROVIDER_ORDER: TextProviderKey[] = ["openai", "anthropic", "google", "custom"]

export function ApiKeyDialog({
  open,
  onOpenChange,
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
  providerDefaultModels,
  onSaveProviderDefaultModel,
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
  const [defaultModelDrafts, setDefaultModelDrafts] = useState(providerDefaultModels)
  const [activeProviderDraft, setActiveProviderDraft] = useState(() => {
    try {
      return localStorage.getItem("adt-studio-active-provider") ?? ""
    } catch {
      return ""
    }
  })
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
      setDefaultModelDrafts(providerDefaultModels)
      try {
        setActiveProviderDraft(localStorage.getItem("adt-studio-active-provider") ?? "")
      } catch {
        setActiveProviderDraft("")
      }
    }
    prevOpenRef.current = open
  }, [open, apiKey, anthropicKey, googleKey, customBaseUrl, customApiKey, azureKey, azureRegion])

  const draftConfiguredProviders: Record<TextProviderKey, boolean> = {
    openai: isValidOpenAIKey(openaiDraft),
    anthropic: anthropicDraft.trim().length > 0,
    google: googleDraft.trim().length > 0,
    custom: customBaseUrlDraft.trim().length > 0,
  }

  // Count only the current drafts. If a user clears OpenAI, it should stop
  // acting configured immediately instead of falling back to the saved prop.
  const configuredProviderCount = TEXT_PROVIDER_ORDER
    .filter((provider) => draftConfiguredProviders[provider])
    .length

  function handleSave() {
    // Save all tabs — not just the active one
    const trimmedOpenai = openaiDraft.trim()
    if (isValidOpenAIKey(trimmedOpenai) || trimmedOpenai === "") onSaveApiKey(trimmedOpenai)

    onSaveAnthropicKey(anthropicDraft.trim())
    onSaveGoogleKey(googleDraft.trim())
    onSaveCustomBaseUrl(customBaseUrlDraft.trim())
    onSaveCustomApiKey(customApiKeyDraft.trim())
    onSaveAzureKey(azureKeyDraft.trim())
    onSaveAzureRegion(azureRegionDraft.trim())
    for (const provider of TEXT_PROVIDER_ORDER) {
      onSaveProviderDefaultModel(provider, defaultModelDrafts[provider].trim())
    }

    // Save the active provider preference only if that provider is configured.
    // Otherwise fall back to the first configured provider in the same order
    // used by the rest of the app.
    const resolvedActiveProvider =
      activeProviderDraft && draftConfiguredProviders[activeProviderDraft as TextProviderKey]
        ? activeProviderDraft
        : (TEXT_PROVIDER_ORDER.find((provider) => draftConfiguredProviders[provider]) ?? "")

    try {
      if (resolvedActiveProvider) {
        localStorage.setItem("adt-studio-active-provider", resolvedActiveProvider)
      } else {
        localStorage.removeItem("adt-studio-active-provider")
      }
      window.dispatchEvent(new CustomEvent("adt:api-setting-changed", {
        detail: { key: "adt-studio-active-provider", value: resolvedActiveProvider },
      }))
    } catch {
      // localStorage unavailable
    }

    onOpenChange(false)
  }

  // Check if there are any meaningful changes to save
  const savedActiveProvider = (() => { try { return localStorage.getItem("adt-studio-active-provider") ?? "" } catch { return "" } })()
  const hasChanges =
    openaiDraft.trim() !== apiKey.trim() ||
    anthropicDraft.trim() !== anthropicKey.trim() ||
    googleDraft.trim() !== googleKey.trim() ||
    customBaseUrlDraft.trim() !== customBaseUrl.trim() ||
    customApiKeyDraft.trim() !== customApiKey.trim() ||
    azureKeyDraft.trim() !== azureKey.trim() ||
    azureRegionDraft.trim() !== azureRegion.trim()
    || Object.entries(defaultModelDrafts).some(([provider, model]) => model.trim() !== providerDefaultModels[provider as keyof typeof providerDefaultModels].trim())
    || activeProviderDraft !== savedActiveProvider

  // Validate the OpenAI key if it was changed to a non-empty value
  const openaiValid = openaiDraft.trim() === "" || openaiDraft.trim() === apiKey.trim() || isValidOpenAIKey(openaiDraft)
  const canSave = hasChanges && openaiValid

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle><Trans>API Keys</Trans></DialogTitle>
          <DialogDescription>
            <Trans>Configure API keys for AI pipeline features.</Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b mb-3">
          {tabs.map((item) => {
            const isSaved =
              item.key === "openai" ? apiKey.length > 0
                : item.key === "anthropic" ? anthropicKey.length > 0
                  : item.key === "google" ? googleKey.length > 0
                    : item.key === "custom" ? customBaseUrl.length > 0
                      : azureKey.length > 0
            const isDefault =
              item.key !== "azure" &&
              draftConfiguredProviders[item.key] &&
              activeProviderDraft === item.key &&
              configuredProviderCount > 1
            return (
              <button
                key={item.key}
                onClick={() => { setTab(item.key); setShowKey(false) }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  tab === item.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                {isSaved && <Check className="h-3 w-3 text-green-500" />}
                {isDefault && (
                  <span className="rounded bg-green-100 px-1 py-px text-[10px] font-medium text-green-700">✦</span>
                )}
              </button>
            )
          })}
        </div>

        {tab === "openai" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="openai-key-input">
                <Trans>OpenAI API Key</Trans>
              </Label>
              {configuredProviderCount > 1 && (
                activeProviderDraft === "openai" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                    <Check className="h-3 w-3" />
                    <Trans>default</Trans>
                  </span>
                ) : draftConfiguredProviders.openai ? (
                  <button
                    type="button"
                    onClick={() => setActiveProviderDraft("openai")}
                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Trans>Mark as default</Trans>
                  </button>
                ) : null
              )}
            </div>
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
                tabIndex={-1}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="anthropic-key-input">
                <Trans>Anthropic API Key</Trans>
              </Label>
              {configuredProviderCount > 1 && (
                activeProviderDraft === "anthropic" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                    <Check className="h-3 w-3" />
                    <Trans>default</Trans>
                  </span>
                ) : draftConfiguredProviders.anthropic ? (
                  <button
                    type="button"
                    onClick={() => setActiveProviderDraft("anthropic")}
                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Trans>Mark as default</Trans>
                  </button>
                ) : null
              )}
            </div>
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
                tabIndex={-1}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="google-key-input">
                <Trans>Google AI API Key</Trans>
              </Label>
              {configuredProviderCount > 1 && (
                activeProviderDraft === "google" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                    <Check className="h-3 w-3" />
                    <Trans>default</Trans>
                  </span>
                ) : draftConfiguredProviders.google ? (
                  <button
                    type="button"
                    onClick={() => setActiveProviderDraft("google")}
                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Trans>Mark as default</Trans>
                  </button>
                ) : null
              )}
            </div>
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
                tabIndex={-1}
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
              <div className="flex items-center justify-between">
                <Label htmlFor="custom-base-url-input">
                  <Trans>Base URL</Trans>
                </Label>
                {configuredProviderCount > 1 && (
                  activeProviderDraft === "custom" ? (
                    <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                      <Check className="h-3 w-3" />
                      <Trans>default</Trans>
                    </span>
                  ) : draftConfiguredProviders.custom ? (
                    <button
                      type="button"
                      onClick={() => setActiveProviderDraft("custom")}
                      className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Trans>Mark as default</Trans>
                    </button>
                  ) : null
                )}
              </div>
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
                  tabIndex={-1}
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
                  tabIndex={-1}
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

        {tab !== "azure" && tab !== "custom" && <div className="space-y-2 rounded-md border p-3">
          <Label><Trans>Default AI model</Trans></Label>
          <ModelSelect
            value={defaultModelDrafts[tab]}
            onChange={(model) => setDefaultModelDrafts((current) => ({ ...current, [tab]: model }))}
            groups={LLM_MODEL_GROUPS.filter((group) => group.provider === tab)}
            placeholder={t`Provider default model`}
          />
          <p className="text-xs text-muted-foreground">
            <Trans>Used by default when this provider's API key is selected.</Trans>
          </p>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            <Trans>Save</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
