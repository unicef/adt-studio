import { Toaster } from "sonner"
import { useAtomValue } from "jotai"
import { useThemeSync } from "@/features/settings/hooks/useThemeSync"
import { embedModeAtom } from "@/shared/state/ui.atoms"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { Notepad } from "@/features/notepad/components/Notepad"
import { Eli5Popup } from "@/features/eli5/components/Eli5Popup"
import { SLVideo } from "@/features/sign-language/components/SLVideo"
import { AdminPopup } from "@/features/admin/components/AdminPopup"
import { GlossaryHighlighter } from "@/features/glossary/components/GlossaryHighlighter"
import { GlossaryTermPopover } from "@/features/glossary/components/GlossaryTermPopover"
import { TutorialOverlay } from "@/features/tutorial/components/TutorialOverlay"
import { PagePrefetcher } from "@/features/navigation/components/PagePrefetcher"

/**
 * The React tree mounted into `<div id="interface-container">` on every
 * page. Hosts the secondary floating surfaces (notepad, eli5, sign-language,
 * admin) plus side-effect components (glossary highlighter / term popover,
 * tutorial overlay, page prefetcher, toaster).
 *
 * The primary chrome (book metadata + page nav + the five surface triggers
 * — TOC, glossary, audio, language, settings) lives in the `BottomDock`
 * inside `NavRoot`.
 *
 * In embed mode none of it renders. A `?embed=1` preview exists to show one
 * section the way the storyboard does — book content plus working activity
 * controls — so reader features have no place there. They are skipped rather
 * than hidden with CSS: the glossary highlighter and tutorial overlay mutate
 * the page itself, which no stylesheet can undo, and the prefetcher would
 * pull neighbouring pages a single-section preview never navigates to.
 */
export function ChromeRoot() {
  useThemeSync()
  const embed = useAtomValue(embedModeAtom)

  if (embed) {
    return <Toaster position="top-center" richColors closeButton />
  }

  return (
    <TooltipProvider delay={300} closeDelay={120}>
      {/*<SkipLink />*/}
      {/*<ActivityHeader />*/}
      <Notepad />
      <Eli5Popup />
      <SLVideo />
      <AdminPopup />
      <GlossaryHighlighter />
      <GlossaryTermPopover />
      <TutorialOverlay />
      <PagePrefetcher />
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  )
}
