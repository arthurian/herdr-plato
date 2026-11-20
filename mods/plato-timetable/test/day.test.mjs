import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey, dayStart, worldOf, snapshot, changes, dayText, parseDay,
  sessions, gaps, build, slotKind, dueList, daysWords, dueWords,
  waits, responseWords, rowTotals, short, windowAxis, xAt, windowTicks, waitCode, SPANS, daysBefore,
} from "../day.js";

const at = (h, m = 0) => new Date(2026, 10, 19, h, m).getTime(); // Thu 19 Nov 2026, local time
const NOW = at(15, 40);

const world = (slots, agents = {}, focus = null) => ({ slots, agents, focus });

test("dayKey and dayStart use local time", () => {
  assert.equal(dayKey(NOW), "2026-11-19");
  assert.equal(dayStart(NOW), at(0));
});

test("worldOf: occupied letters with names, agents with a state, the focus code", () => {
  const line = { slots: [{ letter: "a", space: "s1" }, { letter: "b", space: null }, { letter: "c", space: "gone" }] };
  const stops = [
    { code: "a1", terminal: "t1", status: "working" },
    { code: "a2", terminal: "t2", status: null },   // a shell: no state
    { code: "a3", terminal: null, status: "idle" }, // a mod pane
  ];
  assert.deepEqual(worldOf(line, [{ id: "s1", name: "plans" }], stops, "a1"), {
    slots: { a: { space: "s1", name: "plans" } },
    agents: { t1: { c: "a1", s: "working" } },
    focus: "a1",
  });
});

test("snapshot: an open, then every letter, agent and the focus at the same time", () => {
  const w = world({ b: { space: "s2", name: "io" }, a: { space: "s1", name: "plans" } }, { t1: { c: "a1", s: "idle" } }, "a1");
  assert.deepEqual(snapshot(w, 5), [
    { t: 5, e: "open" },
    { t: 5, e: "line", l: "a", n: "plans" },
    { t: 5, e: "line", l: "b", n: "io" },
    { t: 5, e: "agent", a: "t1", c: "a1", s: "idle" },
    { t: 5, e: "focus", c: "a1" },
  ]);
  assert.deepEqual(snapshot(world({}), 7, true), [{ t: 7, e: "open", carry: true }]);
});

test("changes: nothing changed gives nothing; a rename alone is no change", () => {
  const a = world({ a: { space: "s1", name: "plans" } }, { t1: { c: "a1", s: "idle" } }, "a1");
  const b = world({ a: { space: "s1", name: "renamed" } }, { t1: { c: "a1", s: "idle" } }, "a1");
  assert.deepEqual(changes(a, b, 9), []);
});

test("changes: state, stop code, new and gone agents, letters and focus", () => {
  const a = world({ a: { space: "s1", name: "plans" }, b: { space: "s2", name: "io" } }, { t1: { c: "a1", s: "idle" }, t2: { c: "b1", s: "working" } }, "a1");
  const b = world({ a: { space: "s1", name: "plans" }, c: { space: "s3", name: "new" } }, { t1: { c: "a1", s: "working" }, t3: { c: "c1", s: "idle" } }, "c1");
  assert.deepEqual(changes(a, b, 9), [
    { t: 9, e: "line", l: "b", n: null },
    { t: 9, e: "line", l: "c", n: "new" },
    { t: 9, e: "agent", a: "t1", c: "a1", s: "working" },
    { t: 9, e: "agent", a: "t2", c: "b1", s: null },
    { t: 9, e: "agent", a: "t3", c: "c1", s: "idle" },
    { t: 9, e: "focus", c: "c1" },
  ]);
  // a different space taking the same letter is a change
  const c = world({ a: { space: "s9", name: "plans" } });
  assert.deepEqual(changes(world({ a: { space: "s1", name: "plans" } }), c, 1), [{ t: 1, e: "line", l: "a", n: "plans" }]);
});

