import { test } from "node:test";
import assert from "node:assert/strict";
import { stops } from "../line.js";
import { activityWords, codeCandidates, enterCode, hoverDetail, jumpCode, jumpGroupStep, jumpList, letterColumns, lookCard, lookStep, matchSegs, signalRows, stateSince, tabState, tabTotals, runningRows } from "../overview.js";

// a: one tab; b: free; c: three tabs, the third split; d: one tab
const tab = (id, index, extra = {}) => ({ id, index, name: String(index), named: false, status: null, settled: false, changed_at: null, working_since: null, ...extra });
const SPACES = [
  { id: "s1", name: "atlas", tabs: [tab("t11", 1, { changed_at: 1000 })] },
  { id: "s3", name: "moss", tabs: [tab("t31", 1, { status: "working", working_since: 500 }), tab("t32", 2), tab("t33", 3, { status: "blocked", changed_at: 2000 })] },
  { id: "s4", name: "plans", tabs: [tab("t41", 1, { changed_at: 300 })] },
];
const PANES = [
  { pane: "p11", tab: "t11", terminal: "x11", status: "idle", program: { key: "shell", name: "zsh" } },
  { pane: "p31", tab: "t31", terminal: "x31", status: "working", program: { key: "claude", name: "Claude Code" } },
  { pane: "p32", tab: "t32", terminal: "x32", status: null, program: { key: "shell", name: "zsh" } },
  { pane: "p33a", tab: "t33", terminal: "x33a", status: "blocked", program: { key: "claude", name: "Claude Code" } },
  { pane: "p33b", tab: "t33", terminal: "x33b", status: "done", program: { key: "claude", name: "Claude Code" } },
  { pane: "p41", tab: "t41", terminal: "x41", status: "idle", program: { key: "shell", name: "zsh" } },
];
const LINE = { version: 1, slots: [
  { letter: "a", space: "s1" },
  { letter: "b", space: null, closed: 1795097520000, was: "dune" },
  { letter: "c", space: "s3" },
  { letter: "d", space: "s4" },
] };
const ALL = stops(LINE, SPACES, PANES);
const COLUMNS = letterColumns(LINE, SPACES, ALL);

test("letterColumns: one column per letter, the free one kept in its place", () => {
  assert.deepEqual(COLUMNS.map((t) => [t.letter, t.free, t.name]), [["a", false, "atlas"], ["b", true, ""], ["c", false, "moss"], ["d", false, "plans"]]);
  assert.deepEqual(COLUMNS[1].stops, []);
  assert.equal(COLUMNS[1].closed, 1795097520000);
  assert.equal(COLUMNS[1].was, "dune");
  assert.deepEqual(COLUMNS[2].stops.map((s) => s.code), ["c1", "c2", "c3.1", "c3.2"]);
});

test("enterCode: c1 is c1 even while c10 exists", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ code: `c${i + 1}` }));
  const columns = [{ letter: "c", free: false, stops: many }];
  assert.equal(enterCode("c1", columns).code, "c1");
});

test("enterCode: the exact code, else the first that starts with it, never a bare letter", () => {
  assert.equal(enterCode("c3", COLUMNS).code, "c3.1");
  assert.equal(enterCode("a1", COLUMNS).code, "a1");
  assert.equal(enterCode("c", COLUMNS), null);
  assert.equal(enterCode("", COLUMNS), null);
  assert.deepEqual(codeCandidates("c3", COLUMNS).map((s) => s.code), ["c3.1", "c3.2"]);
});

test("stateSince and tabState", () => {
  const byCode = (c) => ALL.find((s) => s.code === c);
  assert.equal(stateSince(byCode("c1"), SPACES), 500);
  assert.equal(stateSince(byCode("c3.1"), SPACES), 2000);
  assert.equal(stateSince(byCode("c2"), SPACES), null);
  assert.equal(tabState("blocked"), "waiting");
  assert.equal(tabState("done"), "waiting");
  assert.equal(tabState("working"), "working");
  assert.equal(tabState(null), "idle");
});

test("signalRows: blocked longest waiting first, then done, each with its stop", () => {
  const agents = [
    { address: "x31", pane: "p31", status: "working", seq: 1 },
    { address: "x33b", pane: "p33b", status: "done", seq: 2 },
    { address: "x33a", pane: "p33a", status: "blocked", seq: 9 },
    { address: "zz", pane: "nope", status: "blocked", seq: 3 },
  ];
  const rows = signalRows(agents, ALL);
  assert.deepEqual(rows.map((r) => r.agent.address), ["zz", "x33a", "x33b"]);
  assert.equal(rows[0].stop, null);
  assert.equal(rows[1].stop.code, "c3.1");
});

