import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reconcile, spaceMoves, letterOf, stops, stopKey, currentStop, nextStop, prevStop,
  signalList, next1Agent, agentOrder, pushBack, backStop, stopCode, tabCount,
  routeRows, next1Run, markY, lampTop, ROW, tabLabel, duration, programWord,
  signOnLetters, closeUp, closeUpStep, MOVED_MS, labelOf, lastSent,
  arrivalFor, arrivalLive, arrivalShown, ARRIVAL_MS,
  waitingFor, waitingLetters, next1Words, arrivalWords, next1Label, nextMark, next1Arrow,
} from "../line.js";

const NOW = 1795100000000;
const ready = () => true;
const sp = (id, name, extra = {}) => ({ id, name, folder: `/w/${name}`, machine: null, tabs: [], ...extra });
const opts = (o = {}) => ({ now: NOW, ready, pending: null, ...o });

// ---- C: letters as slots ----

test("reconcile: a first run gives letters in Herdr's space order", () => {
  const r = reconcile(null, [sp("s1", "atlas"), sp("s2", "dune"), sp("s3", "moss")], opts());
  assert.equal(r.changed, true);
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "s1"], ["b", "s2"], ["c", "s3"]]);
  assert.equal(r.line.version, 1);
  assert.equal(r.line.slots[0].opened, NOW);
  assert.equal(r.line.slots[0].name, "atlas");
});

test("reconcile: nothing changed gives changed false", () => {
  const spaces = [sp("s1", "atlas"), sp("s2", "dune")];
  const first = reconcile(null, spaces, opts()).line;
  const r = reconcile(first, spaces, opts({ now: NOW + 5000 }));
  assert.equal(r.changed, false);
  assert.deepEqual(r.line, first);
});

test("reconcile C3: closing a middle space leaves a free slot with was, others keep letters", () => {
  const line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1"), sp("s3", "c1")], opts()).line;
  const r = reconcile(line, [sp("s1", "a1"), sp("s3", "c1")], opts({ now: NOW + 1 }));
  assert.equal(r.changed, true);
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "s1"], ["b", null], ["c", "s3"]]);
  assert.equal(r.line.slots[1].was, "b1");
  assert.equal(r.line.slots[1].closed, NOW + 1);
});

test("reconcile C4: closing the last space trims it and the free slots before it", () => {
  let line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1"), sp("s3", "c1")], opts()).line;
  line = reconcile(line, [sp("s1", "a1"), sp("s3", "c1")], opts()).line; // b free
  const r = reconcile(line, [sp("s1", "a1")], opts());
  assert.deepEqual(r.line.slots.map((s) => s.letter), ["a"]);
});

test("reconcile C2: a new space takes the first free slot", () => {
  let line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1"), sp("s3", "c1"), sp("s4", "d1")], opts()).line;
  line = reconcile(line, [sp("s1", "a1"), sp("s4", "d1")], opts()).line; // b, c free
  const r = reconcile(line, [sp("s1", "a1"), sp("s4", "d1"), sp("s5", "new")], opts());
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "s1"], ["b", "s5"], ["c", null], ["d", "s4"]]);
  assert.equal(r.line.slots[1].was, undefined);
});

test("reconcile C2: with no free slot a new space goes after the last slot", () => {
  const line = reconcile(null, [sp("s1", "a1")], opts()).line;
  const r = reconcile(line, [sp("s1", "a1"), sp("s2", "b1")], opts());
  assert.deepEqual(r.line.slots.map((s) => s.letter), ["a", "b"]);
});

test("reconcile C1: a space named like plato.pending takes the pending letter and clears pending", () => {
  let line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1"), sp("s3", "c1")], opts()).line;
  line = reconcile(line, [sp("s1", "a1"), sp("s3", "c1")], opts()).line; // b free
  const pending = { name: "docs", letter: "d", due: "2026-11-27", at: NOW };
  const r = reconcile(line, [sp("s1", "a1"), sp("s3", "c1"), sp("s9", "docs")], opts({ pending }));
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "s1"], ["b", null], ["c", "s3"], ["d", "s9"]]);
  assert.equal(r.line.slots[3].due, "2026-11-27");
  assert.equal(r.pending, null);
});

test("reconcile: a pending name that does not match leaves pending alone", () => {
  const pending = { name: "docs", letter: "b", due: null, at: NOW };
  const r = reconcile(null, [sp("s1", "a1")], opts({ pending }));
  assert.deepEqual(r.pending, pending);
});

