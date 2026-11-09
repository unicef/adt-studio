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
import type { AvailableRelease, UpdateStatus } from "@/hooks/use-update-status";
import {
  useBetaUpdateVersions,
  useInstallBetaVersion,
} from "@/hooks/use-beta-update-versions";
import { cn, formatBytes } from "@/lib/utils";
import { BetaReleaseInstallButton } from "./BetaReleaseInstallButton";
import { BetaVersionSearch } from "./BetaVersionSearch";
import { BetaVersionLibrary } from "./BetaVersionLibrary";
import { BetaVersionSearchEmptyState } from "./BetaVersionSearchEmptyState";
import { ReleaseCover } from "./ReleaseCover";
import { ReleaseDirectionBadge } from "./ReleaseDirectionBadge";
import { ReleaseKindBadge } from "./ReleaseKindBadge";
import { ReleaseNotesMarkdown } from "../ReleaseNotesMarkdown";
import { ReleaseSourceCard } from "./ReleaseSourceCard";
import {
  filterVersionsByQuery,
  isPreviewRelease,
  previewBranch,
  showsDirection,
  formatReleaseDate,
  releaseContributors,
  releaseDisplayTitle,
} from "./beta-version-utils";
import { formatVersion } from "../release-banner-utils";

interface BetaVersionsViewProps {
  status: UpdateStatus;
  currentVersion?: string | null;
  initialVersion?: string;
}

const EMPTY_RELEASES: AvailableRelease[] = [];

