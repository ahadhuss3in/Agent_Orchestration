import type { Metadata, Viewport } from "next";
import { Orbitron, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["700", "900"],
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
    "Pantheon is an orchestration engine. It reads a seed event, extracts the people, organizations and locations inside it into a Neo4j knowledge graph, waits for a human to promote entities into autonomous agents, runs them through rounds of simulated interaction, then lets you chat with any one of them.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
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
      className={`${orbitron.variable} ${jetbrains.variable} antialiased`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: MOTION_PROBE }} />
        {children}
      </body>
    </html>
  );
}
