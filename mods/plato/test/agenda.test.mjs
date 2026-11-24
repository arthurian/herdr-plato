import { test } from "node:test";
import assert from "node:assert/strict";
import { stops } from "../line.js";
import { letterColumns } from "../overview.js";
import { agendaCur, columnWindow, columnWords, cursorAt, dayBlocks, fitColumns, letterEntry, moveCursor, startCursor, totalsLine, weekDays, weekGrid, weekTotals } from "../agenda.js";
import { dueWords } from "../day.js";

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

test("startCursor: on the current stop, else the first stop", () => {
  assert.deepEqual(startCursor(COLUMNS, ALL.find((s) => s.code === "c2")), { col: 2, row: 1 });
  assert.deepEqual(startCursor(COLUMNS, null), { col: 0, row: 0 });
  const freeFirst = [{ letter: "a", free: true, stops: [] }, ...COLUMNS.slice(2)];
  assert.deepEqual(startCursor(freeFirst, null), { col: 1, row: 0 });
});

test("moveCursor: arrows move along a column and across columns, without wrapping", () => {
  let c = { col: 2, row: 3 };
  c = moveCursor(c, "down", COLUMNS);
  assert.deepEqual(c, { col: 2, row: 3 });
  c = moveCursor(c, "right", COLUMNS);
  assert.deepEqual(c, { col: 3, row: 0 }); // d has one stop
  c = moveCursor(c, "right", COLUMNS);
  assert.deepEqual(c, { col: 3, row: 0 });
  c = moveCursor({ col: 2, row: 2 }, "left", COLUMNS);
  assert.deepEqual(c, { col: 1, row: 0 }); // the free column
  assert.equal(cursorAt(COLUMNS, c).column.letter, "b");
  assert.equal(cursorAt(COLUMNS, c).stop, null);
  c = moveCursor(c, "left", COLUMNS);
  assert.deepEqual(c, { col: 0, row: 0 });
  assert.deepEqual(moveCursor({ col: 0, row: 0 }, "up", COLUMNS), { col: 0, row: 0 });
  assert.deepEqual(moveCursor({ col: 0, row: 0 }, "x", COLUMNS), { col: 0, row: 0 });
  assert.equal(cursorAt(COLUMNS, { col: 2, row: 1 }).stop.code, "c2");
});

// ---- JUMP (cmd-j): find a tab by its code, name, purpose or folder ----

// ---- Paging: Herdr's agenda panel does not scroll sideways, so it shows the columns that fit ----

test("fitColumns: how many columns of min px, gap apart, fit in a width; at least one", () => {
  assert.equal(fitColumns(1100, 170, 18), 5);   // 5 × 170 + 4 × 18 = 922; 6 would need 1110
  assert.equal(fitColumns(1110, 170, 18), 6);
  assert.equal(fitColumns(100, 170, 18), 1);
});

test("columnWindow: all columns when they fit", () => {
  assert.deepEqual(columnWindow(5, 4, 6), { start: 0, end: 5 });
});

test("columnWindow: slides just far enough to show the cursor, and keeps still while it is in view", () => {
  assert.deepEqual(columnWindow(7, 2, 5), { start: 0, end: 5 });      // c in view from the start
  assert.deepEqual(columnWindow(7, 6, 5, 0), { start: 2, end: 7 });   // g: slide right by 2
  assert.deepEqual(columnWindow(7, 3, 5, 2), { start: 2, end: 7 });   // back to d: still in view, no move
  assert.deepEqual(columnWindow(7, 1, 5, 2), { start: 1, end: 6 });   // b: slide left by 1
  assert.deepEqual(columnWindow(7, 0, 5, 9), { start: 0, end: 5 });   // a stale start is clamped
});

// ---- In the agenda, a typed code selects a card; Enter goes ----

const at = (h, m = 0, s = 0) => new Date(2026, 10, 19, h, m, s).getTime(); // Thu 19 Nov 2026
const AXIS = { from: at(8), to: at(16), hours: [] }; // 480 px: one px per minute

