import { REPO_URL } from "@/lib/content";
import { ParticleWordmark } from "./ParticleWordmark";

/**
 * Final CTA plus a minimal footer.
 *
 * Server component: nothing here animates or holds state except the particle
 * wordmark, which is its own client leaf. No fake logo wall, no invented
 * metrics, no signup flow behind the button.
 *
 * This and the Recap row are the only two places `--grad-recap`'s Spectrum
 * sweep appears — it is the finale colour, not a fifth section accent.
 */

const FOOTER_LINKS = [
  { href: "#graph", label: "Graph" },
  { href: "#agents", label: "Agents" },
  { href: "#simulation", label: "Simulation" },
  { href: "#recap", label: "Pipeline" },
];

export function CtaFooter() {
  return (
    <footer id="page-footer" className="sec-recap relative">
      {/* The 3px Spectrum bar that used to sit here is gone. It was a literal
          line drawn exactly on the FAQ/footer boundary — sampled at 1440x900
          it measured 356 summed RGB against a 60-ish surround, by a wide
          margin the most visible join on the page, and no amount of
          background blending underneath it was ever going to hide a rule that
          was deliberately there. The Spectrum still opens the footer, in the
          particle wordmark immediately below and in the wash behind it.

          This is the last wash on the page, so it does not ramp away at its
          bottom edge — there is nothing under it to hand over to. */}
      <div
        aria-hidden="true"
        className="sec-wash sec-wash-last"
        style={{ "--wash-x": "50%", "--wash-y": "18%" } as React.CSSProperties}
      />

      <div className="mx-auto w-full max-w-[1440px] px-6 pt-20 sm:px-8 lg:px-14 lg:pt-28">
        <ParticleWordmark />
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-10 sm:px-8 lg:px-14 lg:pb-32">
        <h2 className="display-sm max-w-[16ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink">
          Start with one sentence.
        </h2>
        <p className="mt-6 max-w-[52ch] font-mono text-[15px] leading-relaxed text-ink-dim">
          Everything downstream, the graph and the archetypes you assign and
          the rounds and the conversation afterwards, comes out of whatever
          moment you decide to type in first.
        </p>
        {/*
          Two exits, ranked. The primary one is still the in-page walkthrough,
          because this page's job is to explain the engine. The ghost button
          beside it is for the reader who has now finished the whole page and
          wants the actual thing: it goes to the real repository, opens in a
          new tab because it leaves the site, and carries `noopener` (which
          severs `window.opener` on the new tab) and `noreferrer` alongside it.
          The label names GitHub in words rather than relying on the glyph, and
          a visually-hidden note says the tab is new, so a screen reader is not
          silently navigated somewhere else.
        */}
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <a className="btn btn-primary" href="#seed">
            Walk through a seed end to end
          </a>
          <a
            className="btn btn-ghost"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span aria-hidden="true">&#8599;</span>
            Read the source on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-14">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px]"
              style={{ background: "linear-gradient(140deg, #ff6a3d, #2f6bff)" }}
            />
            <span className="display-sm text-sm text-ink">PANTHEON</span>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-7 gap-y-2">
              {FOOTER_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="font-mono text-[13px] text-ink-dim transition-colors hover:text-ink"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <p className="font-mono text-[12px] text-ink-dim">
            © {new Date().getFullYear()} Pantheon. An orchestration engine.
          </p>
        </div>
      </div>
    </footer>
  );
}