test("reconcile: a renamed space keeps its letter and its new name is kept for was", () => {
  const line = reconcile(null, [sp("s1", "old")], opts()).line;
  const r = reconcile(line, [sp("s1", "new")], opts());
  assert.equal(r.line.slots[0].letter, "a");
  assert.equal(r.line.slots[0].name, "new");
});

test("reconcile: a space on a machine that is not ready is not made free", () => {
  const line = reconcile(null, [sp("s1", "a1"), sp("vps/s2", "b1", { machine: "vps" })], opts()).line;
  const r = reconcile(line, [sp("s1", "a1")], opts({ ready: (m) => m !== "vps" }));
  assert.equal(r.changed, false);
  assert.equal(r.line.slots[1].space, "vps/s2");
});

test("reconcile fallback: a gone id and a new id with the same folder keep the letter", () => {
  const line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1")], opts()).line;
  const r = reconcile(line, [sp("x1", "a1"), sp("x2", "b1")], opts());
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "x1"], ["b", "x2"]]);
});

test("reconcile: past z a new space gets no letter", () => {
  const many = Array.from({ length: 27 }, (_, i) => sp(`s${i}`, `n${i}`, { folder: `/f${i}` }));
  const r = reconcile(null, many, opts());
  assert.equal(r.line.slots.length, 26);
  assert.equal(r.line.slots[25].letter, "z");
});

test("letterOf: the letter of a space id, else null", () => {
  const line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1")], opts()).line;
  assert.equal(letterOf(line, "s2"), "b");
  assert.equal(letterOf(line, "nope"), null);
  assert.equal(letterOf(null, "s1"), null);
});

test("spaceMoves: Herdr's order follows the letters, local spaces only", () => {
  let line = reconcile(null, [sp("s1", "a1"), sp("s2", "b1"), sp("s3", "c1")], opts()).line;
  line = reconcile(line, [sp("s1", "a1"), sp("s3", "c1")], opts()).line;
  line = reconcile(line, [sp("s1", "a1"), sp("s3", "c1"), sp("s4", "new")], opts()).line; // s4 -> b
  const spaces = [sp("s1", "a1"), sp("s3", "c1"), sp("s4", "new"), sp("r/s5", "remote", { machine: "r" })];
  assert.deepEqual(spaceMoves(line, spaces), [{ id: "s4", index: 2 }]);
  assert.deepEqual(spaceMoves(line, [sp("s1", "a1"), sp("s4", "new"), sp("s3", "c1")]), []);
});

// ---- B: stops and stop codes ----

const tab = (id, index, extra = {}) => ({ id, index, name: String(index), status: null, settled: false, ...extra });
const pane = (p, t, extra = {}) => ({ pane: p, tab: t, terminal: `t-${p}`, status: null, program: { name: "zsh" }, title: "", ...extra });

function world() {
  const spaces = [
    sp("s1", "atlas", { tabs: [tab("t11", 1)] }),
    sp("s2", "dune", { tabs: [tab("t21", 1), tab("t22", 2)] }),
    sp("s3", "plans", { tabs: [tab("t31", 1), tab("t32", 2, { settled: true })] }),
  ];
  const panes = [pane("p11", "t11"), pane("p21", "t21"), pane("p22a", "t22"), pane("p22b", "t22"), pane("p31", "t31"), pane("p32", "t32")];
  // a = atlas, b = free, c = dune, d = plans
  const line = { version: 1, slots: [
    { letter: "a", space: "s1", name: "atlas" },
    { letter: "b", space: null, was: "old" },
    { letter: "c", space: "s2", name: "dune" },
    { letter: "d", space: "s3", name: "plans" },
  ] };
  return { spaces, panes, line };
}

test("stopCode: letter and tab number, plus the pane in a split tab", () => {
  assert.equal(stopCode("c", 3), "c3");
  assert.equal(stopCode("c", 3, 2), "c3.2");
  assert.equal(stopCode(null, 3), "?3");
});

test("stops: stops in line order, free slots skipped, split panes numbered, settled tabs left out", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  assert.deepEqual(s.map((x) => x.code), ["a1", "c1", "c2.1", "c2.2", "d1"]);
  assert.equal(s[2].pane, "p22a");
  assert.equal(s[0].space, "s1");
  assert.equal(stopKey(s[1]), "p21");
});

