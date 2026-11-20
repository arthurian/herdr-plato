import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stops } from "../line.js";
import {
  mapColumns, typeCode, codeCandidates, enterCode, jumpKey, startCursor, moveCursor, cursorAt,
  stateSince, mapState, signalRows, mapTotals, activityWords, fitColumns, columnWindow, codeWords, selectCode, backCode,
} from "../map.js";

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
const COLUMNS = mapColumns(LINE, SPACES, ALL);

test("mapColumns: one column per letter, the free one kept in its place", () => {
  assert.deepEqual(COLUMNS.map((t) => [t.letter, t.free, t.name]), [["a", false, "atlas"], ["b", true, ""], ["c", false, "moss"], ["d", false, "plans"]]);
  assert.deepEqual(COLUMNS[1].stops, []);
  assert.equal(COLUMNS[1].closed, 1795097520000);
  assert.equal(COLUMNS[1].was, "dune");
  assert.deepEqual(COLUMNS[2].stops.map((s) => s.code), ["c1", "c2", "c3.1", "c3.2"]);
});

test("typeCode: a letter then a number goes to that stop", () => {
  let r = typeCode("", "a", COLUMNS);
  assert.deepEqual(r, { buf: "a" });
  r = typeCode(r.buf, "1", COLUMNS);
  assert.equal(r.buf, "");
  assert.equal(r.go.code, "a1");
  assert.equal(typeCode("c", "2", COLUMNS).go.code, "c2");
});

test("typeCode: a free letter starts a sign-on there", () => {
  assert.deepEqual(typeCode("", "b", COLUMNS), { buf: "", signOn: "b" });
  assert.deepEqual(typeCode("c", "B", COLUMNS), { buf: "", signOn: "b" });
});

test("typeCode: a letter past the line, an unknown stop or a digit first are ignored", () => {
  assert.deepEqual(typeCode("", "x", COLUMNS), { buf: "" });
  assert.deepEqual(typeCode("a", "7", COLUMNS), { buf: "a" });
  assert.deepEqual(typeCode("", "3", COLUMNS), { buf: "" });
  assert.deepEqual(typeCode("c", "d", COLUMNS), { buf: "d" }); // another letter starts over
});

test("typeCode: a split tab waits for its pane; . and the pane number go", () => {
  let r = typeCode("c", "3", COLUMNS);
  assert.deepEqual(r, { buf: "c3" });
  r = typeCode(r.buf, ".", COLUMNS);
  assert.deepEqual(r, { buf: "c3." });
  assert.equal(typeCode(r.buf, "2", COLUMNS).go.code, "c3.2");
});

test("typeCode: c1 waits while c10 exists; Enter takes the exact code", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ code: `c${i + 1}` }));
  const columns = [{ letter: "c", free: false, stops: many }];
  assert.deepEqual(typeCode("c", "1", columns), { buf: "c1" });
  assert.equal(typeCode("c1", "0", columns).go.code, "c10");
  assert.equal(enterCode("c1", columns).code, "c1");
});

test("enterCode: the exact code, else the first that starts with it, never a bare letter", () => {
  assert.equal(enterCode("c3", COLUMNS).code, "c3.1");
  assert.equal(enterCode("a1", COLUMNS).code, "a1");
  assert.equal(enterCode("c", COLUMNS), null);
  assert.equal(enterCode("", COLUMNS), null);
  assert.deepEqual(codeCandidates("c3", COLUMNS).map((s) => s.code), ["c3.1", "c3.2"]);
});

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