test("dayText and parseDay round-trip; a broken or missing file is empty", () => {
  const evs = [{ t: 1, e: "open" }, { t: 2, e: "focus", c: "a1" }];
  const text = dayText("2026-11-19", evs);
  assert.deepEqual(parseDay(text), evs);
  assert.equal(text.split("\n").length, 5); // header, two events, footer, final newline
  assert.deepEqual(parseDay(dayText("2026-11-19", [])), []);
  assert.deepEqual(parseDay(null), []);
  assert.deepEqual(parseDay("{\"events\": [{\"t\":1"), []);
  assert.deepEqual(parseDay("{\"events\": [{\"t\":1,\"e\":\"open\"}, {\"bad\":1}, null]}"), [{ t: 1, e: "open" }]);
});

test("sessions: open to close; a missing close (a reload) runs to the next open; the live one runs to now", () => {
  const evs = [
    { t: at(9), e: "open" }, { t: at(10), e: "focus", c: "a1" }, { t: at(11), e: "close" },
    { t: at(12), e: "open" }, { t: at(12, 30), e: "focus", c: "a1" }, // reloaded: no close
    { t: at(14), e: "open" }, { t: at(14, 10), e: "focus", c: "a1" },
  ];
  assert.deepEqual(sessions(evs, NOW), [
    { from: at(9), to: at(11) }, { from: at(12), to: at(14) }, { from: at(14), to: NOW },
  ]);
  assert.deepEqual(sessions(evs, NOW, false).at(-1), { from: at(14), to: at(14, 10) });
  assert.deepEqual(sessions([{ t: 1, e: "focus", c: "a1" }], NOW), []); // nothing before an open counts
});

test("gaps: the closed stretches between sessions, and before and after them", () => {
  const ses = [{ from: at(9), to: at(11) }, { from: at(12), to: at(12, 30) }, { from: at(14), to: NOW }];
  assert.deepEqual(gaps(ses, at(8), NOW), [
    { from: at(8), to: at(9) }, { from: at(11), to: at(12) }, { from: at(12, 30), to: at(14) },
  ]);
  assert.deepEqual(gaps([], at(8), at(9)), [{ from: at(8), to: at(9) }]);
  assert.deepEqual(gaps([{ from: at(8), to: at(9) }], at(8), at(10)), [{ from: at(9), to: at(10) }]);
});

test("slotKind: blocked is a wait, working is a run, done and idle are idle", () => {
  assert.equal(slotKind({ t1: { c: "a1", s: "working" }, t2: { c: "a2", s: "blocked" } }, "a"), "wait");
  assert.equal(slotKind({ t1: { c: "a1", s: "working" }, t2: { c: "b1", s: "blocked" } }, "a"), "ran");
  assert.equal(slotKind({ t1: { c: "a1", s: "done" } }, "a"), "idle");
  assert.equal(slotKind({}, "a"), "idle");
});

test("build: runs, waits and idle per letter; a gap where the app was closed; free slot ends", () => {
  const evs = [
    ...snapshot(world({ a: { space: "s1", name: "plans" }, b: { space: "s2", name: "io" } }, { t1: { c: "a1", s: "idle" }, t2: { c: "b1", s: "idle" } }, "a1"), at(9)),
    { t: at(9, 30), e: "agent", a: "t1", c: "a1", s: "working" },
    { t: at(10), e: "agent", a: "t1", c: "a1", s: "blocked" },
    { t: at(10, 15), e: "focus", c: "b1" },
    { t: at(10, 15), e: "agent", a: "t1", c: "a1", s: "working" },
    { t: at(11), e: "close" },
    ...snapshot(world({ a: { space: "s1", name: "plans" } }, { t1: { c: "a1", s: "idle" } }, "a1"), at(13)),
    { t: at(14), e: "line", l: "a", n: null },
  ];
  const g = build(evs, NOW);
  assert.deepEqual(g.sessions, [{ from: at(9), to: at(11) }, { from: at(13), to: NOW }]);
  assert.deepEqual(g.rows.a.segs, [
    { from: at(9), to: at(9, 30), kind: "idle" },
    { from: at(9, 30), to: at(10), kind: "ran" },
    { from: at(10), to: at(10, 15), kind: "wait" },
    { from: at(10, 15), to: at(11), kind: "ran" },
    { from: at(13), to: at(14), kind: "idle" }, // after the gap; a went free at 14:00
  ]);
  assert.deepEqual(g.rows.a.ends, [at(14)]);
  assert.equal(g.rows.a.name, "plans");
  assert.deepEqual(g.rows.b.segs, [{ from: at(9), to: at(11), kind: "idle" }]); // b not in the second session
  assert.deepEqual(g.path, [
    { from: at(9), to: at(10, 15), letter: "a" },
    { from: at(10, 15), to: at(11), letter: "b" },
    { from: at(13), to: at(14), letter: "a" }, // the path stops when its space leaves the line
  ]);
});

