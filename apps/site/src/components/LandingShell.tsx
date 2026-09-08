import type { ReactNode } from "react";
import { SiteNav } from "@/components/nav/SiteNav";
import { Footer } from "@/components/sections/Footer";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell min-h-screen bg-white font-sans text-ink antialiased">
      <SiteNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
