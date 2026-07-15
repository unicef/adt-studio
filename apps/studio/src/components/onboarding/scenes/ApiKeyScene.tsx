import { useCallback, useState } from "react";
import { KeyRound, Eye, EyeOff, Check } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useApiKey } from "@/hooks/use-api-key";
import type { OnboardingStepProps } from "../steps";

type TabKey = "openai" | "anthropic" | "google" | "custom" | "azure";

const TAB_KEYS: TabKey[] = [
  "openai",
  "anthropic",
  "google",
  "custom",
  "azure",
];

function isValidOpenAIKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length > 0 && trimmed.startsWith("sk-");
}

function AnimatedTabsContent({
  value,
  active,
  children,
}: {
  value: TabKey;
  active: TabKey;
  children: React.ReactNode;
}) {
  const ownIdx = TAB_KEYS.indexOf(value);
  const activeIdx = TAB_KEYS.indexOf(active);
  const isActive = value === active;
  const offset = ownIdx - activeIdx;
  const translate = isActive ? 0 : offset > 0 ? 24 : -24;
  return (
    <TabsContent
      value={value}
      forceMount
      style={{
        gridArea: "1 / 1",
        display: "block",
        transform: `translateX(${translate}px)`,
        opacity: isActive ? 1 : 0,
      }}
      className={cn(
        "mt-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        !isActive && "pointer-events-none",
      )}
    >
      {children}
    </TabsContent>
  );
}