test("currentStop: by focused pane, else the first stop of the focused tab", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  assert.equal(currentStop(s, { pane: "p22b", tab: "t22" }).code, "c2.2");
  assert.equal(currentStop(s, { pane: null, tab: "t22" }).code, "c2.1");
  assert.equal(currentStop(s, null), null);
});

test("nextStop: walks stops in line order and wraps to a", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  assert.equal(nextStop(s, s[0]).code, "c1");
  assert.equal(nextStop(s, s[2]).code, "c2.2");
  assert.equal(nextStop(s, s[4]).code, "a1");
  assert.equal(nextStop(s, null).code, "a1");
  assert.equal(nextStop([s[0]], s[0]), null);
  assert.equal(nextStop([], null), null);
});

// ---- D: NEXT1 and BACK ----

const ag = (address, status, seq, paneId = `p-${address}`) => ({ address, status, seq, pane: paneId });

test("signalList: blocked longest-waiting first (lowest seq), then done oldest first", () => {
  const list = signalList([ag("t1", "idle", 1), ag("t2", "done", 5), ag("t3", "blocked", 9), ag("t4", "blocked", 3), ag("t5", "done", 2), ag("t6", "working", 4)]);
  assert.deepEqual(list.map((a) => a.address), ["t4", "t3", "t5", "t2"]);
});

test("next1Agent: the first of the signal list that is not where you are, else null", () => {
  const agents = [ag("t3", "blocked", 9), ag("t4", "blocked", 3)];
  assert.equal(next1Agent(agents, "t1").address, "t4");
  assert.equal(next1Agent(agents, "t4").address, "t3");
  assert.equal(next1Agent([ag("t4", "blocked", 3)], "t4"), null);
  assert.equal(next1Agent([ag("t1", "idle", 1)], null), null);
});

test("agentOrder: the signal list, then the rest in model order", () => {
  const agents = [ag("t1", "idle", 1), ag("t2", "done", 5), ag("t3", "blocked", 9), ag("t6", "working", 4)];
  assert.deepEqual(agentOrder(agents), ["t3", "t2", "t1", "t6"]);
});

test("pushBack: most recent first, no repeats, at most 20, same list when unchanged", () => {
  let list = [];
  for (let i = 0; i < 25; i++) list = pushBack(list, `p${i}`);
  assert.equal(list.length, 20);
  assert.equal(list[0], "p24");
  const again = pushBack(list, "p24");
  assert.equal(again, list);
  assert.deepEqual(pushBack(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(pushBack(null, "a"), ["a"]);
});

test("backStop: the most recent stop that still exists and is not the current one", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  assert.equal(backStop(["p21", "gone", "p11"], s, s[1]).code, "a1");
  assert.equal(backStop(["gone", "p22b"], s, s[0]).code, "c2.2");
  assert.equal(backStop(["p11"], s, s[0]), null);
  assert.equal(backStop(null, s, s[0]), null);
});

// ---- I: the route rows and the NEXT1 run ----

test("routeRows: the current slot shows its stops, others a row of dots, free slots a hint", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  const rows = routeRows(line, spaces, s, "s2");
  assert.deepEqual(rows.map((r) => r.type), ["slot", "dots", "slot", "free-hint", "slot", "stop", "stop", "stop", "slot", "dots"]);
  assert.equal(rows[0].y, 0);
  assert.equal(rows[1].y, ROW.slot);
  assert.equal(rows[5].stop.code, "c1");
  let y = 0;
  for (const r of rows) { assert.equal(r.y, y); y += r.h; }
});

test("next1Run: from the current stop row to the target, as a right-angled run", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  const rows = routeRows(line, spaces, s, "s2");
  const run = next1Run(rows, "p21", "p31");
  const from = rows.find((r) => r.type === "stop" && r.stop.pane === "p21");
  const to = rows[9];
  assert.equal(run.y1, from.y + from.h / 2);
  // to a dot, the run comes in under the dot row, so it crosses no other dot,
  // and rises from that line to the bottom edge of the target dot
  assert.equal(run.y2, to.y + ROW.dotUnder);
  assert.ok(run.y2 > to.y + ROW.dotY + 4 && run.y2 < to.y + to.h);
  assert.equal(run.rise, to.y + ROW.dotY + 4);
  assert.equal(run.x2, ROW.dotX);
  // a target stop row in the current space: under its two lines of text, then up into
  // the bottom of its marker, so the run never crosses the name
  const inSlot = next1Run(rows, "p21", "p22b");
  const target = rows.find((r) => r.type === "stop" && r.stop.pane === "p22b");
  assert.equal(inSlot.y2, target.y + ROW.stopUnder);
  assert.ok(inSlot.y2 > target.y + 40 && inSlot.y2 < target.y + target.h);
  assert.equal(inSlot.x2, ROW.stopX + 4);
  assert.equal(inSlot.rise, target.y + ROW.markY + 5);
  assert.equal(inSlot.tight, true);
  assert.equal(next1Run(rows, "p21", "nope"), null);
  assert.equal(next1Run(rows, "nope", "p31"), null);
});

