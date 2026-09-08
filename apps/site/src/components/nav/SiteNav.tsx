import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Download,
  Menu,
  Play,
  Rocket,
  Search,
  Sparkles,
  Tag,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import {
  findLatestForPlatform,
  formatSize,
  PLATFORMS,
  summarizeBody,
} from "@/components/pages/download/shared";
import { DOC_GUIDES, DOC_HELP } from "@/data/docsNav";
import { DEMOS } from "@/data/demos";
import { MODES } from "@/data/features";
import { cn } from "@/lib/cn";
import { withBase } from "@/lib/href";
import { trackDownload, trackEvent } from "@/lib/matomo";
import { DURATION, EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "@/lib/motion";
import { firstImageFromBody } from "@/lib/releaseSummary";
import {
  formatAbsoluteDate,
  formatRelativeDate,
  releaseHeadline,
  useStableReleases,
} from "@/lib/useGithubReleases";
import { useScrollDirection } from "@/lib/useScrollDirection";

export const GITHUB_URL = "https://github.com/unicef/adt-studio";

const SHEETS = ["product", "docs", "releases"] as const;
type SheetId = (typeof SHEETS)[number];
const SHEET_LABELS: Record<SheetId, MessageDescriptor> = {
  product: msg`Product`,
  docs: msg`Docs`,
  releases: msg`Releases`,
};

type StudioLink = { href: string; label: MessageDescriptor; icon: LucideIcon };
const EXPLORE_LINKS: StudioLink[] = [
  { href: "/#how", label: msg`How it works`, icon: Workflow },
  { href: "/#providers", label: msg`Bring your own AI`, icon: Sparkles },
  { href: "/#open", label: msg`Open source`, icon: BookOpen },
  { href: "/download", label: msg`Download`, icon: Download },
];

const OPEN_DELAY_MS = 60;
const CLOSE_DELAY_MS = 150;

export function SiteNav() {
  const { t, i18n } = useLingui();
  const { direction, atTop } = useScrollDirection();
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const open = sheet !== null;
  const anyOpen = open || mobileOpen;
  const shown = anyOpen || atTop || direction === "up";
  const solid = anyOpen || !atTop;

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  const closeAll = () => {
    clearTimers();
    setSheet(null);
    setMobileOpen(false);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setSheet(null), CLOSE_DELAY_MS);
  };
  const openSheet = (id: SheetId) => {
    clearTimers();
    if (sheet === id) return;
    if (sheet) {
      setSheet(id);
      return;
    }
    openTimer.current = window.setTimeout(() => {
      setSheet(id);
      trackEvent("nav", "sheet_open", id);
    }, OPEN_DELAY_MS);
  };

  useEffect(() => clearTimers, []);
  useEffect(() => {
    if (!anyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyOpen]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const itemClass =
    "relative inline-flex h-10 items-center rounded-full px-3.5 text-[15px] font-bold text-ink transition-colors duration-200 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <MotionConfig reducedMotion="user">
      <header
        ref={headerRef}
        data-nav-state={!shown ? "hidden" : open ? "sheet" : solid ? "scrolled" : "top"}
        className={cn(
          "fixed inset-x-0 top-0 z-50 transform-gpu transition-[transform,opacity] duration-[420ms] ease-out-quart",
          shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0",
        )}
        onMouseLeave={() => open && scheduleClose()}
        onBlurCapture={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && headerRef.current && !headerRef.current.contains(next)) setSheet(null);
        }}
      >
        <AnimatePresence>
          {anyOpen ? (
            <motion.button
              type="button"
              aria-label={t`Close navigation menu`}
              className="fixed inset-0 -z-10 h-dvh w-full cursor-default bg-ink/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.sheet, ease: EASE_OUT }}
              onClick={closeAll}
              onMouseEnter={() => open && scheduleClose()}
            />
          ) : null}
        </AnimatePresence>

        <div
          className={cn(
            "transition-[background-color,border-color,box-shadow] duration-500 ease-out-quart",
            anyOpen
              ? "bg-white"
              : solid
                ? "border-b border-ink-line/70 bg-white/85 shadow-[0_1px_0_rgb(18_27_43/0.02)] backdrop-blur-xl"
                : "border-b border-transparent bg-transparent",
          )}
        >
          <div className="nav-enter mx-auto flex h-[72px] max-w-[1200px] items-center px-5 sm:px-8">
            <a
              href={withBase("/")}
              aria-label={t`ADT Studio home`}
              onClick={closeAll}
              className="mr-6 flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt=""
                width={30}
                height={30}
                className="rounded-[9px]"
              />
              <span className="font-display text-[19px] font-extrabold tracking-tight text-ink">
                ADT Studio
              </span>
            </a>

            <nav aria-label={t`Primary`} className="hidden items-center gap-0.5 md:flex">
              {SHEETS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-expanded={sheet === id}
                  aria-haspopup="true"
                  aria-controls={`nav-sheet-${id}`}
                  className={cn(itemClass, sheet === id && "text-brand-deep")}
                  onMouseEnter={() => openSheet(id)}
                  onFocus={() => openSheet(id)}
                  onClick={() => (sheet === id ? closeAll() : openSheet(id))}
                >
                  {sheet === id ? (
                    <motion.span
                      aria-hidden
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-brand-tint"
                      transition={SPRING_LAYOUT}
                    />
                  ) : null}
                  <span className="relative">{i18n._(SHEET_LABELS[id])}</span>
                </button>
              ))}
            </nav>

            <div
              className="ml-auto flex items-center gap-1"
              onMouseEnter={() => open && scheduleClose()}
            >
              <LocaleSwitcher variant="pill" />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(itemClass, "hidden gap-2 hover:bg-brand-tint sm:inline-flex")}
              >
                <GithubIcon className="size-4" />
                <Trans>GitHub</Trans>
              </a>
              <motion.a
                href={withBase("/download")}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_PRESS}
                onClick={() => {
                  closeAll();
                  trackEvent("cta", "download_click", "nav");
                }}
                className="ml-1 hidden h-10 items-center rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:inline-flex"
              >
                <Trans>Download</Trans>
              </motion.a>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                transition={SPRING_PRESS}
                className="grid size-10 place-items-center rounded-full text-ink hover:bg-brand-tint md:hidden"
                onClick={() => {
                  setSheet(null);
                  setMobileOpen((value) => !value);
                }}
                aria-label={mobileOpen ? t`Close menu` : t`Open menu`}
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </motion.button>
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <SheetViewport sheet={sheet} onMouseEnter={clearTimers}>
              {sheet === "product" ? (
                <ProductSheet onNavigate={closeAll} />
              ) : sheet === "docs" ? (
                <DocsSheet onNavigate={closeAll} />
              ) : (
                <ReleasesSheet onNavigate={closeAll} />
              )}
            </SheetViewport>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {mobileOpen ? (
            <motion.div
              data-sheet="mobile"
              className="border-t border-ink-line bg-white shadow-sheet md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.sheet, ease: EASE_OUT }}
            >
              <MobileMenu onNavigate={closeAll} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>
    </MotionConfig>
  );
}