test("build: a session with no close runs to the next open; not live, the last stops at its last event", () => {
  const evs = [
    ...snapshot(world({ a: { space: "s1", name: "p" } }), at(9)),
    { t: at(10), e: "agent", a: "t1", c: "a1", s: "working" },
    ...snapshot(world({ a: { space: "s1", name: "p" } }), at(12)),
  ];
  assert.deepEqual(build(evs, NOW).rows.a.segs, [
    { from: at(9), to: at(10), kind: "idle" }, { from: at(10), to: at(12), kind: "ran" }, { from: at(12), to: NOW, kind: "idle" },
  ]);
  assert.deepEqual(build(evs, NOW, false).rows.a.segs, [{ from: at(9), to: at(10), kind: "idle" }, { from: at(10), to: at(12), kind: "ran" }]);
});

test("dueList: occupied slots with a due date, soonest first, with days left", () => {
  const line = { slots: [
    { letter: "a", space: "s1", due: "2026-11-24" },
    { letter: "b", space: "s2", due: null },
    { letter: "c", space: "s3", due: "2026-11-20" },
    { letter: "d", space: null, due: "2026-11-21" },  // free: left out
    { letter: "e", space: "s5", due: "2026-11-18" },
  ] };
  const sp = [{ id: "s1", name: "atlas" }, { id: "s2", name: "io" }, { id: "s3", name: "moss" }, { id: "s5", name: "plans" }];
  assert.deepEqual(dueList(line, sp, NOW), [
    { letter: "e", name: "plans", due: "2026-11-18", days: -1, label: "Wed 18" },
    { letter: "c", name: "moss", due: "2026-11-20", days: 1, label: "Fri 20" },
    { letter: "a", name: "atlas", due: "2026-11-24", days: 5, label: "Tue 24" },
  ]);
  assert.deepEqual(dueList(null, sp, NOW), []);
  assert.equal(daysWords(0), "today");
  assert.equal(daysWords(3), "3");
  assert.equal(daysWords(-2), "2 late");
});

test("dueWords: the due date and days left as the map says them", () => {
  assert.equal(dueWords({ label: "Fri 27", days: 3 }), "due Fri 27 · 3 days");
  assert.equal(dueWords({ label: "Fri 20", days: 1 }), "due Fri 20 · 1 day");
  assert.equal(dueWords({ label: "Thu 19", days: 0 }), "due Thu 19 · today");
  assert.equal(dueWords({ label: "Mon 16", days: -2 }), "due Mon 16 · 2 late");
});

// ---- TODAY: waits, totals and the rolling window ----

const waitDay = () => [
  ...snapshot(world({ a: { space: "s1", name: "plans" }, b: { space: "s2", name: "io" } }, { t1: { c: "a1", s: "working" }, t2: { c: "b2", s: "idle" } }, "a1"), at(9)),
  { t: at(9, 10), e: "agent", a: "t1", c: "a1", s: "blocked" },
  { t: at(9, 13), e: "agent", a: "t1", c: "a1", s: "working" },   // a 3m wait
  { t: at(9, 20), e: "agent", a: "t2", c: "b2", s: "blocked" },
  { t: at(9, 41), e: "agent", a: "t2", c: "b2", s: null },        // a 21m wait, the agent went away
  { t: at(10), e: "agent", a: "t1", c: "a1", s: "blocked" },
  { t: at(10, 5), e: "close" },                                   // 5m, cut by the close
  ...snapshot(world({ a: { space: "s1", name: "plans" } }, { t1: { c: "a1", s: "blocked" } }, "a1"), at(15)),
];