for (const mod of ["plato-strip", "plato-sign", "plato-nowat", "plato-timetable", "plato-banner"]) {
  for (const file of ["line.js", "look.js"]) {
    test(`${mod} carries an identical copy of ${file} (mods cannot import across folders)`, () => {
      const a = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const b = readFileSync(new URL(`../../${mod}/${file}`, import.meta.url), "utf8");
      assert.equal(a, b);
    });
  }
}

test("plato (the keyset's SIGNAL line) carries an identical copy of line.js", () => {
  const a = readFileSync(new URL("../line.js", import.meta.url), "utf8");
  const b = readFileSync(new URL("../../plato/line.js", import.meta.url), "utf8");
  assert.equal(a, b);
});

test("tabLabel: a named tab's name, else the terminal's title, else the program", () => {
  assert.equal(tabLabel({ named: true, name: "AGENTS.md" }, { title: "x" }), "AGENTS.md");
  assert.equal(tabLabel({ named: false, name: "2" }, { title: "  fix login ", program: { name: "zsh" } }), "fix login");
  assert.equal(tabLabel({ named: false, name: "2" }, { title: "", program: { name: "zsh" } }), "zsh");
  assert.equal(tabLabel({ named: false, name: "2" }, null), "");
});

test("tabLabel: a title that is only the terminal id counts as none; then the program", () => {
  const tab = { named: false, name: "2" };
  const shell = { terminal: "t3v", title: "t3v", cwd: "/Users/me/dev/orbit/", program: { name: "zsh" } };
  assert.equal(tabLabel(tab, shell), "zsh");
  assert.equal(tabLabel(tab, { ...shell, program: null }), "");
  // a real title still wins, and a name you gave wins over all
  assert.equal(tabLabel(tab, { ...shell, title: "vim notes.md" }), "vim notes.md");
  assert.equal(tabLabel({ named: true, name: "logs" }, shell), "logs");
});

test("programWord: the short name of an agent, the process name of a shell or unknown program", () => {
  assert.equal(programWord({ key: "claude", name: "Claude Code" }), "claude");
  assert.equal(programWord({ key: "shell", name: "zsh" }), "zsh");
  assert.equal(programWord({ key: "program", name: "htop" }), "htop");
  assert.equal(programWord(null), "");
});

test("duration: how long, in PLATO's short words", () => {
  assert.equal(duration(null, NOW), "");
  assert.equal(duration(NOW - 20000, NOW), "now");
  assert.equal(duration(NOW - 4 * 60000, NOW), "4m");
  assert.equal(duration(NOW - 62 * 60000, NOW), "1h 02m");
  assert.equal(duration(NOW - 30 * 3600000, NOW), "1d 6h");
});

// ---- Round 2: sign-on letters, close up, arrival ----

const L = (...pairs) => ({ version: 1, slots: pairs.map(([letter, space]) => (space ? { letter, space, name: space } : { letter, space: null, closed: NOW, was: "x" })) });

test("signOnLetters: the first free slot, and the end of the line", () => {
  assert.deepEqual(signOnLetters(L(["a", "s1"], ["b", null], ["c", "s3"], ["d", null], ["e", "s5"])), { free: "b", end: "f" });
  assert.deepEqual(signOnLetters(L(["a", "s1"], ["b", "s2"])), { free: null, end: "c" });
  assert.deepEqual(signOnLetters(null), { free: null, end: "a" });
  const full = { version: 1, slots: [..."abcdefghijklmnopqrstuvwxyz"].map((l, i) => ({ letter: l, space: `s${i}` })) };
  assert.deepEqual(signOnLetters(full), { free: null, end: null });
});