/* ── Sheet viewport ──────────────────────────────────────────────────────── */

/** Wise-style open: the panel grows from the bar (350ms), content fades in after. */
const SHEET_EASE = [0.8, 0.05, 0.2, 0.95] as const;

function SheetViewport({
  sheet,
  onMouseEnter,
  children,
}: {
  sheet: SheetId;
  onMouseEnter: () => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const firstSheet = useRef(sheet);
  const isFirst = firstSheet.current === sheet;

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sheet]);

  return (
    <motion.div
      id={`nav-sheet-${sheet}`}
      data-sheet={sheet}
      className="hidden overflow-hidden bg-white shadow-sheet md:block"
      initial={{ height: 0 }}
      animate={{ height: height ?? 0 }}
      exit={{ height: 0, transition: { duration: 0.25, ease: SHEET_EASE } }}
      transition={{ height: { duration: 0.35, ease: SHEET_EASE } }}
      onMouseEnter={onMouseEnter}
    >
      <div ref={contentRef} className="mx-auto max-w-[1200px] px-5 pb-10 pt-6 sm:px-8">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={sheet}
            initial={{ opacity: 0, x: isFirst ? 0 : -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10, transition: { duration: 0.18, ease: EASE_OUT } }}
            transition={{
              opacity: { duration: 0.35, delay: isFirst ? 0.2 : 0.05, ease: EASE_OUT },
              x: { duration: 0.4, ease: EASE_OUT },
            }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── Sheets ──────────────────────────────────────────────────────────────── */

function ProductSheet({ onNavigate }: { onNavigate: () => void }) {
  const { i18n } = useLingui();
  return (
    <div className="grid grid-cols-[minmax(0,340px)_1fr_1fr] gap-10">
      <FeaturedCard
        href={withBase("/#demos")}
        onNavigate={onNavigate}
        image={`${import.meta.env.BASE_URL}demos/${DEMOS[0].file}-poster.jpg`}
        imageAlt=""
        imageOverlay={
          <span className="grid size-12 place-items-center rounded-full bg-white/90 text-ink shadow-card transition-transform duration-300 group-hover:scale-110">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        }
        title={<Trans>Watch it in action</Trans>}
        body={
          <Trans>
            Real textbooks turned into accessible books: narration, easy-read,
            activities and more, running in a browser.
          </Trans>
        }
        cta={<Trans>Play the demos</Trans>}
      />
      <SheetColumn title={<Trans>What readers get</Trans>}>
        {MODES.map((mode) => (
          <SheetLink
            key={mode.key}
            href={withBase("/#features")}
            icon={mode.icon}
            hex={mode.hex}
            onClick={onNavigate}
          >
            {i18n._(mode.label)}
          </SheetLink>
        ))}
      </SheetColumn>
      <SheetColumn title={<Trans>Explore</Trans>}>
        {EXPLORE_LINKS.map((link) => (
          <SheetLink key={link.label.id} href={withBase(link.href)} icon={link.icon} onClick={onNavigate}>
            {i18n._(link.label)}
          </SheetLink>
        ))}
      </SheetColumn>
    </div>
  );
}

function DocsSheet({ onNavigate }: { onNavigate: () => void }) {
  const { i18n } = useLingui();
  const { setOpenSearch } = useSearchContext();
  const [start, ...guides] = DOC_GUIDES;
  return (
    <div className="grid grid-cols-[minmax(0,320px)_1.4fr_1fr] gap-10">
      <FeaturedCard
        href={withBase(start.href)}
        onNavigate={onNavigate}
        icon={start.icon}
        title={<Trans>Get started</Trans>}
        body={
          <Trans>
            Install ADT Studio, connect an AI provider and convert your first
            PDF in an afternoon.
          </Trans>
        }
        cta={<Trans>Read the guide</Trans>}
      />
      <SheetColumn title={<Trans>Guides</Trans>}>
        {guides.map((guide) => (
          <SheetLink
            key={guide.href}
            href={withBase(guide.href)}
            icon={guide.icon}
            onClick={onNavigate}
            description={guide.desc ? i18n._(guide.desc) : undefined}
          >
            {i18n._(guide.label)}
          </SheetLink>
        ))}
      </SheetColumn>
      <SheetColumn title={<Trans>Help</Trans>}>
        {DOC_HELP.map((link) => (
          <SheetLink key={link.href} href={withBase(link.href)} icon={link.icon} onClick={onNavigate}>
            {i18n._(link.label)}
          </SheetLink>
        ))}
        <SheetButton
          icon={Search}
          onClick={() => {
            onNavigate();
            setOpenSearch(true);
            trackEvent("nav", "docs_search", "sheet");
          }}
        >
          <Trans>Search the docs</Trans>
        </SheetButton>
        <a
          href={withBase("/docs")}
          onClick={onNavigate}
          className="mt-4 inline-flex items-center gap-1.5 px-2 text-sm font-bold text-ink hover:text-brand-deep"
        >
          <Trans>Browse all documentation</Trans>
          <ArrowRight className="size-4" />
        </a>
      </SheetColumn>
    </div>
  );
}

function ReleasesSheet({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useLingui();
  const { releases, loading } = useStableReleases();
  const latest = releases?.[0];
  const previous = releases?.slice(1, 5) ?? [];
  const cover = latest ? firstImageFromBody(latest.body) : null;
  const bullets = latest ? summarizeBody(latest.body).slice(0, 2) : [];

  return (
    <div className="grid grid-cols-[minmax(0,360px)_1fr_1fr] gap-10">
      {latest ? (
        <FeaturedCard
          href={withBase(`/releases/${encodeURIComponent(latest.tag_name)}`)}
          onNavigate={onNavigate}
          image={cover ?? undefined}
          imageAlt=""
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 font-mono text-[12px] font-bold text-brand-deep">
                <Tag className="size-3" />
                {latest.tag_name}
              </span>
              <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                <Trans>Latest</Trans>
              </span>
              <span className="text-xs text-ink-soft">{formatAbsoluteDate(latest.published_at)}</span>
            </span>
          }
          title={releaseHeadline(latest)}
          body={
            bullets.length ? (
              <ul className="flex flex-col gap-1">
                {bullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-brand" />
                    <span className="line-clamp-2">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              t`Release notes are available now.`
            )
          }
          cta={<Trans>Read the release notes</Trans>}
        />
      ) : (
        <div className="rounded-2xl border border-ink-line bg-paper p-6">
          {loading ? (
            <div className="flex flex-col gap-3" aria-busy>
              <span className="h-4 w-24 rounded-full bg-ink-faint" />
              <span className="h-6 w-2/3 rounded-full bg-ink-faint" />
              <span className="h-4 w-full rounded-full bg-ink-faint" />
              <span className="h-4 w-4/5 rounded-full bg-ink-faint" />
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              <Trans>Release information is unavailable right now.</Trans>
            </p>
          )}
        </div>
      )}

      <SheetColumn title={<Trans>Previous versions</Trans>}>
        <ul className="divide-y divide-ink-line">
          {previous.map((release) => (
            <li key={release.tag_name}>
              <a
                href={withBase(`/releases/${encodeURIComponent(release.tag_name)}`)}
                onClick={onNavigate}
                className="flex items-center justify-between gap-4 py-3 text-[15px] font-bold text-ink hover:text-brand-deep"
              >
                <span className="font-mono text-sm">{release.tag_name}</span>
                <span className="text-sm font-normal text-ink-soft">
                  {formatRelativeDate(release.published_at)}
                </span>
              </a>
            </li>
          ))}
          {!loading && previous.length === 0 ? (
            <li className="py-3 text-sm text-ink-soft">
              <Trans>No earlier versions yet.</Trans>
            </li>
          ) : null}
        </ul>
        <a
          href={withBase("/releases")}
          onClick={onNavigate}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:text-brand-deep"
        >
          <Trans>All releases</Trans>
          <ArrowRight className="size-4" />
        </a>
      </SheetColumn>

      <SheetColumn title={<Trans>Download</Trans>}>
        {PLATFORMS.map((platform) => {
          const resolved = findLatestForPlatform(releases, platform.key);
          const Icon = platform.icon;
          const href = resolved?.asset.browser_download_url ?? withBase("/download");
          return (
            <a
              key={platform.key}
              href={href}
              onClick={() => {
                onNavigate();
                if (resolved) trackDownload(platform.key, resolved.asset.name);
              }}
              className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-brand-tint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink group-hover:text-brand-deep">
                  {platform.label}
                </span>
                <span className="block truncate text-xs text-ink-soft">
                  {resolved
                    ? `${resolved.release.tag_name} · ${formatSize(resolved.asset.size)}`
                    : platform.fallbackHint}
                </span>
              </span>
              <Download className="size-4 text-ink-mute transition-transform group-hover:translate-y-0.5 group-hover:text-brand" />
            </a>
          );
        })}
        <a
          href={withBase("/download")}
          onClick={onNavigate}
          className="mt-4 inline-flex items-center gap-1.5 px-2 text-sm font-bold text-ink hover:text-brand-deep"
        >
          <Trans>All download options</Trans>
          <ArrowRight className="size-4" />
        </a>
      </SheetColumn>
    </div>
  );
}

/* ── Mobile ──────────────────────────────────────────────────────────────── */

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { i18n } = useLingui();
  const { releases } = useStableReleases();
  const latest = releases?.[0];
  return (
    <div className="mx-auto flex max-h-[calc(100dvh-72px)] max-w-[1200px] flex-col overflow-y-auto px-5 pb-8 pt-3 sm:px-8">
      <MobileGroup label={i18n._(SHEET_LABELS.product)} defaultOpen>
        {MODES.map((mode) => (
          <MobileLink key={mode.key} href={withBase("/#features")} onClick={onNavigate}>
            {i18n._(mode.label)}
          </MobileLink>
        ))}
        {EXPLORE_LINKS.map((link) => (
          <MobileLink key={link.label.id} href={withBase(link.href)} onClick={onNavigate}>
            {i18n._(link.label)}
          </MobileLink>
        ))}
      </MobileGroup>
      <MobileGroup label={i18n._(SHEET_LABELS.docs)}>
        {[...DOC_GUIDES, ...DOC_HELP].map((link) => (
          <MobileLink key={link.href} href={withBase(link.href)} onClick={onNavigate}>
            {i18n._(link.label)}
          </MobileLink>
        ))}
      </MobileGroup>
      <MobileGroup label={i18n._(SHEET_LABELS.releases)}>
        {latest ? (
          <MobileLink
            href={withBase(`/releases/${encodeURIComponent(latest.tag_name)}`)}
            onClick={onNavigate}
          >
            <span className="font-mono">{latest.tag_name}</span>
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              <Trans>Latest</Trans>
            </span>
          </MobileLink>
        ) : null}
        <MobileLink href={withBase("/releases")} onClick={onNavigate}>
          <Trans>All releases</Trans>
        </MobileLink>
      </MobileGroup>
      <div className="my-3 h-px bg-ink-line" />
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-3 rounded-full px-4 py-3 text-[16px] font-bold text-ink hover:bg-brand-tint"
      >
        <GithubIcon className="size-4" />
        <Trans>GitHub</Trans>
      </a>
      <a
        href={withBase("/download")}
        onClick={() => {
          onNavigate();
          trackEvent("cta", "download_click", "nav_mobile");
        }}
        className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 text-[16px] font-bold text-white hover:bg-brand-deep"
      >
        <Trans>Download</Trans>
      </a>
    </div>
  );
}

function MobileGroup({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-ink-line py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-full px-4 py-3 text-[16px] font-bold text-ink [&::-webkit-details-marker]:hidden">
        {label}
        <ArrowRight className="size-4 transition-transform duration-200 group-open:rotate-90" />
      </summary>
      <div className="flex flex-col pb-2">{children}</div>
    </details>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="rounded-full px-6 py-2.5 text-[15px] font-semibold text-ink-soft hover:bg-brand-tint hover:text-ink"
    >
      {children}
    </a>
  );
}

/* ── Sheet primitives ────────────────────────────────────────────────────── */

function FeaturedCard({
  href,
  onNavigate,
  image,
  imageAlt,
  imageOverlay,
  icon: Icon,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  onNavigate: () => void;
  image?: string;
  imageAlt?: string;
  imageOverlay?: ReactNode;
  icon?: LucideIcon;
  eyebrow?: ReactNode;
  title: ReactNode;
  body: ReactNode;
  cta: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-line bg-white transition-[border-color,box-shadow] duration-200 hover:border-brand/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {image ? (
        <span className="relative block aspect-[16/10] overflow-hidden border-b border-ink-line bg-paper">
          <img
            src={image}
            alt={imageAlt ?? ""}
            className="size-full object-cover object-left-top transition-transform duration-500 ease-out-quart group-hover:scale-[1.03]"
          />
          {imageOverlay ? (
            <span className="absolute inset-0 grid place-items-center bg-ink/10">{imageOverlay}</span>
          ) : null}
        </span>
      ) : Icon ? (
        <span className="m-5 mb-0 grid size-11 place-items-center rounded-xl bg-brand-tint text-brand">
          <Icon className="size-5" />
        </span>
      ) : null}
      <span className="flex flex-1 flex-col p-5">
        {eyebrow ? <span className="mb-3 block">{eyebrow}</span> : null}
        <span className="font-display text-[22px] font-extrabold leading-tight tracking-tight text-ink">
          {title}
        </span>
        <span className="mt-2 block text-sm leading-relaxed text-ink-soft">{body}</span>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink group-hover:text-brand-deep">
          {cta}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </span>
    </a>
  );
}

function SheetColumn({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div>
      <p className="border-b border-ink-line pb-3 text-sm text-ink-soft">{title}</p>
      <div className="mt-3 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SheetLink({
  href,
  icon: Icon,
  hex,
  description,
  onClick,
  children,
}: {
  href: string;
  icon: LucideIcon;
  hex?: string;
  description?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-brand-tint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white"
        style={hex ? { backgroundColor: `${hex}1a`, color: hex } : undefined}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 pt-1.5">
        <span className="block text-[15px] font-bold leading-tight text-ink group-hover:text-brand-deep">
          {children}
        </span>
        {description ? (
          <span className="mt-1 block text-[13px] leading-snug text-ink-soft">{description}</span>
        ) : null}
      </span>
    </a>
  );
}

function SheetButton({
  icon: Icon,
  onClick,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-brand-tint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
        <Icon className="size-4" />
      </span>
      <span className="text-[15px] font-bold text-ink group-hover:text-brand-deep">{children}</span>
    </button>
  );
}
