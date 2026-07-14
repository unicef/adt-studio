import { useAtomValue } from "jotai";
import { BottomDock } from "@/features/dock/components/BottomDock";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { ActivityDock } from "@/features/activity/components/ActivityDock";
import { ActivityConfetti } from "@/features/activity/components/ActivityConfetti";
import { Dock } from "@/features/dock/components/Dock";
import { KidsChrome } from "@/features/kids/components/KidsChrome";
import { kidsModeActiveAtom } from "@/features/kids/state/kids.atoms";

/**
 * The React tree mounted into `<div id="nav-container">`. Holds the unified
 * bottom dock: book metadata + page nav + NavigationMenu surfaces, and the
 * inline activity submit/reset pair when the page hosts an activity. Each
 * surface (TOC, glossary, audio, language, settings) lives inside the dock's
 * NavigationMenu.
 *
 * Wrapped in its own `TooltipProvider` because ChromeRoot is a separate
 * React tree — context doesn't cross root boundaries, so each root needs
 * its own provider.
 */
export function NavRoot() {
  const kidsModeActive = useAtomValue(kidsModeActiveAtom);

  return (
    <TooltipProvider delay={300} closeDelay={120}>
      <Dock>
        <ActivityDock />
        {kidsModeActive ? <KidsChrome /> : <BottomDock />}
      </Dock>
      <ActivityConfetti />
    </TooltipProvider>
  );
}
