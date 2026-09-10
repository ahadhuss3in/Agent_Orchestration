import { ParticleWordmark } from "./ParticleWordmark";
import { WaitlistDialog } from "./WaitlistDialog";

/**
 * Final CTA plus a minimal footer.
 *
 * Server component: nothing here animates or holds state itself. The
 * particle wordmark and the waitlist dialog are its two client leaves. No
 * fake logo wall, no invented metrics — the waitlist is a real form posting
 * to a real route (`/api/waitlist`), not a decorative button.
 *
 * This and the Recap row are the only two places `--grad-recap` appears. It
 * used to be a four-hue Spectrum sweep through every section's accent in
 * order — the page's colour legend, restated as a finale. With one palette
 * there is no legend to restate, so it is a dark-to-white tonal sweep instead
 * and it means something simpler and more useful: the pipeline running to its
 * end.
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
          beside it used to go to the real repository; it now opens the
          waitlist dialog instead, for the reader who has finished the whole
          page and wants to be told when there's something to actually try.
        */}
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <a className="btn btn-primary" href="#seed">
            Walk through a seed end to end
          </a>
          <WaitlistDialog />
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-14">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px]"
              /* THE BRAND MARK. Ignition, like the seed — this and the seed
                 are the two things the monochrome pass deliberately exempts,
                 because a logo that is the same grey as the footer rule beside
                 it is not a logo. */
              style={{
                background: "linear-gradient(140deg, var(--seed-a), var(--seed-b))",
              }}
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