test("dayBlocks: closed bands, then stretches, then your time, with labels", () => {
  const entry = {
    segs: [{ from: at(9), to: at(10), kind: "ran" }, { from: at(10), to: at(10, 10), kind: "wait" }],
    you: [{ from: at(9), to: at(9, 1) }],
  };
  const ses = [{ from: at(8), to: at(12) }, { from: at(13), to: at(16) }];
  assert.deepEqual(dayBlocks(entry, ses, AXIS, 480), [
    { kind: "closed", top: 240, height: 60, label: "not recorded" },
    { kind: "ran", top: 60, height: 60, label: "ran 1h 00m" },
    { kind: "wait", top: 120, height: 10, label: "" },
    { kind: "you", top: 60, height: 3, label: "" },
  ]);
});

test("dayBlocks: a wait of 20 minutes has its label, and a stretch before the axis is clipped", () => {
  const entry = { segs: [{ from: at(7), to: at(8, 20), kind: "wait" }], you: [] };
  assert.deepEqual(dayBlocks(entry, [{ from: at(7), to: at(16) }], AXIS, 480), [
    { kind: "wait", top: 0, height: 20, label: "WAIT 20m" },
  ]);
});

test("dayBlocks: closed bands with no entry", () => {
  assert.deepEqual(dayBlocks(undefined, [{ from: at(10), to: at(16) }], AXIS, 480), [
    { kind: "closed", top: 0, height: 120, label: "not recorded" },
  ]);
});

test("columnWords: a quiet space has only QUIET; no due date has no line", () => {
  const now = at(15, 40);
  assert.deepEqual(columnWords({ entry: undefined, due: null, now }),
    { due: null, dueTone: "none", day: null, last: "QUIET today", quiet: true });
});

test("columnWords: the day and the last activity; where you are reads as activity, not as words", () => {
  const now = at(15, 40);
  const entry = { segs: [{ from: at(14), to: at(15), kind: "ran" }], you: [{ from: at(14), to: at(14, 20) }] };
  assert.equal(columnWords({ entry, due: null, now }).day, "ran 1h 00m · you 20m");
  assert.equal(columnWords({ entry, due: null, now }).last, "last active 40m ago");
  assert.equal(columnWords({ entry, due: null, now: at(15, 0, 30) }).last, "active now");
  const hereNow = { segs: entry.segs, you: [{ from: at(15, 30), to: now }] };
  assert.equal(columnWords({ entry: hereNow, due: null, now }).last, "active now");
});

test("columnWords: due tones", () => {
  const now = at(15, 40);
  const d = (days) => ({ letter: "c", name: "orbit", due: "x", days, label: "Sat 21" });
  for (const [days, tone] of [[-1, "late"], [0, "soon"], [2, "soon"], [3, "plain"]]) {
    const w = columnWords({ entry: undefined, due: d(days), now });
    assert.equal(w.dueTone, tone);
    assert.equal(w.due, dueWords(d(days)));
  }
});

test("weekDays: four days before today, today and four after", () => {
  const d = weekDays(at(15, 40));
  assert.deepEqual(d.map((x) => x.label), ["Sun 15", "Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20", "Sat 21", "Sun 22", "Mon 23"]);
  assert.equal(d.map((x) => (x.today ? "t" : x.past ? "p" : "f")).join(""), "pppptffff");
  assert.equal(d[4].key, "2026-11-19");
});

// c: orbit, opened Tue 17, due Sat 21, ran 2h on Wed 18 and 1h today.
// d: atlas, opened before the week, no activity. b: free.
const W_SPACES = [{ id: "s3", name: "orbit", tabs: [] }, { id: "s4", name: "atlas", tabs: [] }];
const W_LINE = { slots: [
  { letter: "b", space: null, was: "dune" },
  { letter: "c", space: "s3", opened: at(12) - 2 * 24 * 3600000, due: "2026-11-21" },
  { letter: "d", space: "s4", opened: at(12) - 30 * 24 * 3600000, due: "2026-12-01" },
] };
const runFor = (d, h1, h2) => [
  { t: d(h1), e: "open" }, { t: d(h1), e: "line", l: "c", n: "orbit" }, { t: d(h1), e: "line", l: "d", n: "atlas" },
  { t: d(h1), e: "agent", a: "t1", c: "c1", s: "working" }, { t: d(h2), e: "close" },
];
const wed = (h) => new Date(2026, 10, 18, h).getTime();
const W_EVENTS = new Map([["2026-11-18", runFor(wed, 9, 11)], ["2026-11-19", runFor(at, 9, 10)]]);