test("reconcile: a pending sign-on at the end of the line takes that letter, not the free slot", () => {
  const line = L(["a", "s1"], ["b", null], ["c", "s3"]);
  const spaces = [sp("s1", "s1"), sp("s3", "s3"), sp("s9", "docs")];
  const r = reconcile(line, spaces, opts({ pending: { name: "docs", letter: "d", due: "2026-11-27" } }));
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "s1"], ["b", null], ["c", "s3"], ["d", "s9"]]);
  assert.equal(r.line.slots[3].due, "2026-11-27");
  assert.equal(r.pending, null);
});

test("reconcile: a pending sign-on at the first free slot takes it, with its due date", () => {
  const line = L(["a", "s1"], ["b", null], ["c", "s3"]);
  const r = reconcile(line, [sp("s1", "s1"), sp("s3", "s3"), sp("s9", "docs")], opts({ pending: { name: "docs", letter: "b", due: null } }));
  assert.deepEqual(r.line.slots.map((s) => [s.letter, s.space]), [["a", "s1"], ["b", "s9"], ["c", "s3"]]);
  assert.equal(r.line.slots[1].due, null);
});

test("closeUp: drops free slots, reletters in order, marks moved slots with moved_from", () => {
  const r = closeUp(L(["a", "s1"], ["b", null], ["c", "s3"], ["d", "s4"]), NOW);
  assert.deepEqual(r.slots.map((s) => [s.letter, s.space, s.moved_from ?? null]), [["a", "s1", null], ["b", "s3", "c"], ["c", "s4", "d"]]);
  assert.equal(r.slots[1].moved_at, NOW);
  assert.equal(r.slots[0].moved_at, undefined);
});

test("closeUp: a line with no free slots is unchanged", () => {
  const line = L(["a", "s1"], ["b", "s2"]);
  assert.deepEqual(closeUp(line, NOW), line);
});

test("reconcile: a was-mark from closing up goes after 24 hours", () => {
  const line = closeUp(L(["a", "s1"], ["b", null], ["c", "s3"]), NOW);
  const spaces = [sp("s1", "s1"), sp("s3", "s3")];
  const kept = reconcile(line, spaces, opts({ now: NOW + MOVED_MS - 1 }));
  assert.equal(kept.line.slots[1].moved_from, "c");
  const gone = reconcile(line, spaces, opts({ now: NOW + MOVED_MS }));
  assert.equal(gone.changed, true);
  assert.equal(gone.line.slots[1].moved_from, undefined);
  assert.equal(gone.line.slots[1].moved_at, undefined);
});

test("closeUpStep: apply once the signed-off space is gone, wait while it closes, drop after a minute", () => {
  assert.equal(closeUpStep(null, [], NOW), null);
  assert.equal(closeUpStep({ space: "s2", at: NOW }, [sp("s1", "a")], NOW), "apply");
  assert.equal(closeUpStep({ space: "s2", at: NOW }, [sp("s2", "b")], NOW + 1000), "wait");
  assert.equal(closeUpStep({ space: "s2", at: NOW }, [sp("s2", "b")], NOW + 61000), "drop");
  assert.equal(closeUpStep({ space: null, at: NOW }, [sp("s2", "b")], NOW), "apply");
});

const terms = [
  { address: "t1", labels: { "plato.last": "Add the v2 endpoint", "plato.last_at": "1795099000" } },
  { address: "t2", labels: { "herdr.space": "x" } },
  { address: "t3", labels: { "plato.last_at": "soon" } },
  { address: "t4", labels: { "plato.last": "fix it", "plato.last_at": "soon" } },
];

test("labelOf and lastSent: the last prompt and its time from a terminal's labels", () => {
  assert.equal(labelOf(terms, "t1", "plato.last"), "Add the v2 endpoint");
  assert.equal(labelOf(terms, "t9", "plato.last"), null);
  assert.equal(labelOf(terms, null, "plato.last"), null);
  assert.deepEqual(lastSent(terms, "t1"), { text: "Add the v2 endpoint", at: 1795099000000 });
  assert.equal(lastSent(terms, "t2"), null);
  assert.equal(lastSent(terms, "t3"), null);
  assert.deepEqual(lastSent(terms, "t4"), { text: "fix it", at: null });
});

