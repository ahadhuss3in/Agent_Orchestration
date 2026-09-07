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

/**
 * The Orchestrator is NOT one of the four archetypes below.
 *
 * It is a system role: the engine supplies exactly one of these per run, it is
 * never assigned to an entity, and it is not something a person picks. It
 * convenes the round and closes it. Kept in its own export precisely so the
 * page cannot accidentally present it as a fifth option on the menu, which is
 * what a single `PERSONAS` array with a destructure at the top of the section
 * quietly did before.
 */
export const ORCHESTRATOR: {
  id: FigureId;
  name: string;
  role: string;
  note: string;
} = {
  id: "orchestrator",
  name: "The Orchestrator",
  role: "Convenes every round",
  note: "Supplied by the engine, one per run, never assigned to an entity. It holds the shared briefing, decides who speaks to what, and closes each round with a directive the others carry forward.",
};

/**
 * The archetype palette.
 *
 * These are BEHAVIOURAL TYPES, not characters. None of them belongs to any
 * particular person, organization or location. When a human promotes an entity
 * out of the graph they choose which of these four it carries, and that choice
 * is what decides how the entity argues once the rounds start. The same
 * archetype can be assigned to a different entity on the next run, and one
 * entity can be re-promoted under a different archetype entirely.
 *
 * So every `note` below describes what the archetype DOES to whatever entity
 * wears it — never what some specific character in some specific scenario did.
 */
export const ARCHETYPES: {
  id: FigureId;
  name: string;
  role: string;
  note: string;
}[] = [
  {
    id: "strategist",
    name: "The Strategist",
    role: "Plans forward",
    note: "Reads the relationship edges around its entity for leverage, and proposes the sequence of moves it thinks survives contact.",
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
    note: "Argues from its entity's stated interest and supplies the details only someone on the inside of it would carry.",
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

/** The project's own repository. Verified against this machine's `git remote`. */
export const REPO_URL = "https://github.com/ahadhuss3in/Agent_Orchestration";

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
 *
 * TRIMMED FROM EIGHT TO SIX. Three of the original eight were not carrying
 * their own weight and one replaced them:
 *
 *   - "Can I seed a real event, or only invented ones?" said, at greater
 *     length, exactly what the Seed section's own body paragraph says twenty
 *     lines further up the page. A FAQ that repeats the copy the reader has
 *     already scrolled past is filler.
 *   - "Is the chat panel a working chat?" was a second, narrower ask of "would
 *     this page actually run" — same answer, less scope. Folded into the first
 *     question, which now names the chat mock-up explicitly.
 *   - "What happens once a simulation ends?" was largely a restatement of
 *     pipeline step 07. Its one genuinely load-bearing claim (agents keep their
 *     memory afterwards) moved into the promotion question, and the #chat jump
 *     it owned moved with it so the tour still touches every section.
 *
 * What is left is six questions, each about a decision the engine actually
 * makes, and between them they still land on all six sections.
 */
export const FAQS: {
  q: string;
  a: string;
  jump: { href: string; label: string };
  /** Optional off-site link, rendered as a second chip beside `jump`. */
  ext?: { href: string; label: string };
}[] = [
  {
    q: "If I typed a seed into this page, would it actually run?",
    a: "No. This page is a presentation of the engine, not a deployment of it. Nothing on it is bound to a backend: the seed in the Seed section is a fixed example rather than a field, and the chat panel further down is a labelled mock-up whose composer is deliberately not a focusable input, because a real one with nothing behind it would imply a request that is never sent. The engine itself is a separate set of services, and the code for it is public.",
    jump: { href: "#seed", label: "See the seed step" },
    ext: { href: REPO_URL, label: "Read the source on GitHub" },
  },
  {
    q: "What happens to entities I don't promote into agents?",
    a: "Nothing is thrown away. Extraction writes every person, organization and location it found into Neo4j whether or not you promote it. An un-promoted entity stays a node with all its relationships intact — still queryable, still available to whatever an agent retrieves — it just never speaks. Promotion decides who acts, not who exists.",
    jump: { href: "#graph", label: "Jump to the Graph" },
  },
  {
    q: "Can two entities be promoted under the same archetype?",
    a: "Yes. An archetype is a behavioural setting, not a cast member, so nothing stops you running two Skeptics, or a round with no Wildcard in it at all. The archetype decides how an agent argues; the entity behind it decides what that agent knows and which edges of the graph it can reach, so two Skeptics attached to different entities do not produce the same round twice.",
    jump: { href: "#agents", label: "Jump to Agents" },
  },
  {
    q: "How does a long run avoid blowing up the context window?",
    a: "A rolling summary. Everything older than the current window is compressed into a single carried-forward brief, so an agent entering round forty is handed roughly the same amount of context as one entering round four. The window is bounded by design rather than by hoping runs stay short.",
    jump: { href: "#simulation", label: "Jump to Simulation" },
  },
  {
    q: "Does re-running the same seed duplicate the graph?",
    a: "No. The Neo4j write is idempotent: re-running a seed updates the nodes and relationships already there rather than stacking a second copy of each beside the first. Extraction can be re-run against a seed as many times as you like without the graph drifting.",
    jump: { href: "#recap", label: "Read the pipeline" },
  },
  {
    q: "Why is promotion a manual gate instead of an automatic one?",
    a: "Because it is the step that decides which entities get to act and which archetype each of them argues from, and a model picking both on its own would quietly set the shape of everything downstream. It is one of the seven pipeline steps and the only one the engine will not walk through by itself. What it decides then outlives the run: after the rounds stop, every agent keeps the persona you gave it and its private memory of what it said, which is what makes the 1:1 chat afterwards worth having.",
    jump: { href: "#chat", label: "Jump to Chat" },
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