test("weekGrid: cells, totals, last and due, with a day before the space opened", () => {
  const now = at(15, 40);
  const rows = weekGrid(weekDays(now), W_EVENTS, W_LINE, W_SPACES, now);
  assert.deepEqual(rows[0], { letter: "b", free: true, was: "dune" });
  const c = rows[1];
  assert.deepEqual(c.cells.map((x) => x.kind), ["before", "before", "none", "ran", "ran", "future", "due", "future", "future"]);
  assert.equal(c.cells[3].ran, 2 * 3600000);
  assert.equal(c.ran, 3 * 3600000);
  assert.equal(c.last, "today");
  assert.equal(c.quiet, false);
  assert.equal(c.dueLater, false);
});

test("weekGrid: a quiet space, and a due date after the week", () => {
  const now = at(15, 40);
  const d = weekGrid(weekDays(now), W_EVENTS, W_LINE, W_SPACES, now)[2];
  assert.deepEqual(d.cells.slice(0, 5).map((x) => x.kind), ["none", "none", "none", "none", "none"]);
  assert.equal(d.last, "before Sun 15");
  assert.equal(d.quiet, true);
  assert.equal(d.dueLater, true);
  assert.equal(d.late, false);
});

test("weekTotals and totalsLine", () => {
  const now = at(15, 40);
  const days = weekDays(now);
  const t = weekTotals(weekGrid(days, W_EVENTS, W_LINE, W_SPACES, now), days);
  assert.deepEqual(t, { ran: 3 * 3600000, you: 0, busiest: { label: "Wed 18", ran: 2 * 3600000 } });
  assert.equal(totalsLine("week", t), "agents ran 3h 00m · you 0m · busiest Wed 18 · 2h 00m");
  assert.equal(totalsLine("today", { ran: 3600000, wait: 0, you: 1200000, quiet: 2 }), "agents ran 1h 00m · waited on you 0m · you 20m · 2 quiet");
});

test("weekGrid and columnWords: under a minute in a day is not activity", () => {
  const now = at(15, 40);
  // c: only 30 seconds of your time today (you passed through with NEXT).
  const ev = [{ t: at(9), e: "open" }, { t: at(9), e: "line", l: "c", n: "orbit" }, { t: at(9), e: "focus", c: "c1" },
    { t: at(9, 0, 30), e: "focus", c: null }, { t: at(10), e: "close" }];
  const line = { slots: [{ letter: "c", space: "s3", opened: at(0) - 30 * 24 * 3600000 }] };
  const c = weekGrid(weekDays(now), new Map([["2026-11-19", ev]]), line, W_SPACES, now)[0];
  assert.equal(c.cells[4].kind, "none");
  assert.equal(c.quiet, true);
  const entry = { segs: [], you: [{ from: at(9), to: at(9, 0, 30) }] };
  assert.equal(columnWords({ entry, due: null, now }).quiet, true);
  assert.equal(columnWords({ entry, due: null, now }).last, "QUIET today");
});

test("weekGrid: a cell carries its waited time too", () => {
  const now = at(15, 40);
  const ev = [{ t: at(9), e: "open" }, { t: at(9), e: "line", l: "c", n: "orbit" }, { t: at(9), e: "agent", a: "t1", c: "c1", s: "blocked" }, { t: at(9, 20), e: "close" }];
  const line = { slots: [{ letter: "c", space: "s3", opened: at(0) - 30 * 24 * 3600000 }] };
  const c = weekGrid(weekDays(now), new Map([["2026-11-19", ev]]), line, W_SPACES, now)[0];
  assert.deepEqual(c.cells[4], { kind: "ran", ran: 0, wait: 20 * 60000, you: 0 });
});

