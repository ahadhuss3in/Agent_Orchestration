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
    <footer id="page-footer" className="sec-recap relative border-t border-line">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ background: "var(--grad-recap)" }}
      />

      <div className="mx-auto w-full max-w-[1440px] px-6 pt-20 sm:px-8 lg:px-14 lg:pt-28">
        <ParticleWordmark />
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-10 sm:px-8 lg:px-14 lg:pb-32">
        <h2 className="display-sm max-w-[16ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink">
          Start with one sentence.
        </h2>
        <p className="mt-6 max-w-[52ch] font-mono text-[15px] leading-relaxed text-ink-dim">
          Everything downstream, the graph and the cast and the rounds and the
          conversation afterwards, comes out of whatever moment you decide to
          type in first.
        </p>
        <a className="btn btn-primary mt-9" href="#seed">
          Walk through a seed end to end
        </a>
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
