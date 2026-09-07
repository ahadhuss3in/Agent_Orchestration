/**
 * All page copy in one place so the HUD rail, the recap and the sections
 * cannot drift out of sync with each other.
 */

/** The six page sections the HUD rail tracks. Order matters. */
export const STAGES = [
  { id: "seed", index: "01", label: "Seed" },
  { id: "graph", index: "02", label: "Graph" },
  { id: "agents", index: "03", label: "Agents" },
  { id: "simulation", index: "04", label: "Simulation" },
  { id: "chat", index: "05", label: "Chat" },
  { id: "recap", index: "06", label: "Recap" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

/**
 * The seed section's story beats. Adapted from v1's "A headline, a rumor, an
 * internal memo, a scene you invented last night. Anything with people in it."
 * paragraph, broken into separate lines so the traveling seed sigil can eat
 * them one at a time as it passes.
 */
export const SEED_LINES = [
  "A headline.",
  "A rumor.",
  "A boardroom memo.",
  "A scene you invented last night.",
  "Anything with people in it.",
] as const;

/**
 * The actual product pipeline. Seven steps, not six — the HUD rail tracks
 * page sections, this tracks what the engine really does.
 */
export const PIPELINE = [
  {
    n: "01",
    name: "Seed",
    body: "A person submits one event as plain text. Real or invented, it just has to have people in it.",
  },
  {
    n: "02",
    name: "Context",
    body: "If the seed describes something real, the engine pulls live web context around it. Fictional seeds skip this entirely.",
  },
  {
    n: "03",
    name: "Extraction",
    body: "One LLM call turns the text into typed entities, the relationships between them, and a qualitative briefing.",
  },
  {
    n: "04",
    name: "Graph",
    body: "Entities and relationships are written into Neo4j idempotently. Re-running a seed updates the graph, it never duplicates nodes.",
  },
  {
    n: "05",
    name: "Agents",
    body: "A human reviews the candidate entities and picks which become autonomous agents. This gate is deliberate and never automatic.",
  },
  {
    n: "06",
    name: "Simulation",
    body: "The chosen agents run several rounds together, each with its own persona and scoped retrieval, reacting to earlier rounds.",
  },
  {
    n: "07",
    name: "Chat",
    body: "After the run ends you can open a 1:1 chat with any agent. It remembers what it did and answers in character.",
  },
] as const;

export type FigureId =
  | "orchestrator"
  | "strategist"
  | "skeptic"
  | "loyalist"
  | "wildcard";

export const PERSONAS: {
  id: FigureId;
  name: string;
  role: string;
  note: string;
}[] = [
  {
    id: "orchestrator",
    name: "The Orchestrator",
    role: "Convenes the round",
    note: "Holds the shared briefing, decides who speaks to what, and closes each round with a directive the others carry forward.",
  },
  {
    id: "strategist",
    name: "The Strategist",
    role: "Plans forward",
    note: "Reads the relationship edges for leverage and proposes the sequence of moves it thinks survives contact.",
  },
  {
    id: "skeptic",
    name: "The Skeptic",
    role: "Tests the claim",
    note: "Attacks the weakest assumption in whatever was just said, and asks where the evidence actually came from.",
  },
  {
    id: "loyalist",
    name: "The Loyalist",
    role: "Defends the position",
    note: "Argues from the organization's stated interest and supplies the details only an insider entity would carry.",
  },
  {
    id: "wildcard",
    name: "The Wildcard",
    role: "Breaks the frame",
    note: "Ignores the agreed premise and surfaces the outcome nobody in the room priced in.",
  },
];

/** One round of an illustrative exchange. Generic on purpose — no real people. */
export const SIM_LINES: {
  speaker: string;
  figure: FigureId;
  line: string;
  accent: "cool" | "warm";
}[] = [
  {
    speaker: "The Strategist",
    figure: "strategist",
    line: "Hold the announcement until Thursday. Two of these relationships aren't public yet, and the graph says both run through the same office.",
    accent: "cool",
  },
  {
    speaker: "The Skeptic",
    figure: "skeptic",
    line: "Thursday assumes nobody leaks by Wednesday. Who is actually holding the document right now?",
    accent: "cool",
  },
  {
    speaker: "The Loyalist",
    figure: "loyalist",
    line: "Three people. I can account for all three, and I can tell you exactly when each of them last touched it.",
    accent: "warm",
  },
  {
    speaker: "The Wildcard",
    figure: "wildcard",
    line: "You can account for three. I would bet against three being the real number by tomorrow morning.",
    accent: "warm",
  },
  {
    speaker: "The Orchestrator",
    figure: "orchestrator",
    line: "Then we plan for four. Strategist, draft both versions. Skeptic, name the leak path you would use and we test it next round.",
    accent: "warm",
  },
];

/** Static mock of the post-simulation 1:1 chat. Not wired to anything. */
export const CHAT_MOCK: { from: "operator" | "agent"; text: string }[] = [
  {
    from: "operator",
    text: "Why did you push back on Thursday?",
  },
  {
    from: "agent",
    text: "Because the Loyalist's count of three came off the same distribution list the Strategist was already reading from. One source, two people agreeing with themselves. I wanted a second path before we bet a date on it.",
  },
  {
    from: "operator",
    text: "Did the Wildcard change your mind?",
  },
  {
    from: "agent",
    text: "It changed my estimate, not my position. I still think Thursday is defensible. I just stopped treating three as a measured number and started treating it as a floor.",
  },
];

export const GRAPH_NODES = [
  { id: "n1", label: "PERSON", x: 118, y: 92 },
  { id: "n2", label: "ORG", x: 470, y: 78 },
  { id: "n3", label: "PERSON", x: 64, y: 268 },
  { id: "n4", label: "LOCATION", x: 505, y: 246 },
  { id: "n5", label: "PERSON", x: 236, y: 44 },
  { id: "n6", label: "ORG", x: 372, y: 330 },
  { id: "n7", label: "PERSON", x: 176, y: 348 },
  { id: "n8", label: "LOCATION", x: 400, y: 168 },
] as const;

/** Edges are index pairs into GRAPH_NODES; -1 means the central seed orb. */
export const GRAPH_EDGES: [number, number][] = [
  [-1, 0],
  [-1, 1],
  [-1, 3],
  [-1, 6],
  [0, 4],
  [0, 2],
  [1, 7],
  [3, 5],
  [5, 6],
  [7, 4],
  [2, 6],
];