test("letterEntry: a letter's stretches since its space opened, whatever its name", () => {
  const segs = { c: {
    dune: { segs: [{ from: at(8), to: at(9), kind: "ran" }], you: [{ from: at(8), to: at(8, 30) }] },
    orbit: { segs: [{ from: at(10), to: at(11), kind: "ran" }], you: [] },
    "orbit 2": { segs: [{ from: at(12), to: at(12, 30), kind: "wait" }], you: [] },
  } };
  assert.deepEqual(letterEntry(segs, "c", at(8, 45)), {
    segs: [{ from: at(8, 45), to: at(9), kind: "ran" }, { from: at(10), to: at(11), kind: "ran" }, { from: at(12), to: at(12, 30), kind: "wait" }],
    you: [],
  });
  assert.equal(letterEntry(segs, "x", 0), undefined);
});

test("weekGrid: a renamed space keeps its history", () => {
  const now = at(15, 40);
  const renamed = [{ id: "s3", name: "orbit 2", tabs: [] }, { id: "s4", name: "atlas", tabs: [] }];
  const c = weekGrid(weekDays(now), W_EVENTS, W_LINE, renamed, now)[1];
  assert.equal(c.name, "orbit 2");
  assert.equal(c.ran, 3 * 3600000);
});

test("weekGrid: after CLOSE UP, a space counts its new letter only from when it moved there", () => {
  const now = at(15, 40);
  // Y held d until noon (ran 9-12); then CLOSE UP moved X from e to d (X ran at d 13-14).
  const ev = [
    { t: at(9), e: "open" }, { t: at(9), e: "line", l: "d", n: "Y" }, { t: at(9), e: "agent", a: "y", c: "d1", s: "working" },
    { t: at(12), e: "agent", a: "y", c: "d1", s: null }, { t: at(12), e: "line", l: "d", n: "X" },
    { t: at(13), e: "agent", a: "x", c: "d1", s: "working" }, { t: at(14), e: "close" },
  ];
  const line = { slots: [{ letter: "d", space: "sx", opened: at(0) - 30 * 24 * 3600000, letter_at: at(12) }] };
  const d = weekGrid(weekDays(now), new Map([["2026-11-19", ev]]), line, [{ id: "sx", name: "X", tabs: [] }], now)[0];
  assert.equal(d.cells[4].ran, 3600000);
  assert.deepEqual(d.cells.slice(0, 4).map((c) => c.kind), ["before", "before", "before", "before"]);
});

test("weekGrid: a due date of today marks today's cell and says so", () => {
  const now = at(15, 40);
  const line = { slots: [{ letter: "c", space: "s3", opened: at(0) - 30 * 24 * 3600000, due: "2026-11-19" }] };
  const c = weekGrid(weekDays(now), new Map(), line, W_SPACES, now)[0];
  assert.equal(c.cells[4].due, true);
  assert.equal(c.dueNote, dueWords(c.due));
});

test("weekGrid: dueNote for a due date after the week, a late one, and none", () => {
  const now = at(15, 40);
  const rows = weekGrid(weekDays(now), W_EVENTS, W_LINE, W_SPACES, now);
  assert.equal(rows[2].dueNote, `${dueWords(rows[2].due)} →`);
  assert.equal(rows[1].dueNote, null);
  const late = weekGrid(weekDays(now), new Map(), { slots: [{ letter: "c", space: "s3", opened: 0, due: "2026-11-17" }] }, W_SPACES, now)[0];
  assert.equal(late.dueNote, dueWords(late.due));
});

test("agendaCur: what the keys panel names and acts on under the agenda's cursor", () => {
  const column = { letter: "g", name: "meridian", stops: [] };
  const stop = { code: "g1", tab: "tb1", label: "docs" };
  assert.deepEqual(agendaCur({ column, stop }), { space: "g", code: "g1", tab: "tb1", name: "meridian", label: "docs" });
  assert.deepEqual(agendaCur({ column, stop: null }), { space: "g", code: null, tab: null, name: "meridian", label: "" });
  assert.equal(agendaCur({ column: null, stop: null }), null);
});
