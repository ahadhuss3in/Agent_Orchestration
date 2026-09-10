import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/**
 * The display face.
 *
 * Was Orbitron through v5. Sora is a geometric sans with a much more normal
 * width and a real lowercase, which is the whole point of the change: the
 * headlines read as a product's voice rather than a sci-fi console's.
 *
 * Two consequences of that swap are load-bearing elsewhere and are handled at
 * the point they matter, not here:
 *
 *   - Sora's glyphs are roughly 22% narrower than Orbitron's at the same
 *     size, so anything that sized itself from a measured string gets a
 *     different answer. `ParticleWordmark` measures "PANTHEON" and solves for
 *     a size, so it adapts on its own; only its height cap needed re-checking.
 *   - Sora carries far less letter-spacing of its own, so `.display` /
 *     `.display-sm` in globals.css tightened their negative tracking rather
 *     than keeping numbers that were tuned against Orbitron's wide default.
 *
 * JetBrains Mono is untouched. The terminal/HUD texture it gives the body,
 * the data rows and every hud-label is a separate, deliberate decision.
 */
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pantheon: turn one moment into a cast of reasoning agents",
  description:
    "Pantheon is an orchestration engine. It reads a seed event, extracts the people, organizations and locations inside it into a knowledge graph, waits for a human to promote entities into autonomous agents, runs them through rounds of simulated interaction, then lets you chat with any one of them.",
};

export const viewport: Viewport = {
  themeColor: "#090909",
  colorScheme: "dark",
};

/**
 * Motion probe.
 *
 * Every section's markup renders in its finished state by default, so the
 * page is fully legible with JS off. This one-liner adds `js-motion` before
 * first paint purely so the hero does not flash its final layout for a frame
 * before the full-viewport intro takes over. It removes itself after 8s in
 * case GSAP never arrives — 8 rather than v1's 4 because the new load-in
 * runs about 4.5s and the dead-man switch must outlast it.
 */
const MOTION_PROBE = `
try {
  if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    var r = document.documentElement;
    r.classList.add('js-motion');
    setTimeout(function () { r.classList.remove('js-motion'); }, 8000);
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // The motion probe below adds a class to <html> before React hydrates,
      // so the root element's attributes legitimately differ from the server
      // markup. Suppression applies to this element only.
      suppressHydrationWarning
      className={`${sora.variable} ${jetbrains.variable} antialiased`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: MOTION_PROBE }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
