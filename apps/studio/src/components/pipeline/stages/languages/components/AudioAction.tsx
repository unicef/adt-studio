import { useRef, type ChangeEvent } from "react"
import { Loader2, Type, Upload, WandSparkles } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { getAudioUrl, type WordTimestamp, type WordTimestampEntry } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { WaveformPlayer } from "./WaveformPlayer"
import { WordTimestampViewer } from "./WordTimestampViewer"

export function AudioAction({
  audio,
  audioLang,
  bookLabel,
  textId,
  canGenerate,
  hasGeminiKey,
  onGenerate,
  isGenerating,
  onUpload,
  isUploading,
  errorMessage,
  timestamps,
  onTranscribe,
  isTranscribing,
  hasOpenaiKey,
  onTimeUpdate,
  onPlayingChange,
  onSaveTimestamps,
  isSavingTimestamps,
  timestampColumns = 2,
  accent,
}: {
  audio?: { fileName: string; voice: string; cacheKey?: string };
  audioLang: string | null;
  bookLabel: string;
  textId: string;
  canGenerate: boolean;
  hasGeminiKey: boolean;
  onGenerate: (textId: string) => void;
  isGenerating: boolean;
  onUpload?: (textId: string, file: File) => void;
  isUploading?: boolean;
  errorMessage?: string;
  timestamps?: WordTimestampEntry;
  onTranscribe?: (textId: string) => void;
  isTranscribing?: boolean;
  hasOpenaiKey?: boolean;
  onTimeUpdate?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onSaveTimestamps?: (words: WordTimestamp[], duration: number) => void;
  isSavingTimestamps?: boolean;
  timestampColumns?: number;
  /** Hex accent for the waveform. Omitted keeps the classic pink. */
  accent?: string;
}) {
  const { t } = useLingui();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !onUpload) return;
    onUpload(textId, file);
  };

  const uploadButton =
    onUpload && audioLang ? (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant={audio ? "ghost" : "outline"}
          size="sm"
          className="h-7 px-2 text-[10px]"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          title={
            audio ? t`Replace this audio file` : t`Upload your own audio file`
          }
        >
          {isUploading ? (
            <Loader2 className={cn("h-3 w-3 animate-spin", !audio && "mr-1")} />
          ) : (
            <Upload className={cn("h-3 w-3", !audio && "mr-1")} />
          )}
          {!audio && t`Upload`}
        </Button>
      </>
    ) : null;

  if (audio && audioLang) {
    return (
      <div>
        {uploadButton && (
          <div className="mb-1 flex justify-end">{uploadButton}</div>
        )}
        <WaveformPlayer
          key={`${audioLang}:${audio.fileName}:${audio.cacheKey ?? ""}`}
          audioUrl={getAudioUrl(
            bookLabel,
            audioLang,
            audio.fileName,
            audio.cacheKey,
          )}
          onTimeUpdate={onTimeUpdate}
          onPlayingChange={onPlayingChange}
          accent={accent}
        />
        {timestamps ? (
          <WordTimestampViewer
            timestamps={timestamps}
            onSave={
              onSaveTimestamps
                ? (words, duration) => onSaveTimestamps(words, duration)
                : undefined
            }
            isSaving={isSavingTimestamps}
            columns={timestampColumns}
          />
        ) : (
          onTranscribe && (
            <button
              type="button"
              onClick={() => onTranscribe(textId)}
              disabled={isTranscribing || !hasOpenaiKey}
              className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
              title={
                hasOpenaiKey
                  ? t`Generate word timestamps`
                  : t`OpenAI key required`
              }
            >
              {isTranscribing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Type className="h-3 w-3" />
              )}
              {t`Timestamps`}
            </button>
          )
        )}
        {errorMessage && (
          <p className="mt-1 max-w-52 text-[10px] leading-tight text-red-500 text-right ml-auto">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  if (!canGenerate && !uploadButton) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {canGenerate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px]"
            disabled={isGenerating || !hasGeminiKey}
            onClick={() => onGenerate(textId)}
            title={
              hasGeminiKey
                ? t`Generate missing Gemini audio`
                : t`Set a Gemini API key to generate audio`
            }
          >
            {isGenerating ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <WandSparkles className="mr-1 h-3 w-3" />
            )}
            {t`Generate`}
          </Button>
        )}
        {uploadButton}
      </div>
      {errorMessage && (
        <p className="max-w-44 text-[10px] leading-tight text-red-500 text-right">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