export function BetaVersionsView({
  status,
  currentVersion,
  initialVersion,
}: BetaVersionsViewProps) {
  const { i18n, t } = useLingui();
  const [selectedVersion, setSelectedVersion] = useState(initialVersion);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"library" | "details">(
    initialVersion ? "details" : "library",
  );
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const versionsQuery = useBetaUpdateVersions(currentVersion);
  const installMutation = useInstallBetaVersion();
  const versions = versionsQuery.data ?? EMPTY_RELEASES;
  const loading = versionsQuery.isLoading;
  const preparing = installMutation.isPending;
  const detectedVersion =
    status.phase === "available" ? status.version : undefined;

  useEffect(() => {
    if (
      versionsQuery.isSuccess &&
      selectedVersion &&
      !versions.some((release) => release.version === selectedVersion)
    ) {
      setSelectedVersion(undefined);
      setView("library");
    }
  }, [selectedVersion, versions, versionsQuery.isSuccess]);

  const selected = useMemo(
    () => versions.find((release) => release.version === selectedVersion),
    [selectedVersion, versions],
  );
  const filteredVersions = useMemo(
    () => filterVersionsByQuery(versions, query),
    [query, versions],
  );
  const betaReleases = filteredVersions.filter(
    (release) => !isPreviewRelease(release),
  );
  const previewReleases = filteredVersions.filter(isPreviewRelease);
  const libraryProps = {
    currentVersion,
    disabled: preparing,
    onOpen: (version: string) => {
      installMutation.reset();
      openDetails(version);
    },
    onCardRef: (version: string, node: HTMLButtonElement | null) => {
      if (node) cardRefs.current.set(version, node);
      else cardRefs.current.delete(version);
    },
  };

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
    // The settings page scrolls as a whole, so a card opened from further down
    // would otherwise leave the details view scrolled past its top.
    requestAnimationFrame(() => {
      const node = root.current;
      if (!node) return;
      const viewport = node.closest("[data-radix-scroll-area-viewport]");
      const visibleTop = viewport?.getBoundingClientRect().top ?? 0;
      if (node.getBoundingClientRect().top < visibleTop) {
        node.scrollIntoView({ block: "start" });
      }
    });
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
      ref={root}
      className="@container scroll-mt-4"
      onKeyDown={handleKeyDown}
    >
      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border bg-card text-sm text-muted-foreground shadow-sm">
          <Loader2 className="animate-spin motion-reduce:animate-none" />
          <Trans>Loading beta versions…</Trans>
        </div>
      ) : versions.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border bg-card px-6 py-8 text-center shadow-sm">
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
          currentVersion={currentVersion}
          locale={i18n.locale}
          preparing={preparing}
          checking={status.phase === "checking"}
          error={error}
          onBack={returnToLibrary}
          onInstall={startInstall}
        />
      ) : (
        <div className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <BetaVersionSearch
            ref={searchInput}
            value={query}
            onValueChange={setQuery}
          />
          {filteredVersions.length === 0 && (
            <BetaVersionSearchEmptyState
              onClear={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            />
          )}
          {betaReleases.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">
                <Trans>Beta releases</Trans>
              </h2>
              <BetaVersionLibrary
                {...libraryProps}
                label={t`Beta releases`}
                releases={betaReleases}
                initialActiveVersion={initialActiveVersion(
                  betaReleases,
                  detectedVersion,
                )}
              />
            </section>
          )}
          {previewReleases.length > 0 && (
            <section
              className={cn(
                "flex flex-col gap-3",
                betaReleases.length > 0 && "mt-4",
              )}
            >
              <div>
                <h2 className="text-sm font-semibold">
                  <Trans>Preview builds</Trans>
                </h2>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  <Trans>
                    Built from a pull request to try a change before it ships in
                    a beta.
                  </Trans>
                </p>
              </div>
              <BetaVersionLibrary
                {...libraryProps}
                label={t`Preview builds`}
                releases={previewReleases}
                initialActiveVersion={initialActiveVersion(
                  previewReleases,
                  detectedVersion,
                )}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ReleaseDetails({
  release,
  currentVersion,
  locale,
  preparing,
  checking,
  error,
  onBack,
  onInstall,
}: {
  release: AvailableRelease;
  currentVersion?: string | null;
  locale?: string;
  preparing: boolean;
  checking: boolean;
  error?: string;
  onBack: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft />
          <Trans>Back to beta versions</Trans>
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm @3xl:flex-row @3xl:items-start motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-100 motion-safe:fill-mode-backwards">
        <ReleaseCover
          release={release}
          className="w-full max-w-100 shrink-0 @3xl:w-100"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {showsDirection(release, currentVersion) && (
              <ReleaseDirectionBadge direction={release.direction} />
            )}
            <ReleaseKindBadge
              version={release.version}
              branch={previewBranch(release)}
            />
          </div>
          <h2 className="mt-3 text-balance text-xl font-semibold tracking-tight">
            {releaseDisplayTitle(release)}
          </h2>
          {release.description && (
            <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
              {release.description}
            </p>
          )}
          <ReleaseMetadata release={release} locale={locale} />
          <div className="mt-5">
            <BetaReleaseInstallButton
              release={release}
              currentVersion={currentVersion}
              preparing={preparing}
              checking={checking}
              onInstall={onInstall}
            />
          </div>
          {error && <ReleaseError message={error} />}
        </div>
      </div>

      <div className="mt-3 grid items-start gap-3 @2xl:grid-cols-[minmax(0,1fr)_15rem] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-200 motion-safe:fill-mode-backwards">
        <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
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
          className="rounded-2xl shadow-sm"
        />
      </div>
    </div>
  );
}

function ReleaseMetadata({
  release,
  locale,
}: {
  release: AvailableRelease;
  locale?: string;
}) {
  const authors = releaseContributors(release)
    .map((login) => `@${login}`)
    .join(", ");

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
      {authors && (
        <>
          <span aria-hidden>·</span>
          <span>
            <Trans>By</Trans> {authors}
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

/** The card that takes keyboard focus first: the offered update, else the newest upgrade, else the running build. */
function initialActiveVersion(
  releases: readonly AvailableRelease[],
  detectedVersion?: string,
): string | undefined {
  return (
    releases.find((release) => release.version === detectedVersion)?.version ??
    releases.find((release) => release.direction === "upgrade")?.version ??
    releases.find((release) => release.direction === "current")?.version ??
    releases[0]?.version
  );
}