test("stateSince and mapState", () => {
  const byCode = (c) => ALL.find((s) => s.code === c);
  assert.equal(stateSince(byCode("c1"), SPACES), 500);
  assert.equal(stateSince(byCode("c3.1"), SPACES), 2000);
  assert.equal(stateSince(byCode("c2"), SPACES), null);
  assert.equal(mapState("blocked"), "waiting");
  assert.equal(mapState("done"), "waiting");
  assert.equal(mapState("working"), "working");
  assert.equal(mapState(null), "idle");
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

test("mapTotals: spaces, free letters, tabs, states, longest running, oldest idle", () => {
  const t = mapTotals(LINE, ALL, SPACES);
  assert.deepEqual([t.spaces, t.free, t.tabs, t.waiting, t.working, t.idle], [3, 1, 5, 2, 1, 3]); // c3 is split: 6 stops, 5 tabs
  assert.equal(t.longest.stop.code, "c1");
  assert.equal(t.longest.since, 500);
  assert.equal(t.oldestIdle.stop.code, "d1");
  assert.equal(mapTotals(null, [], []).spaces, 0);
});

test("plato-signals carries identical copies of map.js, line.js and look.js", () => {
  for (const file of ["map.js", "line.js", "look.js"]) {
    const a = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const b = readFileSync(new URL(`../../plato-signals/${file}`, import.meta.url), "utf8");
    assert.equal(a, b, file);
  }
});

test("plato-route carries an identical copy of plato-timetable's day.js", () => {
  const a = readFileSync(new URL("../day.js", import.meta.url), "utf8");
  const b = readFileSync(new URL("../../plato-timetable/day.js", import.meta.url), "utf8");
  assert.equal(a, b);
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

// ---- JUMP (cmd-j): the map's codes without the map ----

const k = (key, mods = {}) => ({ key, modifiers: mods });

test("jumpKey: a letter then a number goes, as in the map", () => {
  let r = jumpKey("", k("c"), COLUMNS);
  assert.deepEqual(r, { buf: "c" });
  r = jumpKey(r.buf, k("2"), COLUMNS);
  assert.equal(r.go.code, "c2");
  // a split pane: c3 waits for its pane, then . and the number go
  assert.deepEqual(jumpKey("c", k("3"), COLUMNS), { buf: "c3" });
  assert.equal(jumpKey("c3.", k("2"), COLUMNS).go.code, "c3.2");
});

test("jumpKey: shift still held types C and # but counts as c and 3 (the key, not the character)", () => {
  assert.deepEqual(jumpKey("", k("c", { shift: true }), COLUMNS), { buf: "c" });
  assert.equal(jumpKey("a", k("1", { shift: true }), COLUMNS).go.code, "a1");
});

test("jumpKey: a free letter does nothing; it never starts a sign-on", () => {
  assert.deepEqual(jumpKey("", k("b"), COLUMNS), { buf: "" });
  assert.deepEqual(jumpKey("c", k("b"), COLUMNS), { buf: "c" });
});

test("jumpKey: a letter and Enter goes to that slot's active stop", () => {
  const sp = SPACES.map((s) => (s.id === "s3" ? { ...s, tabs: s.tabs.map((t) => ({ ...t, active: t.id === "t32" })) } : s));
  const columns = mapColumns(LINE, sp, stops(LINE, sp, PANES));
  assert.equal(jumpKey("c", k("enter"), columns).go.code, "c2");
  // no active tab known: the space's first stop
  assert.equal(jumpKey("d", k("enter"), COLUMNS).go.code, "d1");
  // a code and Enter takes the code; c3 in a split tab goes to c3.1
  assert.equal(jumpKey("c3", k("enter"), COLUMNS).go.code, "c3.1");
});

test("jumpKey: Esc, or Enter with nothing typed, cancels; Backspace takes back a key", () => {
  assert.deepEqual(jumpKey("c", k("escape"), COLUMNS), { cancel: true });
  assert.deepEqual(jumpKey("", k("enter"), COLUMNS), { cancel: true });
  assert.deepEqual(jumpKey("c3", k("backspace"), COLUMNS), { buf: "c" });
  // other keys and command chords change nothing
  assert.deepEqual(jumpKey("c", k("left"), COLUMNS), { buf: "c" });
  assert.deepEqual(jumpKey("c", k("2", { platform: true }), COLUMNS), { buf: "c" });
});

// ---- Paging: Herdr's map panel does not scroll sideways, so it shows the columns that fit ----

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

test("codeWords: what the GO box says for the code typed so far", () => {
  assert.deepEqual(codeWords("", COLUMNS), { text: "type a code: c3", kind: "hint" });
  assert.deepEqual(codeWords("c", COLUMNS), { text: "c moss · add its tab number", kind: "space" });
  assert.deepEqual(codeWords("c2", COLUMNS), { text: `c2 moss · ${COLUMNS[2].stops[1].label}`, kind: "tab" });
  assert.deepEqual(codeWords("z", COLUMNS), { text: "no such space", kind: "none" });
  assert.deepEqual(codeWords("c9", COLUMNS), { text: "no such tab", kind: "none" });
});

// ---- In the map, a typed code selects a card; Enter goes ----

test("selectCode: a letter selects its space's first card, a free letter its dashed card", () => {
  assert.deepEqual(selectCode("", "c", COLUMNS), { code: "c", cursor: { col: 2, row: 0 } });
  assert.deepEqual(selectCode("", "C", COLUMNS), { code: "c", cursor: { col: 2, row: 0 } });
  assert.deepEqual(selectCode("", "b", COLUMNS), { code: "b", cursor: { col: 1, row: 0 } });
});

test("selectCode: digits narrow it to the tab, the exact code first, a split tab to its pane", () => {
  assert.deepEqual(selectCode("c", "2", COLUMNS), { code: "c2", cursor: { col: 2, row: 1 } });
  assert.deepEqual(selectCode("c", "3", COLUMNS), { code: "c3", cursor: { col: 2, row: 2 } });   // c3.1 until a pane is typed
  assert.deepEqual(selectCode("c3", ".", COLUMNS), { code: "c3.", cursor: { col: 2, row: 2 } });
  assert.deepEqual(selectCode("c3.", "2", COLUMNS), { code: "c3.2", cursor: { col: 2, row: 3 } });
});

test("selectCode: an unknown letter, a code that matches nothing or a digit first change nothing", () => {
  assert.deepEqual(selectCode("", "z", COLUMNS), { code: "", cursor: null });
  assert.deepEqual(selectCode("c", "9", COLUMNS), { code: "c", cursor: null });
  assert.deepEqual(selectCode("", "5", COLUMNS), { code: "", cursor: null });
});

test("backCode: Backspace selects what the shorter code selects, and with no code left, where you are", () => {
  const here = COLUMNS[3].stops[0];                                                        // d1
  assert.deepEqual(backCode("c3.2", COLUMNS, here), { code: "c3.", cursor: { col: 2, row: 2 } });
  assert.deepEqual(backCode("c2", COLUMNS, here), { code: "c", cursor: { col: 2, row: 0 } });  // the space's first card
  assert.deepEqual(backCode("c", COLUMNS, here), { code: "", cursor: { col: 3, row: 0 } });    // back to you are here
  assert.deepEqual(backCode("", COLUMNS, here), { code: "", cursor: null });                   // nothing typed: stay put
});