export function ApiKeyStep(_props: OnboardingStepProps) {
  const { t } = useLingui();
  const {
    apiKey,
    setApiKey,
    anthropicKey,
    setAnthropicKey,
    googleKey,
    setGoogleKey,
    setGeminiKey,
    customBaseUrl,
    setCustomBaseUrl,
    customApiKey,
    setCustomApiKey,
    azureKey,
    setAzureKey,
    azureRegion,
    setAzureRegion,
  } = useApiKey();

  const [tab, setTab] = useState<TabKey>("openai");
  const [showKey, setShowKey] = useState(false);

  const handleGoogleChange = useCallback(
    (value: string) => {
      setGoogleKey(value);
      setGeminiKey(value);
    },
    [setGoogleKey, setGeminiKey],
  );

  const tabs: { key: TabKey; label: string; isSaved: boolean }[] = [
    { key: "openai", label: t`OpenAI`, isSaved: apiKey.length > 0 },
    { key: "anthropic", label: t`Anthropic`, isSaved: anthropicKey.length > 0 },
    { key: "google", label: t`Google`, isSaved: googleKey.length > 0 },
    { key: "custom", label: t`Custom`, isSaved: customBaseUrl.length > 0 },
    { key: "azure", label: t`Azure`, isSaved: azureKey.length > 0 },
  ];

  const passwordInputClass = "h-11 rounded-xl pr-10";
  const eyeToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-0 top-0 h-11 w-11"
      onClick={() => setShowKey((v) => !v)}
      tabIndex={-1}
    >
      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );

  return (
    <div className="relative flex h-full w-full items-center justify-center p-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="animate-onboarding-icon-float flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          <KeyRound className="h-8 w-8" />
        </div>

        <div className="space-y-3 flex flex-col items-center">
          <h2 className="animate-onboarding-fade-up text-4xl font-semibold tracking-tight text-foreground md:text-5xl [animation-delay:100ms]">
            <Trans>Connect an AI provider</Trans>
          </h2>
          <p className="animate-onboarding-fade-up max-w-lg text-base leading-relaxed text-muted-foreground [animation-delay:220ms]">
            <Trans>
              ADT Studio uses your own API keys to run the pipeline. Keys are
              stored locally on this device and never sent anywhere else.
            </Trans>
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as TabKey);
            setShowKey(false);
          }}
          className="animate-onboarding-fade-up flex w-full flex-col gap-4 text-left [animation-delay:340ms]"
        >
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 text-muted-foreground">
            {tabs.map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                className="-mb-px flex items-center gap-1 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-2 py-1.5 text-xs font-medium shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none cursor-pointer"
              >
                {item.label}
                {item.isSaved && <Check className="h-3 w-3 text-primary" />}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="relative grid overflow-hidden px-2 py-2">
            <AnimatedTabsContent value="openai" active={tab}>
              <div className="space-y-2">
                <Label htmlFor="onb-openai-key">
                  <Trans>OpenAI API Key</Trans>
                </Label>
                <div className="relative">
                  <Input
                    id="onb-openai-key"
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t`sk-...`}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className={passwordInputClass}
                  />
                  {eyeToggle}
                </div>
                {apiKey.length > 0 && !isValidOpenAIKey(apiKey) && (
                  <p className="text-xs text-destructive">
                    <Trans>Key must start with sk-</Trans>
                  </p>
                )}
              </div>
            </AnimatedTabsContent>

            <AnimatedTabsContent value="anthropic" active={tab}>
              <div className="space-y-2">
                <Label htmlFor="onb-anthropic-key">
                  <Trans>Anthropic API Key</Trans>
                </Label>
                <div className="relative">
                  <Input
                    id="onb-anthropic-key"
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t`sk-ant-...`}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    className={passwordInputClass}
                  />
                  {eyeToggle}
                </div>
                <p className="text-xs text-muted-foreground">
                  <Trans>
                    Used for Claude models (claude-opus-4-6, claude-sonnet-4-6,
                    etc.)
                  </Trans>
                </p>
              </div>
            </AnimatedTabsContent>

            <AnimatedTabsContent value="google" active={tab}>
              <div className="space-y-2">
                <Label htmlFor="onb-google-key">
                  <Trans>Google AI API Key</Trans>
                </Label>
                <div className="relative">
                  <Input
                    id="onb-google-key"
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t`AIza...`}
                    value={googleKey}
                    onChange={(e) => handleGoogleChange(e.target.value)}
                    className={passwordInputClass}
                  />
                  {eyeToggle}
                </div>
                <p className="text-xs text-muted-foreground">
                  <Trans>
                    Used for Gemini models — both LLM (gemini-2.5-pro, etc.) and
                    TTS (gemini-2.5-pro-preview-tts, etc.)
                  </Trans>
                </p>
              </div>
            </AnimatedTabsContent>

            <AnimatedTabsContent value="custom" active={tab}>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="onb-custom-base-url">
                    <Trans>Base URL</Trans>
                  </Label>
                  <Input
                    id="onb-custom-base-url"
                    placeholder={t`e.g. http://localhost:11434/v1`}
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onb-custom-api-key">
                    <Trans>API Key (optional)</Trans>
                  </Label>
                  <div className="relative">
                    <Input
                      id="onb-custom-api-key"
                      type={showKey ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t`Leave empty if not required`}
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className={passwordInputClass}
                    />
                    {eyeToggle}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  <Trans>
                    Any OpenAI-compatible endpoint (Ollama, vLLM, Together AI,
                    etc.). Use the "custom:" prefix when selecting models, e.g.
                    custom:llama3.
                  </Trans>
                </p>
              </div>
            </AnimatedTabsContent>

            <AnimatedTabsContent value="azure" active={tab}>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="onb-azure-key">
                    <Trans>Azure Speech Subscription Key</Trans>
                  </Label>
                  <div className="relative">
                    <Input
                      id="onb-azure-key"
                      type={showKey ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t`Azure Speech subscription key`}
                      value={azureKey}
                      onChange={(e) => setAzureKey(e.target.value)}
                      className={passwordInputClass}
                    />
                    {eyeToggle}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onb-azure-region">
                    <Trans>Region</Trans>
                  </Label>
                  <Input
                    id="onb-azure-region"
                    placeholder={t`e.g. eastus, westeurope`}
                    value={azureRegion}
                    onChange={(e) => setAzureRegion(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  <Trans>Used for Azure Speech TTS provider.</Trans>
                </p>
              </div>
            </AnimatedTabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
