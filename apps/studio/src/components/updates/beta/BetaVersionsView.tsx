import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AvailableRelease, UpdateStatus } from "@/hooks/use-update-status";
import {
  useBetaUpdateVersions,
  useInstallBetaVersion,
} from "@/hooks/use-beta-update-versions";
import { formatBytes } from "@/lib/utils";
import { BetaReleaseInstallButton } from "./BetaReleaseInstallButton";
import { BetaLibraryHero } from "./BetaLibraryHero";
import { BetaVersionLibrary } from "./BetaVersionLibrary";
import { BetaVersionSearchEmptyState } from "./BetaVersionSearchEmptyState";
import { ReleaseCover } from "./ReleaseCover";
import { ReleaseDirectionBadge } from "./ReleaseDirectionBadge";
import { ReleaseNotesMarkdown } from "../ReleaseNotesMarkdown";
import { ReleaseSourceCard } from "./ReleaseSourceCard";
import { filterVersionsByQuery, formatReleaseDate } from "./beta-version-utils";
import { formatVersion } from "../release-banner-utils";

interface BetaVersionsViewProps {
  status: UpdateStatus;
  currentVersion?: string | null;
  onClose: () => void;
}

const EMPTY_RELEASES: AvailableRelease[] = [];

export function BetaVersionsView({
  status,
  currentVersion,
}: BetaVersionsViewProps) {
  const { i18n } = useLingui();
  const [selectedVersion, setSelectedVersion] = useState<string>();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"library" | "details">("library");
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const versionsQuery = useBetaUpdateVersions(currentVersion);
  const installMutation = useInstallBetaVersion();
  const versions = versionsQuery.data ?? EMPTY_RELEASES;
  const loading = versionsQuery.isLoading;
  const preparing = installMutation.isPending;
  const detectedVersion =
    status.phase === "available" ? status.version : undefined;

  useEffect(() => {
    if (
      selectedVersion &&
      !versions.some((release) => release.version === selectedVersion)
    ) {
      setSelectedVersion(undefined);
      setView("library");
    }
  }, [selectedVersion, versions]);

  const selected = useMemo(
    () => versions.find((release) => release.version === selectedVersion),
    [selectedVersion, versions],
  );
  const filteredVersions = useMemo(
    () => filterVersionsByQuery(versions, query),
    [query, versions],
  );
  const initialActiveVersion =
    filteredVersions.find((release) => release.version === detectedVersion)
      ?.version ??
    filteredVersions.find((release) => release.direction === "upgrade")
      ?.version ??
    filteredVersions.find((release) => release.direction === "current")
      ?.version ??
    filteredVersions[0]?.version;

  const startInstall = () => {
    if (!selected || selected.direction === "current") return;
    installMutation.mutate(selected.version);
  };

  const requestError = installMutation.error ?? versionsQuery.error;
  const error = requestError
    ? requestError instanceof Error
      ? requestError.message
      : String(requestError)
    : undefined;

  const openDetails = (version: string) => {
    setSelectedVersion(version);
    setView("details");
  };
  const returnToLibrary = () => {
    setView("library");
    if (!selected) return;
    requestAnimationFrame(() =>
      cardRefs.current.get(selected.version)?.focus(),
    );
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || view !== "details") return;
    event.preventDefault();
    event.stopPropagation();
    returnToLibrary();
  };

  return (
    <div
      className="flex h-[clamp(45rem,90dvh,54rem)] max-h-[calc(100dvh-2rem)] flex-col relative overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin motion-reduce:animate-none" />
          <Trans>Loading beta versions…</Trans>
        </div>
      ) : versions.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            <Trans>No beta versions are available.</Trans>
          </p>
          {error && <ReleaseError message={error} />}
          <Button
            variant="outline"
            onClick={() => void versionsQuery.refetch()}
          >
            <RefreshCw />
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : view === "details" && selected ? (
        <ReleaseDetails
          release={selected}
          locale={i18n.locale}
          preparing={preparing}
          checking={status.phase === "checking"}
          error={error}
          onBack={returnToLibrary}
          onInstall={startInstall}
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <BetaLibraryHero
            ref={searchInput}
            value={query}
            onValueChange={setQuery}
          />
          <main className="flex flex-col px-5 py-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            {filteredVersions.length > 0 ? (
              <BetaVersionLibrary
                releases={filteredVersions}
                initialActiveVersion={initialActiveVersion}
                disabled={preparing}
                onOpen={(version) => {
                  installMutation.reset();
                  openDetails(version);
                }}
                onCardRef={(version, node) => {
                  if (node) cardRefs.current.set(version, node);
                  else cardRefs.current.delete(version);
                }}
              />
            ) : (
              <BetaVersionSearchEmptyState />
            )}
          </main>
        </ScrollArea>
      )}
    </div>
  );
}

function ReleaseDetails({
  release,
  locale,
  preparing,
  checking,
  error,
  onBack,
  onInstall,
}: {
  release: AvailableRelease;
  locale?: string;
  preparing: boolean;
  checking: boolean;
  error?: string;
  onBack: () => void;
  onInstall: () => void;
}) {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-5 md:px-7">
      <div className="shrink-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          <Trans>Back to beta versions</Trans>
        </Button>
      </div>

      <div className="mt-5 flex shrink-0 items-start gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-100 motion-safe:fill-mode-backwards">
        <ReleaseCover release={release} className="w-100 shrink-0" />
        <div className="min-w-0 flex-1 pt-1">
          <ReleaseDirectionBadge direction={release.direction} />
          <h2 className="mt-3 max-w-3xl text-balance text-2xl font-semibold tracking-tight">
            {release.title ?? formatVersion(release.version)}
          </h2>
          <ReleaseMetadata release={release} locale={locale} />
          <div className="mt-5">
            <BetaReleaseInstallButton
              release={release}
              preparing={preparing}
              checking={checking}
              onInstall={onInstall}
            />
          </div>
          {error && <ReleaseError message={error} />}
        </div>
      </div>

      <div className="mt-7 grid min-h-0 flex-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-200 motion-safe:fill-mode-backwards">
        <section className="h-full min-w-0 overflow-y-auto overscroll-contain rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">
            <Trans>Release notes</Trans>
          </h3>
          {release.releaseNotes?.trim() ? (
            <ReleaseNotesMarkdown>{release.releaseNotes}</ReleaseNotesMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans>No release notes were provided for this version.</Trans>
            </p>
          )}
        </section>
        <ReleaseSourceCard
          source={release.source}
          className="max-h-full self-start"
        />
      </div>
    </main>
  );
}

function ReleaseMetadata({
  release,
  locale,
}: {
  release: AvailableRelease;
  locale?: string;
}) {
  const author =
    release.source?.prs.find((pullRequest) => pullRequest.author)?.author ??
    release.author;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums">
      <span>{formatVersion(release.version)}</span>
      {release.releaseDate && (
        <>
          <span aria-hidden>·</span>
          <time dateTime={release.releaseDate}>
            {formatReleaseDate(release.releaseDate, locale)}
          </time>
        </>
      )}
      {release.totalBytes != null && (
        <>
          <span aria-hidden>·</span>
          <span>{formatBytes(release.totalBytes)}</span>
        </>
      )}
      {author && (
        <>
          <span aria-hidden>·</span>
          <span>
            <Trans>By</Trans> @{author}
          </span>
        </>
      )}
    </p>
  );
}

function ReleaseError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
