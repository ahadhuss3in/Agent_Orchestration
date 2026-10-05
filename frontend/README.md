# Pantheon — marketing site (`frontend/`)

This is the public marketing site for AI-Engine. It is **not** the engine and it
does **not** talk to the API. The console that drives the pipeline lives in
`../frontend_app/`.

Next.js (App Router) + Tailwind + GSAP, built as a single scrolling page split
into sections (`Hero`, `SeedJourney`, `AgentsSection`, `SimulationSection`,
`GraphSection`, `ChatSection`, `FaqSection`, `CtaFooter`), with a couple of
canvas/3D accents.

## Getting started

Requires Node 20+.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Layout

```
frontend/
  src/app/
    page.tsx              composes the sections top to bottom
    layout.tsx            fonts, metadata, theme
    globals.css           design tokens + section styles
    api/waitlist/         waitlist capture + export route handlers
  src/components/         one file per page section, plus cube/ canvas pieces
  src/lib/                content copy, animation helpers, design tokens
  public/img/             screenshots and artwork used by the page
```

`AGENTS.md` in this folder is generated and re-added by `next dev`; leave it as
committed rather than editing it by hand.

## Content

The page copy lives in `src/lib/content.ts` rather than being scattered through
the components, so wording can be changed in one place. Keep the four archetype
ids (`strategist`, `skeptic`, `loyalist`, `wildcard`) in sync with the engine's
`services/Orchestration/agents/archetypes.py` and the console's
`frontend_app/src/lib/archetypes.ts` — all three are meant to agree.
