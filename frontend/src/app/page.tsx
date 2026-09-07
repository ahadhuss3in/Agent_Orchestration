import { WireframeSprite } from "@/components/WireframeFigures";
import { HudRail } from "@/components/HudRail";
import { ScrollRefresh } from "@/components/ScrollRefresh";
import { Hero } from "@/components/Hero";
import { SeedJourney } from "@/components/SeedJourney";
import { AgentsSection } from "@/components/AgentsSection";
import { SimulationSection } from "@/components/SimulationSection";
import { ChatSection } from "@/components/ChatSection";
import { RecapSection } from "@/components/RecapSection";
import { CtaFooter } from "@/components/CtaFooter";

/**
 * Server component. Every piece that touches GSAP, scroll position or state
 * carries its own `'use client'`; the page itself stays on the server and
 * just composes them.
 */
export default function Page() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <WireframeSprite />
      <HudRail />
      <ScrollRefresh />

      <main id="main" className="lg:pl-[88px]">
        <Hero />
        {/* Seed and Graph are one continuous scroll journey (feedback #5),
            so a single client wrapper owns both and the master ScrollTrigger
            that spans them. */}
        <SeedJourney />
        <AgentsSection />
        <SimulationSection />
        <ChatSection />
        <RecapSection />
        <CtaFooter />
      </main>
    </>
  );
}