test("waits: each blocked spell per agent, ended by a change, a gone agent or a close; the live one is open", () => {
  const w = waits(waitDay(), NOW);
  assert.deepEqual(w, [
    { a: "t1", c: "a1", from: at(9, 10), to: at(9, 13), open: false },
    { a: "t2", c: "b2", from: at(9, 20), to: at(9, 41), open: false },
    { a: "t1", c: "a1", from: at(10), to: at(10, 5), open: false },
    { a: "t1", c: "a1", from: at(15), to: NOW, open: true },
  ]);
  // not live: the last spell ends at the last event
  assert.equal(waits(waitDay(), NOW, false).at(-1).to, at(15));
  assert.deepEqual(waits([], NOW), []);
  // a reload (an open with no close before it) ends a spell at the new open, which restates it
  const reload = [
    ...snapshot(world({ a: { space: "s1", name: "p" } }, { t1: { c: "a1", s: "blocked" } }), at(9)),
    ...snapshot(world({ a: { space: "s1", name: "p" } }, { t1: { c: "a1", s: "blocked" } }), at(9, 30)),
    { t: at(9, 40), e: "agent", a: "t1", c: "a1", s: "working" },
  ];
  assert.deepEqual(waits(reload, NOW).map((w) => [w.from, w.to]), [[at(9), at(9, 30)], [at(9, 30), at(9, 40)]]);
});

test("short: compact durations for narrow columns", () => {
  assert.equal(short(0), "0m");
  assert.equal(short(30000), "<1m");
  assert.equal(short(14 * 60000), "14m");
  assert.equal(short(70 * 60000), "1h10");
  assert.equal(short(125 * 60000), "2h05");
});

test("responseWords: answered waits, the typical (median) one and the longest", () => {
  assert.equal(responseWords(waits(waitDay(), NOW)), "3 waits answered · typical 5m · longest 21m at b2");
  assert.equal(responseWords([{ c: "a1", from: 0, to: 4 * 60000, open: false }]), "1 wait answered · 4m at a1");
  assert.equal(responseWords([{ c: "a1", from: 0, to: 1, open: true }]), "No waits answered yet today.");
});

test("rowTotals: ran and waited time of a row", () => {
  const g = build(waitDay(), NOW);
  assert.deepEqual(rowTotals(g.rows.a), { ran: 57 * 60000, wait: 3 * 60000 + 5 * 60000 + (NOW - at(15)) });
  assert.deepEqual(rowTotals(undefined), { ran: 0, wait: 0 });
});

test("windowAxis: the last two hours of recorded time, ending now, across closed stretches", () => {
  const ses = [{ from: at(9), to: at(10, 5) }, { from: at(15), to: NOW }];
  const wax = windowAxis(ses, NOW);
  // 40m since 15:00, then all 65m of the morning session (less than the 80m left in two hours)
  assert.deepEqual(wax.pieces, [{ from: at(9), to: at(10, 5) }, { from: at(15), to: NOW }]);
  assert.equal(wax.total, 105 * 60000);
  // a reload or a quick restart (a gap under two minutes) is no break
  const reload = windowAxis([{ from: at(15), to: at(15, 20) }, { from: at(15, 20) + 30000, to: NOW }], NOW);
  assert.deepEqual(reload.pieces, [{ from: at(15), to: NOW }]);
  // a long day: only the last two hours
  const long = windowAxis([{ from: at(8), to: NOW }], NOW);
  assert.deepEqual(long.pieces, [{ from: at(13, 40), to: NOW }]);
  // early in the day: less than the minimum scale, drawn from the right with room at the left
  const early = windowAxis([{ from: at(0, 5), to: at(0, 15) }], at(0, 15));
  assert.deepEqual(early.pieces, [{ from: at(0, 5), to: at(0, 15) }]);
  assert.equal(early.total, 10 * 60000);
});