test("tabTotals: spaces, free letters, tabs, states, longest running, oldest idle", () => {
  const t = tabTotals(LINE, ALL, SPACES);
  assert.deepEqual([t.spaces, t.free, t.tabs, t.waiting, t.working, t.idle], [3, 1, 5, 2, 1, 3]); // c3 is split: 6 stops, 5 tabs
  assert.equal(t.longest.stop.code, "c1");
  assert.equal(t.longest.since, 500);
  assert.equal(t.oldestIdle.stop.code, "d1");
  assert.equal(tabTotals(null, [], []).spaces, 0);
});

test("runningRows: working agents longest first, with purpose, time and progress; then the idle line", () => {
  const M = 60000, now = 500 + 65 * M;
  const labels = new Map([["x31", { "plato.purpose": "Fix the API", "plato.purpose_at": "1", "plato.step": "Bash: npm test", "plato.step_at": "2", "plato.tasks": "3/7" }]]);
  const r = runningRows(ALL, SPACES, labels, now);
  assert.deepEqual(r.rows, [{ code: "c1", words: "Fix the API", time: "1h 05m", tasks: "3/7" }]);
  assert.equal(r.idle, "3 idle · oldest d1 · 1h 05m");
});

test("runningRows: no purpose shows the tab's name; no progress is empty; none working", () => {
  const r = runningRows(ALL, SPACES, new Map(), 600);
  assert.deepEqual(r.rows.map((x) => [x.code, x.tasks]), [["c1", ""]]);
  assert.equal(r.rows[0].words, ALL.find((s) => s.code === "c1").label);
  const none = runningRows([], [], new Map(), 0);
  assert.deepEqual(none, { rows: [], idle: "none idle" });
});

test("activityWords: time run today and when the slot was last active", () => {
  const M = 60000, now = 1000 * M;
  const row = { segs: [
    { from: 800 * M, to: 860 * M, kind: "ran" },
    { from: 860 * M, to: 900 * M, kind: "idle" },
    { from: 900 * M, to: 940 * M, kind: "ran" },
    { from: 940 * M, to: 945 * M, kind: "wait" },
    { from: 945 * M, to: 1000 * M, kind: "idle" },
  ] };
  assert.equal(activityWords(row, now), "ran 1h 40m today · last active 55m ago");
  // still running: no "last active"
  assert.equal(activityWords({ segs: [{ from: 990 * M, to: now, kind: "ran" }] }, now), "ran 10m today");
  assert.equal(activityWords({ segs: [{ from: now - 20000, to: now - 10000, kind: "ran" }] }, now), "ran under 1m today");
  assert.equal(activityWords({ segs: [{ from: 900 * M, to: 905 * M, kind: "wait" }] }, now), "no runs today · last active 1h 35m ago");
  assert.equal(activityWords({ segs: [{ from: 0, to: now, kind: "idle" }] }, now), null);
  assert.equal(activityWords(null, now), null);
});

// ---- JUMP (cmd-j): find a tab by its code, name, purpose or folder ----

const ENTRIES = ALL.map((stop) => ({
  stop,
  purpose: stop.code === "c1" ? "Rate-limit the public API" : "",
  folder: `~/code/${stop.spaceName}`,
}));
const codesOf = (r) => r.groups.map((g) => [g.key, g.entries.map((e) => e.stop.code)]);

test("jumpList: no query lists every stop, waiting first in NEXT1 order, then working, then idle", () => {
  const r = jumpList(ENTRIES, ["c3.2", "c3.1"], "", "all", COLUMNS);
  assert.deepEqual(codesOf(r), [["waiting", ["c3.2", "c3.1"]], ["working", ["c1"]], ["idle", ["a1", "c2", "d1"]]]);
  assert.deepEqual(r.picks.map((e) => e.stop.code), ["c3.2", "c3.1", "c1", "a1", "c2", "d1"]);
  assert.deepEqual(r.counts, { all: 6, waiting: 2, working: 1, idle: 3 });
  assert.equal(r.code, null);
});

test("jumpList: every word must match the code, space, name, program, purpose or folder, in any order", () => {
  assert.deepEqual(jumpList(ENTRIES, [], "api MOSS", "all", COLUMNS).picks.map((e) => e.stop.code), ["c1"]);
  assert.deepEqual(jumpList(ENTRIES, [], "zsh", "all", COLUMNS).picks.map((e) => e.stop.code), ["a1", "c2", "d1"]);
  assert.deepEqual(jumpList(ENTRIES, [], "code/plans", "all", COLUMNS).picks.map((e) => e.stop.code), ["d1"]);
  const none = jumpList(ENTRIES, [], "nothing here", "all", COLUMNS);
  assert.deepEqual(none.picks, []);
  assert.deepEqual(none.counts, { all: 0, waiting: 0, working: 0, idle: 0 });
});

