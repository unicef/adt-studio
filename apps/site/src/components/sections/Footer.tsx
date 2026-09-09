import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { ArrowUpRight } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { GITHUB_URL } from "@/components/nav/SiteNav";
import { DOC_GUIDES, DOC_HELP } from "@/data/docsNav";
import { SUPPORTERS } from "@/data/supporters";
import { withBase } from "@/lib/href";
import { trackEvent } from "@/lib/matomo";

type LinkCol = {
  title: MessageDescriptor;
  links: { label: MessageDescriptor; href: string; external?: boolean }[];
};

const COLUMNS: LinkCol[] = [
  {
    title: msg`Product`,
    links: [
      { label: msg`What readers get`, href: "/#features" },
      { label: msg`See it in action`, href: "/#demos" },
      { label: msg`How it works`, href: "/#how" },
      { label: msg`Bring your own AI`, href: "/#providers" },
      { label: msg`Download`, href: "/download" },
    ],
  },
  {
    title: msg`Docs`,
    links: [
      ...DOC_GUIDES.map((guide) => ({ label: guide.label, href: guide.href })),
      ...DOC_HELP.map((link) => ({ label: link.label, href: link.href })),
    ],
  },
  {
    title: msg`Project`,
    links: [
      { label: msg`GitHub`, href: GITHUB_URL, external: true },
      { label: msg`Releases`, href: "/releases" },
      { label: msg`Report an issue`, href: `${GITHUB_URL}/issues`, external: true },
      {
        label: msg`Architecture decisions`,
        href: `${GITHUB_URL}/blob/main/docs/DECISIONS.md`,
        external: true,
      },
      { label: msg`AGPL-3.0 license`, href: "https://www.gnu.org/licenses/agpl-3.0.html", external: true },
    ],
  },
];

export function Footer() {
  const { i18n } = useLingui();
  return (
    <footer className="snap-start bg-ink-deep text-white">
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-10 pt-16 sm:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-5">
            <a href={withBase("/")} className="flex items-center gap-2.5">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt=""
                width={30}
                height={30}
                className="rounded-[9px]"
              />
              <span className="font-display text-[19px] font-extrabold tracking-tight">ADT Studio</span>
            </a>
            <p className="max-w-xs text-sm leading-relaxed text-white/65">
              <Trans>
                Free, open-source desktop software that turns PDFs into
                accessible digital textbooks. Built with UNICEF.
              </Trans>
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={withBase("/download")}
                onClick={() => trackEvent("cta", "download_click", "footer")}
                className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-bold text-ink transition-colors hover:bg-brand-tint"
              >
                <Trans>Download</Trans>
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                <GithubIcon className="size-4" />
                <Trans>Star on GitHub</Trans>
              </a>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title.id} className="flex flex-col gap-3">
              <div className="text-sm text-white/55">{i18n._(col.title)}</div>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.href + link.label.id}>
                    <a
                      href={link.external ? link.href : withBase(link.href)}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer noopener" : undefined}
                      className="group inline-flex items-center gap-1 text-[15px] font-semibold text-white/90 transition-colors hover:text-white"
                    >
                      <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-300 ease-out-quart group-hover:bg-[length:100%_1px]">
                        {i18n._(link.label)}
                      </span>
                      {link.external ? <ArrowUpRight className="size-3.5 text-white/50" /> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
              <Trans>Made possible by</Trans>
            </span>
            {SUPPORTERS.map((supporter) => (
              <a
                key={supporter.name}
                href={supporter.href}
                target="_blank"
                rel="noreferrer noopener"
                title={supporter.name}
                className="inline-flex items-center opacity-70 transition-opacity duration-300 hover:opacity-100"
              >
                <img
                  src={`${import.meta.env.BASE_URL}${supporter.src}`}
                  alt={supporter.name}
                  className={`${supporter.heightClass} w-auto object-contain brightness-0 invert`}
                />
              </a>
            ))}
          </div>
          <div className="text-xs text-white/50">
            <Trans>&copy; {new Date().getFullYear()} ADT Studio · AGPL-3.0</Trans>
          </div>
        </div>
      </div>
    </footer>
  );
}