const stopA = { code: "e1", spaceName: "plans", label: "main", pane: "pA", tab: "tA", terminal: "t5" };
const stopB = { code: "c3", spaceName: "moss", label: "api", pane: "pB", tab: "tB", terminal: "t1" };

test("arrivalFor: a record from the old stop to the new one, none when it did not change", () => {
  const a = arrivalFor(stopA, stopB, NOW, "1795099000");
  assert.deepEqual(a, {
    from: { code: "e1", name: "plans", label: "main" },
    to: { code: "c3", name: "moss", label: "api", key: "pB", terminal: "t1" },
    at: NOW, last_at: "1795099000",
  });
  assert.equal(arrivalFor(null, stopB, NOW, null), null);
  assert.equal(arrivalFor(stopB, stopB, NOW, null), null);
  assert.equal(arrivalFor(stopA, null, NOW, null), null);
});

test("arrivalLive: shows for 10 s, and clears early when a prompt is sent there", () => {
  const a = arrivalFor(stopA, stopB, NOW, "1795099000");
  assert.equal(arrivalLive(a, "1795099000", NOW + ARRIVAL_MS - 1), true);
  assert.equal(arrivalLive(a, "1795099000", NOW + ARRIVAL_MS), false);
  assert.equal(arrivalLive(a, "1795100005", NOW + 2000), false);
  assert.equal(arrivalLive(null, null, NOW), false);
  const none = arrivalFor(stopA, stopB, NOW, null);
  assert.equal(arrivalLive(none, null, NOW + 1000), true);
  assert.equal(arrivalLive(none, "1795100005", NOW + 1000), false);
});

test("arrivalShown: only the stop arrived at shows it", () => {
  const a = arrivalFor(stopA, stopB, NOW, null);
  assert.equal(arrivalShown(a, "pB", null, NOW + 1000), true);
  assert.equal(arrivalShown(a, "pA", null, NOW + 1000), false);
  assert.equal(arrivalShown(a, null, null, NOW + 1000), false);
  assert.equal(arrivalShown(a, "pB", null, NOW + ARRIVAL_MS), false);
});

// ---- review fixes (2026-11-20) ----

test("waitingFor: the signal list without the agent you are at", () => {
  const agents = [ag("t1", "blocked", 1), ag("t2", "done", 2), ag("t3", "working", 3)];
  assert.deepEqual(waitingFor(agents, "t1").map((a) => a.address), ["t2"]);
  assert.deepEqual(waitingFor(agents, null).map((a) => a.address), ["t1", "t2"]);
  assert.deepEqual(waitingFor([ag("t1", "idle", 1)], null), []);
});

test("waitingLetters: the letters of slots with an agent waiting, not counting where you are", () => {
  const all = [{ letter: "c", pane: "p-t1" }, { letter: "f", pane: "p-t2" }, { letter: "f", pane: "p-t3" }];
  const agents = [ag("t1", "blocked", 1), ag("t2", "done", 2), ag("t3", "working", 3)];
  assert.deepEqual([...waitingLetters(agents, all, "t1")], ["f"]);
  assert.deepEqual([...waitingLetters(agents, all, null)].sort(), ["c", "f"]);
  assert.deepEqual([...waitingLetters([ag("t9", "blocked", 1)], all, null)], []);
});

test("next1Words: the code and the reason first, so a cut keeps them", () => {
  assert.equal(next1Words(stopB, { status: "blocked" }), "→ c3 needs you · moss · api");
  assert.equal(next1Words(stopB, { status: "done" }), "→ c3 done · moss · api");
  assert.equal(next1Words(null, null), "nothing waiting");
});

test("arrivalWords: the arrival for the banner", () => {
  const a = arrivalFor(stopA, stopB, NOW, null);
  assert.equal(arrivalWords(a), "▶ ARRIVED AT c3 moss · api from e1 plans");
});

test("next1Label: at the target row's right end, left of the run's vertical", () => {
  const at = next1Label({ y1: 10, y2: 200, x2: ROW.dotX }, 236);
  assert.equal(at.top, 200 - 9);
  assert.ok(at.left > ROW.dotX + 10 && at.left + 44 <= 236);
  assert.equal(next1Label(null, 236), null);
});