test("jumpList: a group shows only its stops, and the counts stay those of every group", () => {
  const r = jumpList(ENTRIES, [], "", "idle", COLUMNS);
  assert.deepEqual(codesOf(r), [["idle", ["a1", "c2", "d1"]]]);
  assert.equal(r.counts.all, 6);
});

test("jumpList: a code comes first and leaves its group; c3 in a split tab is c3.1", () => {
  const r = jumpList(ENTRIES, ["c3.2", "c3.1"], "c3", "all", COLUMNS);
  assert.equal(r.code.stop.code, "c3.1");
  assert.deepEqual(r.picks.map((e) => e.stop.code), ["c3.1", "c3.2"]);
  assert.equal(jumpList(ENTRIES, [], " C2 ", "all", COLUMNS).code.stop.code, "c2");
  // shown even in another group
  assert.deepEqual(jumpList(ENTRIES, [], "a1", "waiting", COLUMNS).picks.map((e) => e.stop.code), ["a1"]);
});

test("jumpCode: one letter names its space's active tab; a free letter or a word names none", () => {
  const sp = SPACES.map((s) => (s.id === "s3" ? { ...s, tabs: s.tabs.map((t) => ({ ...t, active: t.id === "t32" })) } : s));
  const columns = letterColumns(LINE, sp, stops(LINE, sp, PANES));
  assert.equal(jumpCode("c", columns).code, "c2");
  assert.equal(jumpCode("d", COLUMNS).code, "d1"); // no active tab known: the first stop
  assert.equal(jumpCode("b", COLUMNS), null);
  assert.equal(jumpCode("moss", COLUMNS), null);
  assert.equal(jumpCode("c9", COLUMNS), null);
  assert.equal(jumpCode("c3.2", COLUMNS).code, "c3.2");
});

test("jumpGroupStep: Tab steps all, waiting, working, idle and wraps; shift-Tab goes back", () => {
  assert.equal(jumpGroupStep("all", false), "waiting");
  assert.equal(jumpGroupStep("idle", false), "all");
  assert.equal(jumpGroupStep("all", true), "idle");
  assert.equal(jumpGroupStep("nonsense", false), "waiting");
});

test("matchSegs: each word lights its first match, ignoring case", () => {
  assert.deepEqual(matchSegs("compass · tests", ["test", "COM".toLowerCase()]), [
    { text: "com", hit: true }, { text: "pass · ", hit: false }, { text: "test", hit: true }, { text: "s", hit: false },
  ]);
  assert.deepEqual(matchSegs("abc", []), [{ text: "abc", hit: false }]);
  assert.deepEqual(matchSegs("", ["a"]), []);
});

// ---- Paging: Herdr's panels do not scroll sideways, so it shows the columns that fit ----

// ---- A typed code selects a card; Enter goes ----

test("hoverDetail: a hovered tab's code and names, purpose with its source, and state time, for the readout", () => {
  const stop = { code: "b2", spaceName: "dune", label: "tests", program: "claude", status: "blocked" };
  const d = hoverDetail(stop, { text: "Fix the flaky login test", source: "agent", revised: false }, 1000, 1000 + 4 * 60000, 40);
  assert.equal(d.title, "b2 dune · tests");
  assert.deepEqual(d.purpose, ["Fix the flaky login test"]);
  assert.equal(d.source, "· agent");
  assert.equal(d.program, "claude");
  assert.equal(d.status, "blocked");
  assert.equal(d.time, "4m");
  const bare = hoverDetail({ code: "c1", spaceName: "moss", label: "", program: "", status: "idle" }, null, null, 0, 30);
  assert.equal(bare.title, "c1 moss · —");
  assert.deepEqual(bare.purpose, []);
  assert.equal(bare.source, "");
  assert.equal(bare.program, "—");
  assert.equal(bare.time, "");
  // A long purpose takes at most two lines, ending in "…".
  const long = hoverDetail(stop, { text: "one two three four five six seven eight nine ten eleven twelve thirteen", source: "yours", revised: false }, null, 0, 20);
  assert.equal(long.purpose.length, 2);
  assert.match(long.purpose[1], /…$/);
});

test("lookStep: right and down go to the next card, left and up to the one before, wrapping", () => {
  assert.equal(lookStep(4, 1, "right"), 2);
  assert.equal(lookStep(4, 3, "down"), 0);
  assert.equal(lookStep(4, 0, "left"), 3);
  assert.equal(lookStep(4, 2, "up"), 1);
  assert.equal(lookStep(4, 2, "enter"), 2);
  assert.equal(lookStep(0, 0, "right"), 0);
});

const MIN = 60000;
const NOW = 1795400000000;
const stopAt = (extra) => ({ letter: "g", code: "g1", spaceName: "meridian", label: "docs", program: "claude", status: "blocked", terminal: "t1", ...extra });

