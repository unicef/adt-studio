import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingShell } from "@/components/LandingShell";
import { Hero } from "@/components/sections/Hero";
import { ReaderFeatures } from "@/components/sections/ReaderFeatures";
import { Demos } from "@/components/sections/Demos";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Providers } from "@/components/sections/Providers";
import { OpenPrinciples } from "@/components/sections/OpenPrinciples";
import { DownloadCta } from "@/components/sections/DownloadCta";
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
        document.getElementById(hash)?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
    return () => root.classList.remove("landing-snap");
  }, []);

  return (
    <LandingShell>
      <Hero />
      <ReaderFeatures />
      <Demos />
      <HowItWorks />
      <Providers />
      <OpenPrinciples />
      <DownloadCta />
    </LandingShell>
  );
}
