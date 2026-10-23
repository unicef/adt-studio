import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SKIN } from "@/components/app/screens/pipeline/plugins/dock/style"
import { BaseCover, BaseOriginal, BasePage, BaseSoft } from "./base"
import { IslandsBook, IslandsCaptioned, IslandsClassic, IslandsQuiet } from "./islands"
import { Today, type Here } from "./parts"
import { TrayFolder, TrayOriginal, TrayRecent, TrayWhere } from "./tray"

export const DOCK_SHOW_PARAM = "dockshow"

interface Option {
  key: string
  title: string
  body: string
  render: (here: Here) => ReactNode
}

interface Direction {
  key: string
  title: string
  body: string
  options: Option[]
}

function useDirections(): Direction[] {
  const { t } = useLingui()
  return [
    {
      key: "today",
      title: t`Today`,
      body: t`Baseline for comparison.`,
      options: [{ key: "today", title: t`Two tiles`, body: t`Extract and Sectioning as full tiles, then Storyboard, then the extras.`, render: (here) => <Today here={here} /> }],
    },
    {
      key: "islands",
      title: t`Two islands`,
      body: t`Making the book and adding to it are two separate bars.`,
      options: [
        { key: "islands-classic", title: t`A · Classic`, body: t`Ex › Sec › Storyboard in one bar, the extras in another, both the same weight.`, render: (here) => <IslandsClassic here={here} /> },
        { key: "islands-book", title: t`B · Book island`, body: t`The book bar ends in a Storyboard block with a page thumbnail and the page count.`, render: (here) => <IslandsBook here={here} /> },
        { key: "islands-quiet", title: t`C · Quiet extras`, body: t`The book bar is solid; the extras bar is lighter, translucent and a size smaller.`, render: (here) => <IslandsQuiet here={here} /> },
        { key: "islands-captioned", title: t`D · Captioned`, body: t`Each bar gets a small caption above it: Your book, Extras.`, render: (here) => <IslandsCaptioned here={here} /> },
      ],
    },
    {
      key: "base",
      title: t`Storyboard as the base`,
      body: t`A bigger Storyboard block that carries the book; the extras follow.`,
      options: [
        { key: "base-original", title: t`A · Original`, body: t`Thumbnail, page count and version, with Extract and Sectioning inside the block.`, render: (here) => <BaseOriginal here={here} /> },
        { key: "base-soft", title: t`B · Soft`, body: t`Same block, but when you're on it it's tinted with a violet edge instead of solid violet.`, render: (here) => <BaseSoft here={here} /> },
        { key: "base-page", title: t`C · Where you are`, body: t`The thumbnail and subline follow the page you're on; Extract and Sectioning shrink to a stacked pair on the left.`, render: (here) => <BasePage here={here} /> },
        { key: "base-cover", title: t`D · The book`, body: t`The block is the book itself: its cover and title, with Storyboard as the subline.`, render: (here) => <BaseCover here={here} /> },
      ],
    },
    {
      key: "tray",
      title: t`Storyboard + tray`,
      body: t`Only the book path stays in the dock; the extras live behind one button.`,
      options: [
        { key: "tray-original", title: t`A · Extras button`, body: t`A stack of extra icons, the word Extras and a count. The extra you're on shows beside it.`, render: (here) => <TrayOriginal here={here} /> },
        { key: "tray-folder", title: t`B · Folder`, body: t`A square folder tile with a grid of every extra's colour and a count badge.`, render: (here) => <TrayFolder here={here} /> },
        { key: "tray-where", title: t`C · Where you are`, body: t`On an extra, the tray button becomes that extra, named and in its colour, and opens the tray.`, render: (here) => <TrayWhere here={here} /> },
        { key: "tray-recent", title: t`D · Recent`, body: t`The three extras you used last stay in the dock; the rest sit behind More.`, render: (here) => <TrayRecent here={here} /> },
      ],
    },
  ]
}

export function DockShowcase({ onClose }: { onClose: () => void }) {
  const { t } = useLingui()
  const directions = useDirections()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  const scene = (render: Option["render"], here: Here, label: string) => (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={cn("text-[10.5px] font-semibold tracking-[0.08em] uppercase", SKIN.muted)}>{label}</span>
      <div className="relative flex h-[150px] items-end justify-center overflow-hidden rounded-[20px] bg-zinc-100 px-4 pb-5 dark:bg-zinc-900">
        <div aria-hidden className="absolute inset-x-[18%] top-5 bottom-[110px] rounded-[10px] bg-white shadow-sm dark:bg-zinc-800" />
        <div className="relative">{render(here)}</div>
      </div>
    </div>
  )
  return (
    <div className={cn("fixed inset-0 z-[200] overflow-y-auto scroll-smooth", dark && "dark")} style={{ colorScheme: dark ? "dark" : "light" }}>
      <div className={cn("min-h-full bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white", SKIN.surface)}>
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-950/[0.06] bg-white/85 px-8 py-3.5 backdrop-blur dark:border-white/[0.08] dark:bg-zinc-950/85">
          <div className="flex flex-col">
            <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
              <Trans>Dock directions · Storyboard in focus</Trans>
            </h1>
            <p className={cn("text-[12px]", SKIN.muted)}>
              <Trans>Static mockups from the real dock tiles, each shown on the Storyboard and on Easy Read.</Trans>
            </p>
          </div>
          <nav className="ml-6 flex items-center gap-1">
            {directions.map((direction) => (
              <a key={direction.key} href={`#${direction.key}`} className={cn("rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors duration-150", SKIN.tabIdle)}>
                {direction.title}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 rounded-full bg-zinc-950/[0.05] p-1 dark:bg-white/[0.08]">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setDark(value)}
                className={cn("h-7 cursor-pointer rounded-full px-3 text-[12px] font-semibold transition-colors duration-150", dark === value ? "bg-white text-zinc-950 shadow-sm" : SKIN.muted)}
              >
                {value ? t`Dark` : t`Light`}
              </button>
            ))}
          </div>
          <button type="button" aria-label={t`Close`} onClick={onClose} className={cn("grid size-8 cursor-pointer place-items-center rounded-full transition-colors duration-150", SKIN.tabIdle)}>
            <X className="size-4" />
          </button>
        </header>
        <div className="flex flex-col gap-14 px-8 py-8">
          {directions.map((direction) => (
            <section key={direction.key} id={direction.key} className="flex scroll-mt-24 flex-col gap-6">
              <div>
                <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{direction.title}</h2>
                <p className={cn("text-[13px]", SKIN.muted)}>{direction.body}</p>
              </div>
              {direction.options.map((option) => (
                <article key={option.key} data-option={option.key} className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-[14px] font-semibold">{option.title}</h3>
                    <p className={cn("text-[12.5px]", SKIN.muted)}>{option.body}</p>
                  </div>
                  <div className="grid gap-4 min-[1800px]:grid-cols-2">
                    {scene(option.render, "storyboard", t`On Storyboard`)}
                    {scene(option.render, "easy-read", t`On Easy Read`)}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