test("lookCard: a waiting agent whose purpose is still its first prompt", () => {
  const card = lookCard({
    stop: stopAt(), labels: { "plato.first": "Write the getting started guide" },
    last: { text: "Write the getting started guide in docs/start.md.", at: NOW - 31 * MIN },
    folder: "/Users/me/demo/meridian", home: "/Users/me", tabs: 2, due: { label: "Fri 27", days: 5 },
    today: "ran 26m today", subAgents: 0, role: "NEXT1", since: NOW - 2 * MIN, now: NOW, perLine: 70,
  });
  assert.equal(card.code, "g1");
  assert.equal(card.where, "meridian · docs");
  assert.equal(card.badge, "NEEDS YOU 2m");
  assert.equal(card.tone, "bright");
  assert.equal(card.sub, "claude · waiting on you for 2m · NEXT1 goes here first");
  assert.deepEqual(card.rows.map((r) => r.k), ["PURPOSE", "LAST SENT", "FOLDER", "SPACE g", "TODAY", "SUB-AGENTS"]);
  assert.deepEqual(card.rows[0], { k: "PURPOSE", lines: ["Write the getting started guide"], note: "first prompt · no purpose set yet", tone: "text" });
  assert.deepEqual(card.rows[1], { k: "LAST SENT", lines: ["“Write the getting started guide in docs/start.md.”"], note: "31m ago", tone: "text" });
  assert.equal(card.rows[2].lines[0], "~/demo/meridian");
  assert.equal(card.rows[3].lines[0], "meridian · 2 tabs · due Fri 27 · 5 days");
  assert.equal(card.rows[5].lines[0], "none");
  assert.equal(card.rows[5].tone, "dim");
});

test("lookCard: a working agent with a revised purpose, a different first prompt and a sub-agent", () => {
  const card = lookCard({
    stop: stopAt({ letter: "c", code: "c1", spaceName: "orbit", label: "build", status: "working" }),
    labels: { "plato.purpose": "Make the build reproducible in CI", "plato.purpose_was": "Pin the toolchain", "plato.first": "Make the build reproducible" },
    last: { text: "Now run the build twice in CI.", at: NOW - 14 * MIN },
    folder: null, home: "/Users/me", tabs: 1, due: null, today: null, subAgents: 1, role: "NEXT", since: NOW - 14 * MIN, now: NOW, perLine: 70,
  });
  assert.equal(card.badge, "WORKING 14m");
  assert.equal(card.tone, "fg");
  assert.equal(card.sub, "claude · working for 14m · NEXT goes here");
  assert.deepEqual(card.rows.map((r) => r.k), ["PURPOSE", "FIRST PROMPT", "LAST SENT", "SPACE c", "TODAY", "SUB-AGENTS"]);
  assert.equal(card.rows[0].note, "agent, revised · earlier: “Pin the toolchain”");
  assert.deepEqual(card.rows[1].lines, ["“Make the build reproducible”"]);
  assert.equal(card.rows[3].lines[0], "orbit · 1 tab · no due date");
  assert.equal(card.rows[4].lines[0], "nothing ran today");
  assert.equal(card.rows[5].lines[0], "1 running");
});

test("lookCard: an idle shell with nothing set, and a long prompt kept to three lines", () => {
  const long = "word ".repeat(60).trim();
  const card = lookCard({
    stop: stopAt({ program: "zsh", status: null }), labels: {}, last: { text: long, at: NOW - 5 * MIN },
    folder: "/tmp/x", home: "/Users/me", tabs: 3, due: null, today: null, subAgents: 0, role: "", since: null, now: NOW, perLine: 40,
  });
  assert.equal(card.badge, "IDLE");
  assert.equal(card.tone, "dim");
  assert.equal(card.sub, "zsh · idle");
  assert.deepEqual(card.rows[0], { k: "PURPOSE", lines: ["—"], note: "none set · ⌘E sets one", tone: "dim" });
  assert.ok(card.rows[1].lines.length <= 3);
  assert.ok(card.rows[1].lines.every((l) => l.length <= 41));
});

test("lookCard: under a minute reads as <1m and just now, never 'now ago'", () => {
  const card = lookCard({
    stop: stopAt({ status: "working" }), labels: {}, last: { text: "go", at: NOW - 10000 },
    folder: null, home: "", tabs: 1, due: null, today: null, subAgents: 0, role: "", since: NOW - 20000, now: NOW, perLine: 60,
  });
  assert.equal(card.badge, "WORKING <1m");
  assert.equal(card.sub, "claude · working for under 1m");
  assert.equal(card.rows.find((r) => r.k === "LAST SENT").note, "just now");
});
