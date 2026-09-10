import { HudRail } from "@/components/HudRail";
import { ScrollRefresh } from "@/components/ScrollRefresh";
import { Hero } from "@/components/Hero";
import { SeedJourney } from "@/components/SeedJourney";
import { GraphRelay } from "@/components/GraphRelay";
import { AgentsSection } from "@/components/AgentsSection";
import { SimulationSection } from "@/components/SimulationSection";
import { ChatSection } from "@/components/ChatSection";
import { RecapSection } from "@/components/RecapSection";
import { FaqSection } from "@/components/FaqSection";
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

      <HudRail />
      <ScrollRefresh />

      <main id="main" className="lg:pl-[88px]">
        <Hero />
        {/* Seed and Graph are one continuous scroll journey (feedback #5),
            so a single client wrapper owns both and the master ScrollTrigger
            that spans them. */}
        <SeedJourney />
        {/* Leg two of the same journey. `GraphRelay` wraps Agents rather than
            sitting beside it so it has a scope to find the Orchestrator in;
            the graph's central node, the one thing it needs from outside its
            own subtree, it looks up by class. See the note in the file for
            why this is not simply more of `SeedJourney`. */}
        <GraphRelay>
          <AgentsSection />
        </GraphRelay>
        <SimulationSection />
        <ChatSection />
        <RecapSection />
        {/* Between the recap and the closing CTA on purpose: by here the
            reader has seen the whole pipeline, and every answer's jump chip
            sends them back into whichever part of it they want a second look
            at. It is not one of the six pipeline stages, so it is not in the
            HUD rail. */}
        <FaqSection />
        <CtaFooter />
      </main>
    </>
  );
}
