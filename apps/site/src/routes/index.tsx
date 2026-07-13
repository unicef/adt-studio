import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingShell } from "@/components/LandingShell";
import { WelcomeScene } from "@/components/sections/WelcomeScene";
import { TrustStrip } from "@/components/sections/TrustStrip";
import { FeaturesScene } from "@/components/sections/FeaturesScene";
import { CarouselScene } from "@/components/sections/CarouselScene";
import { ShowcaseScene } from "@/components/sections/ShowcaseScene";
import { ReleasesScene } from "@/components/sections/ReleasesScene";
import { DocsScene } from "@/components/sections/DocsScene";
import { FinaleScene } from "@/components/sections/FinaleScene";
import { DOCS_ENABLED } from "@/lib/flags";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => seo(),
});

function Home() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("landing-snap");

    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }

    return () => root.classList.remove("landing-snap");
  }, []);

  return (
    <LandingShell isHome>
      <WelcomeScene />
      <TrustStrip />
      <FeaturesScene />
      <CarouselScene />
      <ShowcaseScene />
      <ReleasesScene />
      {DOCS_ENABLED && <DocsScene />}
      <FinaleScene />
    </LandingShell>
  );
}