test("windowAxis with a chosen span: 6, 12 or 24 hours, reaching past midnight when allowed", () => {
  assert.deepEqual(SPANS.map((s) => s / 3600000), [2, 6, 12, 24]);
  const long = [{ from: at(8), to: NOW }];
  assert.deepEqual(windowAxis(long, NOW, SPANS[1]).pieces, [{ from: at(9, 40), to: NOW }]);
  // twelve hours from 15:40 would start at 3:40, but recording began at 8:00
  assert.deepEqual(windowAxis(long, NOW, SPANS[2]).pieces, [{ from: at(8), to: NOW }]);
  // yesterday's evening counts only when since allows it (yesterday's file was read)
  const late = [{ from: at(0) - 2 * 3600000, to: at(0) }, { from: at(0), to: at(1) }];
  assert.deepEqual(windowAxis(late, at(1), SPANS[3]).pieces, [{ from: at(0), to: at(1) }]);
  const back = windowAxis(late, at(1), SPANS[3], at(1) - SPANS[3]);
  assert.deepEqual(back.pieces, [{ from: at(0) - 2 * 3600000, to: at(1) }]);
});

test("xAt: px along the window; a break between pieces; clamps outside", () => {
  const wax = { pieces: [{ from: at(9), to: at(10) }, { from: at(15), to: at(16) }], total: 2 * 3600000 };
  // width 206 = 200 px of time + one 6 px break
  assert.equal(xAt(wax, 206, at(9)), 0);
  assert.equal(xAt(wax, 206, at(9, 30)), 50);
  assert.equal(xAt(wax, 206, at(10)), 100);
  assert.equal(xAt(wax, 206, at(12)), 106);   // in the closed stretch: the start of the next piece
  assert.equal(xAt(wax, 206, at(15, 30)), 156);
  assert.equal(xAt(wax, 206, at(17)), 206);
  assert.equal(xAt(wax, 206, at(8)), 0);
  // a break of another width, for a graph drawn in per-mille of its area
  assert.equal(xAt(wax, 1000, at(15), 20), 510);
  // under the minimum scale (30m), time sits at the right
  const small = { pieces: [{ from: at(9), to: at(9, 15) }], total: 15 * 60000 };
  assert.equal(xAt(small, 100, at(9)), 50);
  assert.equal(xAt(small, 100, at(9, 15)), 100);
});

test("windowTicks: whole hours inside the pieces, far enough apart for labels", () => {
  const wax = { pieces: [{ from: at(9), to: at(10, 30) }, { from: at(15), to: at(15, 30) }], total: 2 * 3600000 };
  assert.deepEqual(windowTicks(wax, 206).map((k) => k.label), ["09", "10", "15"]);
  assert.deepEqual(windowTicks(wax, 206, 120).map((k) => k.label), ["09", "15"]);
});

test("daysBefore: the earlier day files a window needs, oldest first", () => {
  assert.deepEqual(daysBefore(NOW, SPANS[0]), []);
  assert.deepEqual(daysBefore(at(1), SPANS[3]), [dayKey(at(0) - 1)]);
  assert.deepEqual(daysBefore(NOW, SPANS[3]), [dayKey(at(0) - 1)]);
});

test("waitCode: the stop of a wait box, the latest spell at that slot overlapping it", () => {
  const w = waits(waitDay(), NOW);
  assert.equal(waitCode(w, "a", at(9, 10), at(9, 13)), "a1");
  assert.equal(waitCode(w, "b", at(9, 20), at(9, 41)), "b2");
  assert.equal(waitCode(w, "b", at(11), at(12)), null);
});