test("nextMark: a ▼ at the end of the line, its tip on the target's marker", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  const rows = routeRows(line, spaces, s, "s2");
  const at = (key) => rows.find((r) => r.type === "stop" && stopKey(r.stop) === key);
  // the next stop in this space: on the branch, at the top edge of its 10 px marker
  assert.deepEqual(nextMark(rows, "p21", "p22a"), { on: "branch", tip: at("p22a").y + ROW.markY - 5 });
  // the next space: on the main line, at the top edge of its lettered square
  const d = rows.find((r) => r.type === "slot" && r.slot.letter === "d");
  assert.deepEqual(nextMark(rows, "p22b", "p31"), { on: "main", tip: d.y + (ROW.slot - ROW.slotBox) / 2 });
  // wrapping back to a: no line runs above a, so no mark
  assert.equal(nextMark(rows, "p22b", "p11"), null);
  assert.equal(nextMark(rows, "nope", "p31"), null);
  assert.equal(nextMark(rows, "p21", null), null);
});

test("next1Arrow: a ◀ along the run's last line to a dot, between the dot and the label", () => {
  const run = { y1: 10, y2: 200, x2: ROW.dotX, rise: 190 };
  const a = next1Arrow(run, 236);
  assert.equal(a.y, 200);
  assert.ok(a.x > ROW.dotX + 8 && a.x < 236 - 48 - 8);
  // too little room between the dot and the label: no arrow
  assert.equal(next1Arrow({ ...run, x2: 236 - 60 }, 236), null);
  // to a stop marker the run ends in its own ◀
  assert.equal(next1Arrow({ ...run, rise: null }, 236), null);
  assert.equal(next1Arrow(null, 236), null);
});

// ---- ALL (cmd-shift-i): every space's stops on the route ----

test("routeRows with all: other slots show one-line stop rows instead of dots", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  const rows = routeRows(line, spaces, s, "s2", true);
  assert.deepEqual(rows.map((r) => r.type), ["slot", "stop", "slot", "free-hint", "slot", "stop", "stop", "stop", "slot", "stop"]);
  const other = rows[1];
  assert.equal(other.compact, true);
  assert.equal(other.h, ROW.compact);
  assert.equal(other.stop.code, "a1");
  // the current space keeps its full rows
  assert.equal(rows[5].compact, undefined);
  assert.equal(rows[5].h, ROW.stop);
  let y = 0;
  for (const r of rows) { assert.equal(r.y, y); y += r.h; }
});

test("ALL: NEXT1 comes in under a compact row and rises into its lamp; NEXT's ▼ tips onto it", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  const rows = routeRows(line, spaces, s, "s2", true);
  const d1 = rows.find((r) => r.type === "stop" && r.stop.pane === "p31");
  assert.equal(markY(d1), d1.y + ROW.compactMarkY);
  assert.equal(lampTop(d1), d1.y + ROW.compactMarkY - 4);
  const run = next1Run(rows, "p21", "p31");
  assert.deepEqual(run, { y1: rows[5].y + rows[5].h / 2, y2: d1.y + ROW.compactUnder, x2: ROW.stopX + 4, rise: markY(d1) + 4, tight: true });
  // the line under the row stays inside the row, below its text, above the next row
  assert.ok(run.y2 > run.rise && run.y2 < d1.y + d1.h);
  // the next stop after c2.2 is d1, in the next space: the ▼ tips onto d1's lamp
  assert.deepEqual(nextMark(rows, "p22b", "p31"), { on: "branch", tip: lampTop(d1) });
});

// ---- BACK walks the line backward (NEXT's mirror); BACK1 returns to where you were ----

test("prevStop: the stop before this one in line order, wrapping to the last", () => {
  const { spaces, panes, line } = world();
  const s = stops(line, spaces, panes);
  const at = (pane) => s.find((x) => x.pane === pane);
  assert.equal(prevStop(s, at("p22a")).pane, "p21");
  assert.equal(prevStop(s, at("p21")).pane, "p11");   // into the space before
  assert.equal(prevStop(s, at("p11")).pane, s[s.length - 1].pane); // wraps to the end
  assert.equal(prevStop([s[0]], s[0]), null);
  assert.equal(prevStop([], null), null);
  // NEXT and BACK are mirrors
  for (const x of s) assert.equal(stopKey(prevStop(s, nextStop(s, x))), stopKey(x));
});


test("tabCount: the panes of a split tab count as one tab", () => {
  const st = (tab, pane) => ({ tab, pane });
  assert.equal(tabCount([st("t1", "p1"), st("t2", "p2a"), st("t2", "p2b")]), 2);
  assert.equal(tabCount([]), 0);
});
