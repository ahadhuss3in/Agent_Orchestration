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

/**
 * The FAQ near the foot of the page.
 *
 * Every answer is written against what this page and this project actually
 * are. Nothing here promises a feature that does not exist: the page is a
 * presentation artifact, so the honest answer to half of these is "not on this
 * page", and that is what they say.
 *
 * `jump` is the point of the section. Each answer ends at a place on this page
 * that shows the thing it just described, which turns the list into a short
 * guided tour instead of a wall of text.
 */
export const FAQS: {
  q: string;
  a: string;
  jump: { href: string; label: string };
}[] = [
  {
    q: "If I typed a seed into this page, would it actually run?",
    a: "No. This page is a presentation of the engine, not a deployment of it. There is no input bound to a backend anywhere on it, and the seed shown in the Seed section is a fixed example rather than a field. Everything you scroll past is an illustration of a pipeline that runs elsewhere.",
    jump: { href: "#seed", label: "See the seed step" },
  },
  {
    q: "What happens to entities I don't promote into agents?",
    a: "Nothing is thrown away. Extraction writes every person, organization and location it found into Neo4j whether or not you promote it. An un-promoted entity stays a node with all its relationships intact — still queryable, still available to whatever an agent retrieves — it just never speaks. Promotion decides who acts, not who exists.",
    jump: { href: "#agents", label: "Jump to Agents" },
  },
  {
    q: "Can I seed a real event, or only invented ones?",
    a: "Either. The distinction only changes step two. A seed described as real triggers a live web context fetch before extraction, so the graph is built against what is actually known about it. A fictional seed skips that fetch entirely and the engine reads nothing but the sentence you wrote.",
    jump: { href: "#seed", label: "See the seed step" },
  },
  {
    q: "How does a long run avoid blowing up the context window?",
    a: "A rolling summary. Everything older than the current window is compressed into a single carried-forward brief, so an agent entering round forty is handed roughly the same amount of context as one entering round four. The window is bounded by design rather than by hoping runs stay short.",
    jump: { href: "#simulation", label: "Jump to Simulation" },
  },
  {
    q: "What happens once a simulation ends?",
    a: "The run stops and the transcript stays. Every agent keeps its persona, its private memory of what it said, and whatever it retrieved during the rounds. From there you can open a direct conversation with any one of them about a decision it actually made.",
    jump: { href: "#chat", label: "Jump to Chat" },
  },
  {
    q: "Is the chat panel further up this page a working chat?",
    a: "No, and it is labelled as a mock-up in place for exactly that reason. The composer under it is deliberately a plain element rather than a real text input, because a focusable field with nothing behind it would imply a request that is never sent.",
    jump: { href: "#chat", label: "Jump to Chat" },
  },
  {
    q: "Does re-running the same seed duplicate the graph?",
    a: "No. The Neo4j write is idempotent: re-running a seed updates the nodes and relationships already there rather than stacking a second copy of each beside the first. Extraction can be re-run against a seed as many times as you like without the graph drifting.",
    jump: { href: "#graph", label: "Jump to the Graph" },
  },
  {
    q: "Why is promotion a manual gate instead of an automatic one?",
    a: "Because it is the step that decides which entities get to act, and a model picking that on its own would quietly set the shape of everything downstream. It is one of the seven pipeline steps and the only one the engine will not walk through by itself.",
    jump: { href: "#recap", label: "Read the pipeline" },
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
