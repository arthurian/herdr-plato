import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot, changes } from "../day.js";
import {
  VERBS, POST_KINDS, openDay, stepDay, tabFacts, dayStats, doneCounts, doneShares, openTabs, quietSpaces,
  parsePost, layoutPosts, countCommits, badge, sourcesLine, resultRows, resultRowWords, reportFor, REPORT_NEAR_MS, spaceNames, groupRows, resultCopyText, commentCopyText, resultCountWords, rowsBelow, moreWords, ROW_PX, GROUP_PX, GAP_PX, openWords,
  REVIEW_WORDS, leadSentence, reviewKeys, commentsWords, hitKey, wantedDay, dayBounds, coversWords, commitsByTab, resultTabs, dayWentRows, quietWords,
  ageWords, byline, commentsHead, notOpen, bandLabel, bandMarks, switchBursts, hitIndexForCode, bandHit, nowWords, burstLabels, postNameOrder, postsShown, liveStop, hasTabLabels, openEmpty, dayBand, hitTimes, hitTimeWords, mergeTabs, sumTimes, latestReport,
} from "../reviewdata.js";

const at = (h, m = 0, s = 0, d = 19) => new Date(2026, 10, d, h, m, s).getTime(); // d Nov 2026, local time
const secs = (ms) => String(Math.floor(ms / 1000));
const label = (t, a, c, k, v) => ({ t, e: "label", a, c, k, v });
const agent = (t, a, c, s, st) => ({ t, e: "agent", a, c, s, ...(st ? { st } : {}) });
const focus = (t, c) => ({ t, e: "focus", c });
const open = (t) => ({ t, e: "open" });
const carry = (t) => ({ t, e: "open", carry: true });
const close = (t) => ({ t, e: "close" });

test("openDay: opens today at any hour, from midnight", () => {
  const days = ["2026-11-19", "2026-11-20", "2026-11-23"];
  assert.equal(openDay(days, new Date(2026, 10, 23, 0, 0, 1).getTime()), "2026-11-23");
  assert.equal(openDay(days, new Date(2026, 10, 23, 8).getTime()), "2026-11-23");
  assert.equal(openDay(days, new Date(2026, 10, 23, 23, 59).getTime()), "2026-11-23");
});

test("openDay: no record for today gives null", () => {
  assert.equal(openDay([], at(9)), null);
  assert.equal(openDay(["2026-11-19"], new Date(2026, 10, 23, 8).getTime()), null);
});

test("stepDay moves only to days with a record", () => {
  const keys = ["2026-11-16", "2026-11-19", "2026-11-23"];
  assert.equal(stepDay(keys, "2026-11-19", -1), "2026-11-16");
  assert.equal(stepDay(keys, "2026-11-19", 1), "2026-11-23");
  assert.equal(stepDay(keys, "2026-11-16", -1), null);
  assert.equal(stepDay(keys, "2026-11-23", 1), null);
  assert.equal(stepDay(keys, "2026-11-20", 1), "2026-11-23");
});

test("tabFacts: the same words twice with two done_at times count twice", () => {
  const ev = [
    open(at(9)),
    label(at(9), "t1", "f1", "plato.purpose", "Rate-limit the API"),
    label(at(10), "t1", "f1", "plato.done", "fixed tests"),
    label(at(10), "t1", "f1", "plato.done_at", secs(at(10))),
    label(at(11), "t1", "f1", "plato.done", "fixed tests"),
    label(at(11), "t1", "f1", "plato.done_at", secs(at(11))),
    // a restated snapshot of the same done_at counts once
    open(at(12)),
    label(at(12), "t1", "f1", "plato.done", "fixed tests"),
    label(at(12), "t1", "f1", "plato.done_at", secs(at(11))),
  ];
  const [tab] = tabFacts(ev, at(13), true);
  assert.deepEqual(tab.results.map((r) => r.v), ["fixed tests", "fixed tests"]);
  assert.equal(tab.letter, "f");
  assert.equal(tab.purpose, "Rate-limit the API");
});

test("tabFacts: a result from an earlier day (carried in) does not count", () => {
  const ev = [
    open(at(0)),
    label(at(0), "t1", "f1", "plato.done", "shipped x"),
    label(at(0), "t1", "f1", "plato.done_at", secs(at(15, 0, 0, 18))),
  ];
  assert.deepEqual(tabFacts(ev, at(13), true)[0].results, []);
});

test("tabFacts: a tab closed during the day keeps its code, purpose and folder", () => {
  const tab = { c: "f1", cwd: "/work/api", l: { "plato.purpose": "auto", "plato.purpose_yours": "mine", "plato.purpose_at": secs(at(9, 5)), "plato.session": "s-1", "plato.tasks": "3/5" } };
  const withTab = { slots: {}, agents: { t1: { c: "f1", s: "working" } }, focus: null, tabs: { t1: tab } };
  const without = { slots: {}, agents: {}, focus: null, tabs: {} };
  const ev = [...snapshot(withTab, at(9)), ...changes(withTab, without, at(10))];
  assert.ok(ev.some((e) => e.e === "label" && e.v === null), "the recorder writes null labels at close");
  const [tab1] = tabFacts(ev, at(13), true);
  assert.equal(tab1.code, "f1");
  assert.equal(tab1.purpose, "mine");
  assert.equal(tab1.purposeAt, at(9, 5));
  assert.equal(tab1.cwd, "/work/api");
  assert.equal(tab1.tasks, "3/5");
  assert.deepEqual(tab1.sessions, ["s-1"]);
  assert.equal(tab1.active, true);
});

test("tabFacts: purpose falls back to plato.purpose when yours goes away", () => {
  const ev = [
    open(at(9)),
    label(at(9), "t1", "f1", "plato.purpose", "auto"),
    label(at(9), "t1", "f1", "plato.purpose_yours", "mine"),
    label(at(10), "t1", "f1", "plato.purpose_yours", null),
  ];
  assert.equal(tabFacts(ev, at(13), true)[0].purpose, "auto");
});

test("tabFacts: an old file with no label events gives tabs with no results", () => {
  const ev = [open(at(9)), { t: at(9), e: "line", l: "f", n: "api" }, agent(at(9), "t1", "f1", "working"), focus(at(9, 1), "f1")];
  const tabs = tabFacts(ev, at(13), true);
  assert.equal(tabs.length, 1);
  assert.deepEqual(tabs[0].results, []);
  assert.equal(tabs[0].purpose, null);
  assert.equal(tabs[0].active, true);
});

test("tabFacts: a tab only focused or idle all day is active only when focused or worked", () => {
  const ev = [
    open(at(9)),
    agent(at(9), "t1", "f1", "idle"), agent(at(9), "t2", "g1", "idle"), agent(at(9), "t3", "h1", "idle"),
    focus(at(9, 1), "g1"),
  ];
  const tabs = tabFacts(ev, at(13), true);
  assert.deepEqual(tabs.map((t) => [t.code, t.active]), [["f1", false], ["g1", true], ["h1", false]]);
});

test("dayStats: switches per shown hour, split at noon", () => {
  const ev = [
    open(at(9)),
    focus(at(9), "a1"), // restated at open: not a switch
    focus(at(9, 10), "a2"), focus(at(9, 20), "a1"), focus(at(9, 30), "a2"),
    focus(at(10, 10), "a1"), focus(at(10, 20), "a2"), focus(at(10, 30), "a1"),
    close(at(11)),
  ];
  const s = dayStats(ev, at(15), true, new Set());
  assert.deepEqual(s.switches, { am: 3, pm: 0 });
});

test("dayStats: longest hold is the longest unbroken focus on one tab", () => {
  const ev = [open(at(9)), focus(at(9), "a1"), focus(at(9, 20), "a2"), focus(at(10), "a1"), focus(at(10, 5), null), close(at(11))];
  assert.deepEqual(dayStats(ev, at(15), true, new Set()).hold, { code: "a2", ms: 40 * 60000 });
  assert.equal(dayStats([open(at(9)), close(at(10))], at(15), true, new Set()).hold, null);
});

test("dayStats: waited time sums the blocked spells", () => {
  const ev = [open(at(9)), agent(at(9, 10), "t1", "a1", "blocked", "Edit"), agent(at(9, 20), "t1", "a1", "working"), close(at(10))];
  assert.equal(dayStats(ev, at(15), true, new Set()).waitedMs, 10 * 60000);
});

test("dayStats: a session seen before, or working over 2 hours, is long", () => {
  const ev = [
    open(at(8)),
    agent(at(8), "t1", "a1", "working"), label(at(8), "t1", "a1", "plato.session", "old"),
    agent(at(8), "t2", "b1", "working"), label(at(8), "t2", "b1", "plato.session", "marathon"),
    agent(at(8), "t3", "c1", "working"), label(at(8), "t3", "c1", "plato.session", "quick"),
    agent(at(8, 10), "t1", "a1", "idle"),
    agent(at(8, 10), "t3", "c1", "idle"),
    agent(at(10, 30), "t2", "b1", "idle"),
    close(at(11)),
  ];
  const s = dayStats(ev, at(15), true, new Set(["old"]));
  assert.deepEqual(s.sessions, { total: 3, long: 2, quick: 1 });
});

test("dayStats: clears count the sessions that began with /clear", () => {
  const ev = [
    open(at(8)),
    label(at(8), "t1", "a1", "plato.session", "s1"), label(at(8), "t1", "a1", "plato.session_how", "startup"),
    label(at(9), "t1", "a1", "plato.session", "s2"), label(at(9), "t1", "a1", "plato.session_how", "clear"),
    label(at(10), "t1", "a1", "plato.session", "s3"), // how stays clear: no new how event
    label(at(11), "t1", "a1", "plato.session", "s4"), label(at(11), "t1", "a1", "plato.session_how", "resume"),
    open(at(12)), label(at(12), "t1", "a1", "plato.session", "s4"), label(at(12), "t1", "a1", "plato.session_how", "resume"),
  ];
  assert.equal(dayStats(ev, at(15), true, new Set()).clears, 2);
});

test("dayStats: an idle terminal restated at a carry is no session and no /clear", () => {
  const night = [
    carry(at(0)),
    agent(at(0), "t1", "a1", "idle"), label(at(0), "t1", "a1", "plato.session", "s1"), label(at(0), "t1", "a1", "plato.session_how", "clear"),
    open(at(9)), agent(at(9), "t1", "a1", "idle"), label(at(9), "t1", "a1", "plato.session", "s1"), label(at(9), "t1", "a1", "plato.session_how", "clear"),
    close(at(10)),
  ];
  const idle = dayStats(night, at(15), true, new Set(["s1"]));
  assert.deepEqual(idle.sessions, { total: 0, long: 0, quick: 0 });
  assert.equal(idle.clears, 0);
  const worked = [...night.slice(0, -1), agent(at(9, 30), "t1", "a1", "working"), agent(at(9, 40), "t1", "a1", "idle"), close(at(10))];
  const s = dayStats(worked, at(15), true, new Set(["s1"]));
  assert.equal(s.sessions.total, 1);
  assert.equal(s.sessions.long, 1);
});

test("dayStats: a session label outside a snapshot counts, even with no work", () => {
  const ev = [open(at(9)), label(at(9, 5), "t1", "a1", "plato.session", "s9"), label(at(9, 5), "t1", "a1", "plato.session_how", "clear"), close(at(10))];
  const s = dayStats(ev, at(15), true, new Set());
  assert.deepEqual(s.sessions, { total: 1, long: 0, quick: 1 });
  assert.equal(s.clears, 1);
});

test("dayStats: a blocked state restated at a carry is not a new ask", () => {
  const ev = [carry(at(0)), agent(at(0), "t1", "a1", "blocked", "Edit"), agent(at(9), "t1", "a1", "working"), agent(at(9, 5), "t1", "a1", "blocked", "Edit"), close(at(10))];
  assert.deepEqual(dayStats(ev, at(15), true, new Set()).asks, { n: 1, top: { step: "Edit", n: 1 } });
});

test("dayStats: asks count each change into blocked and name the top cut step", () => {
  const ev = [
    open(at(9)),
    agent(at(9, 1), "t1", "a1", "blocked", "Bash: npm test"),
    agent(at(9, 2), "t1", "a1", "working"),
    agent(at(9, 3), "t1", "a1", "blocked", "Bash: npm test"),
    agent(at(9, 4), "t1", "a1", "blocked", "Bash: npm test"), // still blocked: same ask
    agent(at(9, 5), "t1", "a1", "idle"),
    agent(at(9, 6), "t2", "b1", "blocked", "Edit"),
    close(at(10)),
  ];
  const s = dayStats(ev, at(15), true, new Set());
  assert.deepEqual(s.asks, { n: 3, top: { step: "Bash: npm test", n: 2 } });
  assert.deepEqual(dayStats([open(at(9)), close(at(10))], at(15), true, new Set()).asks, { n: 0, top: null });
});

test("doneCounts: verbs in list order, unknown verbs as other", () => {
  const tab = (...vs) => ({ results: vs.map((v) => ({ v, at: 1 })) });
  assert.deepEqual(VERBS.join(", "), "researched, explored, explained, brainstormed, designed, planned, decided, built, fixed, refactored, configured, tested, diagnosed, reviewed, shipped, documented, drafted, dropped");
  assert.deepEqual(doneCounts([tab("dropped log cleanup", "fixed a", "Fixed b"), tab("wrangled x", "shipped y")]), [
    { verb: "fixed", n: 2 }, { verb: "shipped", n: 1 }, { verb: "dropped", n: 1 }, { verb: "other", n: 1 },
  ]);
});

test("openTabs: a result before the purpose was set does not count, also from an earlier day", () => {
  const now = at(12);
  const tabOf = (a, c, purpose, purposeAt, doneAt) => ({
    slots: {}, agents: { [a]: { c, s: "idle" } }, focus: null,
    tabs: { [a]: { c, cwd: null, l: { "plato.purpose": purpose, "plato.purpose_at": secs(purposeAt), ...(doneAt ? { "plato.done": "fixed x", "plato.done_at": secs(doneAt) } : {}) } } },
  });
  const worlds = [
    tabOf("t1", "a1", "new goal", at(9, 0, 0, 16), at(9, 0, 0, 14)), // result older than the purpose
    tabOf("t2", "b1", "older", at(9, 0, 0, 14), null),
    tabOf("t3", "c1", "done", at(9, 0, 0, 16), at(9, 0, 0, 17)),     // result from an earlier day than shown, after the purpose
  ];
  const ev = worlds.flatMap((w) => snapshot(w, at(0), true));
  const tabs = tabFacts(ev, now, true);
  assert.deepEqual(tabs.map((t) => t.results), [[], [], []]);
  assert.deepEqual(openTabs(tabs, now), [
    { code: "b1", purpose: "older", days: 5, commits: 0 },
    { code: "a1", purpose: "new goal", days: 3, commits: 0 },
  ]);
});

test("quietSpaces: letters of the day's slots with no active tab", () => {
  const ev = [open(at(9)), { t: at(9), e: "line", l: "a", n: "x" }, { t: at(9), e: "line", l: "b", n: "y" }, { t: at(10), e: "line", l: "c", n: "z" }, { t: at(11), e: "line", l: "c", n: null }];
  const tabs = [{ code: "a1", letter: "a", active: true }, { code: "b1", letter: "b", active: false }];
  assert.deepEqual(quietSpaces(ev, tabs), ["b", "c"]);
});

test("parsePost: header only from the first lines; body with \"---\", quotes and newlines stays text", () => {
  const body = 'He said "go"\n---\nkind: comment\n\nlast line';
  const text = `kind: report\nterminal: t7\ntime: 1700000000\n\n${body}\n`;
  assert.deepEqual(parsePost("1700000000-none-comment.md", text), { kind: "report", terminal: "t7", time: 1700000000000, text: body });
  assert.equal(parsePost("x.md", "kind: note\nterminal: none\ntime: 5\n\nhi").terminal, null);
});

test("parsePost: unknown kind or no time gives null", () => {
  assert.deepEqual(POST_KINDS, ["report", "comment", "note"]);
  assert.equal(parsePost("x.md", "kind: letter\nterminal: none\ntime: 5\n\nhi"), null);
  assert.equal(parsePost("x.md", "kind: memo\nterminal: none\ntime: 5\n\nhi"), null);
  assert.equal(parsePost("x.md", "kind: report\nterminal: none\n\ntime: 5\n"), null);
  assert.equal(parsePost("x.md", "kind: report\nterminal: none\ntime: soon\n\nhi"), null);
});

const post = (kind, terminal, time, text) => ({ kind, terminal, time, text });

test("layoutPosts: two posts in the same second both show; latest report per tab; every comment, newest first", () => {
  const posts = [
    post("report", "t1", 100, "old"), post("report", "t1", 200, "new"), post("report", "t2", 150, "other"),
    post("comment", null, 10, "l1"), post("comment", null, 20, "l2"), post("comment", null, 30, "l3"), post("comment", null, 40, "l4"), post("comment", "t1", 40, "l5"),
    post("note", null, 5, "e1"), post("note", null, 6, "e2"),
  ];
  const l = layoutPosts(posts, (t) => ({ t1: "a1", t2: "b1" })[t] ?? null);
  assert.equal(l.reports.get("a1").text, "new");
  assert.equal(l.reports.get("b1").text, "other");
  assert.deepEqual(l.comments.map((p) => p.text), ["l5", "l4", "l3", "l2", "l1"]);
  assert.equal(l.more, undefined);
  assert.equal(l.note.text, "e2");
});

test("layoutPosts: a post from a closed terminal shows the code from codeOf", () => {
  const l = layoutPosts([post("report", "t9", 1, "from a closed tab")], (t) => (t === "t9" ? "c1" : null));
  assert.equal(l.reports.get("c1").text, "from a closed tab");
  assert.equal(layoutPosts([post("report", "t8", 1, "x")], () => null).reports.size, 0);
  assert.deepEqual(layoutPosts([], () => null), { reports: new Map(), comments: [], note: null });
});

test("postNameOrder: by time, then by the collision number (none is 1)", () => {
  const names = ["100-t1-report-2.md", "100-t1-report.md", "99-none-comment.md", "100-t1-report-10.md", "100-t1-report-3.md"];
  assert.deepEqual([...names].sort(postNameOrder), ["99-none-comment.md", "100-t1-report.md", "100-t1-report-2.md", "100-t1-report-3.md", "100-t1-report-10.md"]);
});

test("postsShown: reports of shown results, every comment and the note", () => {
  const l = layoutPosts([
    post("report", "t1", 1, "r1"), post("report", "t2", 2, "r2"),
    post("comment", null, 3, "l1"), post("comment", null, 4, "l2"), post("comment", null, 5, "l3"), post("comment", null, 6, "l4"),
    post("note", null, 7, "e"),
  ], (t) => ({ t1: "a1", t2: "b1" })[t] ?? null);
  assert.equal(postsShown(l, 1), 1 + 4 + 1);
  assert.equal(postsShown(layoutPosts([], () => null), 0), 0);
});

test("liveStop: the live stop of a terminal, or null", () => {
  const list = [{ code: "a1", terminal: "t9" }, { code: "a2", terminal: "t1" }];
  assert.equal(liveStop(list, "t1").code, "a2");
  assert.equal(liveStop(list, "t5"), null);
  assert.equal(liveStop([{ code: "a3", terminal: null }], null), null);
});

test("countCommits counts non-empty lines", () => {
  assert.equal(countCommits("a1 x\nb2 y\n\n  \nc3 z\n"), 3);
  assert.equal(countCommits(""), 0);
});

test("badge and sourcesLine words", () => {
  const t = at(8, 10);
  assert.equal(badge({ posts: 0, countedAt: t, soFar: false, empty: null }), "FACTS ONLY · counted 08:10");
  assert.equal(badge({ posts: 9, countedAt: t, soFar: false, empty: null }), "FACTS + 9 POSTS · counted 08:10");
  assert.equal(badge({ posts: 1, countedAt: t, soFar: false, empty: null }), "FACTS + 1 POST · counted 08:10");
  assert.equal(badge({ posts: 9, countedAt: t, soFar: true, empty: null }), "FACTS + 9 POSTS · counted 08:10 · so far");
  assert.equal(badge({ posts: 0, countedAt: t, soFar: true, empty: "PLATO was not running" }), "NO RECORD · PLATO was not running");
  assert.equal(sourcesLine({ hasLabels: true, hasPosts: false, hasGit: true }), "day record · tab labels · git log · no posts yet");
  assert.equal(sourcesLine({ hasLabels: true, hasPosts: true, hasGit: true }), null, "every source is there and git is done");
  assert.equal(sourcesLine({ hasLabels: true, hasPosts: true, hasGit: true, counting: false }), null);
  assert.equal(sourcesLine({ hasLabels: false, hasPosts: false, hasGit: false }), "day record · no tab labels · no git log · no posts yet");
  assert.equal(sourcesLine({ hasLabels: true, hasPosts: true, hasGit: false, counting: true }), "day record · tab labels · posts · counting commits");
});

// ---- the page's own words ----

test("REVIEW_WORDS and reviewKeys: the fixed words, and each key line entry has keys and words", () => {
  assert.equal(REVIEW_WORDS.title, "THE PLATO REVIEW");
  assert.equal(REVIEW_WORDS.director, "DIRECTOR");
  assert.equal(REVIEW_WORDS.note, "DIRECTOR'S NOTE");
  assert.equal(REVIEW_WORDS.copied, "copied");
  assert.equal(REVIEW_WORDS.noCopy, "nothing to copy");
  assert.equal(REVIEW_WORDS.noteNoTab, "the note has no tab");
  assert.equal(REVIEW_WORDS.more, "tab reads more");
  assert.equal(REVIEW_WORDS.noNoteLine, "no note today");
  assert.equal(REVIEW_WORDS.results, "RESULTS");
  assert.equal(REVIEW_WORDS.done, "DONE");
  assert.equal(REVIEW_WORDS.open, "OPEN");
  assert.equal(REVIEW_WORDS.went, "HOW IT WENT");
  assert.equal(REVIEW_WORDS.comments, "COMMENTS");
  assert.equal(REVIEW_WORDS.timeline, "TIMELINE");
  assert.equal(REVIEW_WORDS.day, "DAY");
  assert.equal(REVIEW_WORDS.noComments, "none yet");
  assert.equal(REVIEW_WORDS.report, "report");
  assert.equal(REVIEW_WORDS.noNoteToday, "no note today · see REVIEW in the README");
  for (const page of ["day", "comments"]) for (const k of reviewKeys(page)) assert.ok(k.keys.length && k.words, k.id);
});

test("wantedDay: today at any hour", () => {
  assert.equal(wantedDay(new Date(2026, 10, 23, 0, 0, 1).getTime()), "2026-11-23");
  assert.equal(wantedDay(new Date(2026, 10, 23, 12).getTime()), "2026-11-23");
  assert.equal(wantedDay(new Date(2026, 11, 1, 9).getTime()), "2026-12-01");
});

test("dayBounds: local midnight to the next, in seconds", () => {
  const { from, to } = dayBounds("2026-11-23");
  assert.equal(from, new Date(2026, 10, 23).getTime() / 1000);
  assert.equal(to, new Date(2026, 10, 24).getTime() / 1000);
});

test("coversWords names the weekday and date", () => {
  assert.equal(coversWords("2026-11-23"), "covers Mon 23 Nov");
});

test("commitsByTab: each repo counts once, for the first tab that works in it", () => {
  const tabs = [{ code: "f1", cwd: "/w/api/src" }, { code: "f2", cwd: "/w/api" }, { code: "c2", cwd: "/w/notes" }, { code: "e3", cwd: null }].map((t) => ({ ...t, worked: true, results: [] }));
  const repoOf = new Map([["/w/api/src", "/w/api"], ["/w/api", "/w/api"], ["/w/notes", "/w/notes"]]);
  const counts = new Map([["/w/api", 3], ["/w/notes", 0]]);
  assert.deepEqual([...commitsByTab(tabs, repoOf, counts)], [["f1", 3]]);
});

test("resultTabs: active tabs with a result only, newest result first", () => {
  const t = (code, last, active = true) => ({ code, letter: code[0], active, worked: true, results: last ? [{ v: "fixed x", at: 1 }, { v: "built y", at: last }] : [] });
  const tabs = [t("a1", 5), t("f1", 9), t("a2", 20, false), t("f2", 0), t("c2", 7)];
  assert.deepEqual(resultTabs(tabs).map((h) => h.code), ["f1", "c2", "a1"]);
  assert.deepEqual(resultTabs([{ code: null, letter: null, active: true, results: [{ v: "fixed x", at: 1 }] }]), []);
});

const nt = (o) => ({ a: "t1", code: "c1", letter: "c", purpose: null, purposeAt: null, doneAt: null, tasks: null, results: [], active: true, worked: false, ...o });

test("openTabs: a result in the same second as the purpose counts", () => {
  const t = nt({ purpose: "p", purposeAt: 1000e3, doneAt: 1000e3, results: [{ v: "built x", at: 1000e3 }] });
  assert.deepEqual(openTabs([t], 2000e3), []);
});

test("openTabs: an active tab with news but no purpose and no result is listed", () => {
  const t = nt({ code: "f2", letter: "f" });
  assert.deepEqual(openTabs([t], 0, new Map([["f2", 1]])), [{ code: "f2", purpose: null, days: null, commits: 1 }]);
  assert.deepEqual(openTabs([nt({ code: "f3", worked: true })], 0), [], "agent work alone is not listed: a day without labels would list every tab");
  assert.deepEqual(openTabs([t], 0), [], "a shell you only looked at, with no commits, is not news");
  assert.deepEqual(openTabs([nt({ code: "f4", worked: true, active: false })], 0), [], "not active today");
});

test("openWords: no purpose, then commits or the age", () => {
  assert.deepEqual(openWords({ code: "f2", purpose: null, days: null, commits: 1 }), { purpose: "(no purpose)", meta: "1 commit" });
  assert.deepEqual(openWords({ code: "f3", purpose: null, days: null, commits: 0 }), { purpose: "(no purpose)", meta: "" });
  assert.deepEqual(openWords({ code: "d1", purpose: "Deploy", days: 1, commits: 0 }), { purpose: "Deploy", meta: ageWords(1) });
});

test("dayWentRows: sessions, switches, hold, waits, questions and /clear restarts", () => {
  const stats = {
    switches: { am: 3, pm: 11 }, hold: { code: "f1", ms: 70 * 60000 }, waitedMs: 52 * 60000,
    asks: { n: 9, top: { step: "Bash: npm test", n: 6 } }, sessions: { total: 14, long: 2, quick: 12 }, clears: 2,
  };
  assert.deepEqual(dayWentRows(stats), [
    ["sessions", "14 · 2 long · 12 quick"],
    ["switches per hour", "am 3 · pm 11"],
    ["longest hold", "f1 · 1h10"],
    ["agents waited on you", "52m"],
    ["agent questions", "9 · Bash: npm test 6×"],
    ["restarts with /clear", "2"],
  ]);
  const quiet = dayWentRows({ ...stats, hold: null, waitedMs: 0, asks: { n: 0, top: null } });
  assert.deepEqual(quiet.slice(2, 5).map((r) => r[1]), ["none", "0m", "0"]);
});

test("quietWords, ageWords, byline, commentsHead and notOpen", () => {
  assert.equal(quietWords(["b", "g"]), "b, g quiet");
  assert.equal(quietWords([]), null);
  assert.deepEqual([0, 1, 6].map(ageWords), ["today", "1 day", "6 days"]);
  assert.equal(byline({ time: at(15, 12) }, "f2"), "f2 · 15:12");
  assert.equal(byline({ time: at(6, 40) }, null), "no tab · 06:40");
  assert.equal(commentsHead(0, true), "none yet");
  assert.equal(commentsHead(7, true), "7 today · newest first");
  assert.equal(commentsHead(7, false), "7 comments · newest first");
  assert.equal(notOpen("f1"), "f1 is not open now");
  assert.equal(REVIEW_WORDS.noTab, "this comment has no tab");
  assert.equal(REVIEW_WORDS.nothingPicked, "nothing to pick");
});

test("hasTabLabels: folder events alone are not tab labels", () => {
  assert.equal(hasTabLabels([{ t: 1, e: "open" }, { t: 1, e: "label", a: "t1", c: "a1", k: "cwd", v: "/x" }]), false);
  assert.equal(hasTabLabels([{ t: 1, e: "label", a: "t1", c: "a1", k: "cwd", v: "/x" }, { t: 1, e: "label", a: "t1", c: "a1", k: "plato.purpose", v: "Fix it" }]), true);
  assert.equal(hasTabLabels([]), false);
});

test("openEmpty: says no purpose when no tab has one", () => {
  assert.equal(openEmpty([{ purpose: null }, { purpose: null }]), REVIEW_WORDS.noPurpose);
  assert.equal(openEmpty([]), REVIEW_WORDS.noPurpose);
  assert.equal(openEmpty([{ purpose: null }, { purpose: "Fix it", purposeAt: at(9) }]), REVIEW_WORDS.allDone);
  assert.equal(REVIEW_WORDS.noPurpose, "no tab has a purpose");
});

// A two-session day: a (atlas) and b (beta); PLATO off from 10:30 to 11:00.
const bandDay = () => [
  { t: at(9), e: "open" }, { t: at(9), e: "line", l: "a", n: "atlas" }, { t: at(9), e: "line", l: "b", n: "beta" },
  { t: at(9), e: "agent", a: "t1", c: "a1", s: "working" },
  { t: at(9), e: "label", a: "t1", c: "a1", k: "plato.session", v: "s1" },
  { t: at(9), e: "label", a: "t1", c: "a1", k: "plato.session_how", v: "startup" },
  { t: at(9), e: "focus", c: "a1" },
  { t: at(9, 30), e: "focus", c: "b1" },
  { t: at(9, 40), e: "agent", a: "t2", c: "b1", s: "blocked", st: "Bash: npm test" },
  { t: at(9, 50), e: "agent", a: "t2", c: "b1", s: "working" },
  { t: at(10), e: "label", a: "t2", c: "b1", k: "plato.done", v: "dropped the cache" },
  { t: at(10), e: "label", a: "t2", c: "b1", k: "plato.done_at", v: secs(at(10)) },
  { t: at(10), e: "agent", a: "t1", c: "a1", s: "idle" },
  { t: at(10, 5), e: "label", a: "t1", c: "a1", k: "plato.session", v: "s2" },
  { t: at(10, 5), e: "label", a: "t1", c: "a1", k: "plato.session_how", v: "clear" },
  { t: at(10, 6), e: "agent", a: "t1", c: "a1", s: "working" },
  { t: at(10, 30), e: "close" },
  { t: at(11), e: "open" }, { t: at(11), e: "line", l: "a", n: "atlas" }, { t: at(11), e: "line", l: "b", n: "beta" },
  { t: at(11), e: "focus", c: "a1" },
  { t: at(11, 30), e: "close" },
];

test("dayBand: rows per space with focus, work, waits, results and the off stretch", () => {
  const b = dayBand(bandDay(), at(18), false);
  assert.equal(b.from, at(9));
  assert.equal(b.to, at(11, 30));
  assert.deepEqual(b.offs, [{ from: at(10, 30), to: at(11) }]);
  assert.deepEqual(b.ticks, [at(10), at(11)]);
  assert.deepEqual(b.rows.map((r) => [r.letter, r.name]), [["a", "atlas"], ["b", "beta"]]);
  const [a, bb] = b.rows;
  assert.deepEqual(a.here, [{ code: "a1", a: "t1", from: at(9), to: at(9, 30) }, { code: "a1", a: "t1", from: at(11), to: at(11, 30) }]);
  assert.deepEqual(a.work, [{ code: "a1", a: "t1", from: at(9), to: at(10) }, { code: "a1", a: "t1", from: at(10, 6), to: at(10, 30) }]);
  assert.deepEqual(a.waits, []);
  assert.deepEqual(bb.here, [{ code: "b1", a: null, from: at(9, 30), to: at(10, 30) }], "focus came before t2 showed under b1: no terminal, so bandHit goes by code");
  assert.deepEqual(bb.work, [{ code: "b1", a: "t2", from: at(9, 50), to: at(10, 30) }]);
  assert.deepEqual(bb.waits, [{ code: "b1", a: "t2", from: at(9, 40), to: at(9, 50) }]);
  assert.deepEqual(bb.results, [{ code: "b1", a: "t2", at: at(10), ok: false }]);
});

test("nowWords: now and the time as HH:MM", () => {
  assert.equal(nowWords(new Date(2026, 10, 24, 18, 20).getTime()), "now 18:20");
  assert.equal(nowWords(new Date(2026, 10, 24, 9, 5).getTime()), "now 09:05");
});

test("bandLabel: the tab number without the letter", () => {
  assert.equal(bandLabel("c2"), "2");
  assert.equal(bandLabel("c3.2"), "3.2");
});

test("bandMarks: results closer than 1.5% of the span join, and one ✕ makes the mark ✕", () => {
  const m = bandMarks([{ at: 100, ok: true, code: "c1", a: "t1" }, { at: 110, ok: true, code: "c1", a: "t1" }, { at: 500, ok: false, code: "d2", a: "t4" }], 1000);
  assert.deepEqual(m, [{ at: 100, n: 2, ok: true, items: [{ code: "c1", a: "t1" }] }, { at: 500, n: 1, ok: false, items: [{ code: "d2", a: "t4" }] }]);
  assert.deepEqual(bandMarks([{ at: 0, ok: true, code: "a1", a: "t1" }, { at: 14, ok: false, code: "b1", a: "t2" }], 1000),
    [{ at: 0, n: 2, ok: false, items: [{ code: "a1", a: "t1" }, { code: "b1", a: "t2" }] }]);
  assert.deepEqual(bandMarks([], 1000), []);
});

test("switchBursts: five stays of 2 min or less within 15 min become one burst", () => {
  const MIN = 60000;
  const here = [0, 3, 6, 9, 12].map((m) => ({ code: "c1", from: m * MIN, to: m * MIN + MIN }));
  const long = { code: "c1", from: 30 * MIN, to: 60 * MIN };
  const out = switchBursts([{ letter: "c", here: [...here, long], work: [], waits: [], results: [] }]);
  assert.deepEqual(out, [{ from: 0, to: 13 * MIN, n: 5 }]);
});

test("switchBursts: short stays across rows count together", () => {
  const MIN = 60000;
  const stay = (m) => ({ code: "x1", from: m * MIN, to: m * MIN + MIN });
  const rows = [{ letter: "a", here: [stay(0), stay(4), stay(8)], work: [], waits: [], results: [] }, { letter: "b", here: [stay(2), stay(6)], work: [], waits: [], results: [] }];
  assert.deepEqual(switchBursts(rows), [{ from: 0, to: 9 * MIN, n: 5 }]);
});

test("switchBursts: four short stays stay as they are", () => {
  const MIN = 60000;
  const here = [0, 3, 6, 9].map((m) => ({ code: "c1", from: m * MIN, to: m * MIN + MIN }));
  assert.deepEqual(switchBursts([{ letter: "c", here, work: [], waits: [], results: [] }]), []);
});

test("switchBursts: bursts less than 15 min apart join in one", () => {
  const MIN = 60000;
  const stay = (m) => ({ code: "c1", from: m * MIN, to: m * MIN + MIN });
  const here = [0, 2, 4, 6, 8, 20, 22, 24, 26, 28, 60, 62, 64, 66, 68].map(stay);
  assert.deepEqual(switchBursts([{ letter: "c", here, work: [], waits: [], results: [] }]),
    [{ from: 0, to: 29 * MIN, n: 10 }, { from: 60 * MIN, to: 69 * MIN, n: 5 }]);
});

test("burstLabels: a label only where it does not touch the one before (4% of the span)", () => {
  const bursts = [{ from: 0, to: 10, n: 16 }, { from: 20, to: 30, n: 5 }, { from: 100, to: 110, n: 11 }];
  assert.deepEqual(burstLabels(bursts, 1000), [{ at: 0, text: "×16" }, { at: 100, text: "×11" }]);
  assert.deepEqual(burstLabels([], 1000), []);
});

test("bandHit: a bar belongs to the result whose terminals hold it, by code only with no terminal", () => {
  // t3 was c3 in the morning and is c2 now; the closed tab t9 held c2 before it.
  const hits = [{ code: "c2", as: ["t3"] }, { code: "d2", as: ["t4", "t5"] }];
  assert.equal(bandHit(hits, { code: "c3", a: "t3" }), 0, "the morning bar under the old code");
  assert.equal(bandHit(hits, { code: "c2", a: "t9" }), -1, "another terminal under the same code");
  assert.equal(bandHit(hits, { code: "d2", a: "t5" }), 1);
  assert.equal(bandHit(hits, { code: "d2", a: null }), 1, "no terminal: by code");
  assert.equal(bandHit([], { code: "c2", a: "t3" }), -1, "a day with no results");
});

test("hitIndexForCode: the first result with the code, -1 for none", () => {
  const hits = [{ code: "c1" }, { code: "d2" }, { code: "c1" }];
  assert.equal(hitIndexForCode(hits, "c1"), 0);
  assert.equal(hitIndexForCode(hits, "e1"), -1);
  assert.equal(hitIndexForCode([], "c1"), -1);
});

test("dayBand: a live day runs to now; no events give null", () => {
  const ev = bandDay().slice(0, -1);
  assert.equal(dayBand(ev, at(12), true).to, at(12));
  assert.equal(dayBand([], at(12), true), null);
});

test("hitTimes: time here, waited, asks and /clear restarts by terminal", () => {
  const ev = bandDay();
  const t = hitTimes(ev, at(18), false, tabFacts(ev, at(18), false));
  assert.deepEqual(t.get("t1"), { here: 60 * 60000, waited: 0, asks: 0, clears: 1 });
  assert.deepEqual(t.get("t2"), { here: 60 * 60000, waited: 10 * 60000, asks: 1, clears: 0 });
});

// The results' parts add up to HOW IT WENT.
const sumsMatch = (ev, now) => {
  const all = [...hitTimes(ev, now, false, tabFacts(ev, now, false)).values()];
  const s = dayStats(ev, now, false);
  const sum = (k) => all.reduce((n, x) => n + x[k], 0);
  assert.equal(sum("waited"), s.waitedMs);
  assert.equal(sum("asks"), s.asks.n);
  assert.equal(sum("clears"), s.clears);
};

test("hitTimes: the parts add up to the day's totals", () => sumsMatch(bandDay(), at(18)));

test("hitTimes: a tab whose code shifts keeps its own time (keyed by terminal)", () => {
  const ev = [
    { t: at(9), e: "open" }, { t: at(9), e: "line", l: "b", n: "beta" },
    { t: at(9), e: "agent", a: "t1", c: "b1", s: "working" },
    { t: at(9), e: "agent", a: "t2", c: "b2", s: "working" },
    { t: at(9), e: "focus", c: "b2" },
    { t: at(9, 10), e: "agent", a: "t2", c: "b2", s: "blocked", st: "Bash: npm test" },
    { t: at(9, 30), e: "agent", a: "t2", c: "b2", s: "working" },
    { t: at(10), e: "agent", a: "t1", c: "b1", s: null },
    { t: at(10), e: "agent", a: "t2", c: "b1", s: "working" },
    { t: at(10), e: "focus", c: "b1" },
    { t: at(10, 20), e: "agent", a: "t2", c: "b1", s: "blocked", st: "Bash: npm test" },
    { t: at(10, 30), e: "agent", a: "t2", c: "b1", s: "working" },
    { t: at(11), e: "close" },
  ];
  const t = hitTimes(ev, at(18), false, tabFacts(ev, at(18), false));
  assert.deepEqual(t.get("t2"), { here: 120 * 60000, waited: 30 * 60000, asks: 2, clears: 0 });
  assert.deepEqual(t.get("t1"), { here: 0, waited: 0, asks: 0, clears: 0 });
  sumsMatch(ev, at(18));
});

test("hitTimes: a blocked state restated at an open is no new ask", () => {
  const ev = [
    { t: at(9), e: "open" }, { t: at(9), e: "agent", a: "t1", c: "a1", s: "blocked", st: "Bash: ls" },
    { t: at(9, 5), e: "close" },
    { t: at(9, 10), e: "open" }, { t: at(9, 10), e: "agent", a: "t1", c: "a1", s: "blocked", st: "Bash: ls" },
    { t: at(9, 20), e: "close" },
  ];
  assert.equal(hitTimes(ev, at(18), false, tabFacts(ev, at(18), false)).get("t1").asks, 0);
  sumsMatch(ev, at(18));
});

test("dayBand: a reload with no close and an agent that goes away end work spells", () => {
  const ev = [
    { t: at(9), e: "open" }, { t: at(9), e: "line", l: "a", n: "atlas" },
    { t: at(9), e: "agent", a: "t1", c: "a1", s: "working" },
    { t: at(9, 30), e: "open" }, { t: at(9, 30), e: "line", l: "a", n: "atlas" },
    { t: at(9, 30), e: "agent", a: "t1", c: "a1", s: "working" },
    { t: at(9, 45), e: "agent", a: "t1", c: "a1", s: null },
    { t: at(10), e: "close" },
  ];
  assert.deepEqual(dayBand(ev, at(18), false).rows[0].work, [{ code: "a1", a: "t1", from: at(9), to: at(9, 30) }, { code: "a1", a: "t1", from: at(9, 30), to: at(9, 45) }]);
});

test("dayBand: a session with no length is no band; results outside the band are left out", () => {
  assert.equal(dayBand([{ t: at(9), e: "open" }, { t: at(9), e: "line", l: "a", n: "atlas" }], at(18), false), null);
  const ev = [
    { t: at(9), e: "open" }, { t: at(9), e: "line", l: "a", n: "atlas" },
    { t: at(9), e: "label", a: "t1", c: "a1", k: "plato.done", v: "fixed it" },
    { t: at(9), e: "label", a: "t1", c: "a1", k: "plato.done_at", v: secs(at(8, 50)) },
    { t: at(9, 30), e: "label", a: "t1", c: "a1", k: "plato.done", v: " dropped it" },
    { t: at(9, 30), e: "label", a: "t1", c: "a1", k: "plato.done_at", v: secs(at(9, 30)) },
    { t: at(10), e: "close" },
  ];
  assert.deepEqual(dayBand(ev, at(18), false).rows[0].results, [{ code: "a1", a: "t1", at: at(9, 30), ok: false }]);
});

test("openEmpty: a purpose with no time counts as no purpose for the list", () => {
  assert.equal(openEmpty([{ purpose: "Fix it", purposeAt: null }]), REVIEW_WORDS.noPurpose);
});

test("hitTimeWords: zero parts left out, singular and plural", () => {
  assert.equal(hitTimeWords({ here: 157 * 60000, waited: 12 * 60000, asks: 1, clears: 1 }), "here 2h37 · waited 12m · 1 ask · 1 /clear");
  assert.equal(hitTimeWords({ here: 14 * 60000, waited: 0, asks: 3, clears: 2 }), "here 14m · 3 asks · 2 /clear");
  assert.equal(hitTimeWords({ here: 0, waited: 0, asks: 0, clears: 0 }), null);
  assert.equal(hitTimeWords(undefined), null);
});

test("hitTimes: a closed tab's null labels do not take its old code back", () => {
  const ev = [
    { t: at(9), e: "open" }, { t: at(9), e: "line", l: "a", n: "atlas" }, { t: at(9), e: "line", l: "b", n: "beta" },
    { t: at(9), e: "agent", a: "t2", c: "b2", s: "working" },
    { t: at(9), e: "label", a: "t1", c: "b1", k: "cwd", v: "/x" },
    { t: at(9), e: "label", a: "t2", c: "b2", k: "cwd", v: "/y" },
    { t: at(9), e: "label", a: "t3", c: "a1", k: "cwd", v: "/z" },
    { t: at(9), e: "focus", c: "a1" },
    { t: at(10), e: "agent", a: "t2", c: "b1", s: "working" },
    { t: at(10), e: "label", a: "t1", c: "b1", k: "cwd", v: null },
    { t: at(10, 40), e: "focus", c: "b1" },
    { t: at(11), e: "close" },
  ];
  const t = hitTimes(ev, at(18), false, tabFacts(ev, at(18), false));
  assert.equal(t.get("t2").here, 20 * 60000);
  assert.equal(t.get("t1").here, 0);
});

// A tab as tabFacts gives it, for mergeTabs.
const ft = (a, code, purpose, extra = {}) => ({ a, code, letter: code?.[0] ?? null, purpose, purposeAt: null, doneAt: null, tasks: null, results: [], sessions: [], cwd: null, active: true, ...extra });

test("mergeTabs: terminals with the same code and purpose (or none) are one tab", () => {
  const m = mergeTabs([
    ft("t1", "f1", null, { results: [{ v: "fixed a", at: 2 }], sessions: ["s1"], cwd: "/x" }),
    ft("t2", "f2", null),
    ft("t3", "f1", null, { results: [{ v: "built b", at: 1 }], sessions: ["s1", "s3"], active: false, tasks: "2/3" }),
    ft("t4", "f1", "Rate-limit the API", { purposeAt: 5 }),
  ]);
  assert.deepEqual(m.map((t) => [t.code, t.purpose, t.as]), [["f1", null, ["t1", "t3"]], ["f2", null, ["t2"]], ["f1", "Rate-limit the API", ["t4"]]]);
  const [f1] = m;
  assert.equal(f1.a, "t3", "the newest terminal, for Enter and LOOK");
  assert.deepEqual(f1.results, [{ v: "built b", at: 1 }, { v: "fixed a", at: 2 }]);
  assert.deepEqual(f1.sessions, ["s1", "s3"]);
  assert.equal(f1.active, true);
  assert.equal(f1.tasks, "2/3");
  assert.equal(f1.cwd, "/x");
  assert.notEqual(m[0].key, m[2].key, "the same code with two purposes keeps two keys");
});

test("mergeTabs: the oldest purpose time and the newest result time; a tab with no code stays alone", () => {
  const m = mergeTabs([ft("t1", "a1", "P", { purposeAt: 10, doneAt: 30 }), ft("t2", "a1", "P", { purposeAt: 20, doneAt: null }), ft("t3", null, null), ft("t4", null, null)]);
  assert.equal(m.length, 3);
  assert.equal(m[0].purposeAt, 10);
  assert.equal(m[0].doneAt, 30);
});

test("commitsByTab and resultTabs key merged tabs apart, by code and purpose", () => {
  const m = mergeTabs([ft("t1", "f1", "A", { cwd: "/r" }), ft("t2", "f1", "B", { cwd: "/r2" })]);
  const c = commitsByTab(m, new Map([["/r", "R"], ["/r2", "R2"]]), new Map([["R", 3], ["R2", 1]]));
  assert.equal(c.get(m[0].key), 3);
  assert.equal(c.get(m[1].key), 1);
  assert.equal(resultTabs(mergeTabs([ft("t1", "f1", "A", { results: [{ v: "fixed a", at: 1 }] }), ft("t2", "f1", "B", { results: [{ v: "fixed b", at: 2 }] })])).length, 2);
});

test("sumTimes and latestReport: a merged tab adds its terminals' times and shows their newest report", () => {
  const times = new Map([["t1", { here: 1, waited: 2, asks: 1, clears: 0 }], ["t2", { here: 10, waited: 0, asks: 2, clears: 1 }]]);
  assert.deepEqual(sumTimes(times, ["t1", "t2", "t9"]), { here: 11, waited: 2, asks: 3, clears: 1 });
  const posts = [post("report", "t1", 5, "old"), post("report", "t2", 7, "new"), post("report", "t3", 9, "other"), post("comment", "t1", 10, "l")];
  assert.equal(latestReport(posts, ["t1", "t2"]).text, "new");
  assert.equal(latestReport(posts, ["t8"]), null);
});

test("doneCounts: more than five lines keep the four most used verbs and fold the rest into other", () => {
  const tab = (...vs) => ({ results: vs.map((v) => ({ v, at: 1 })) });
  const five = [tab("fixed a", "fixed b", "built c", "tested d", "shipped e", "wrangled f")];
  assert.equal(doneCounts(five).length, 5, "five lines stay as they are");
  const day = [tab("researched a", "fixed b", "fixed c", "fixed d", "built e", "built f", "tested g", "tested h", "shipped i", "drafted j", "wrangled k")];
  assert.deepEqual(doneCounts(day), [
    { verb: "researched", n: 1 }, { verb: "built", n: 2 }, { verb: "fixed", n: 3 }, { verb: "tested", n: 2 }, { verb: "other", n: 3 },
  ], "top four by count (ties by list order), shown in list order; shipped, drafted and wrangled are other");
});

test("resultTabs: an agent, a purpose or commits without a result are not a result", () => {
  const shell = { code: "f2", letter: "f", active: true, worked: false, purpose: null, results: [] };
  const agent = { ...shell, code: "f3", worked: true };
  const aim = { ...shell, code: "f4", purpose: "Tail the deploy log" };
  const done = { ...shell, code: "f5", results: [{ v: "fixed x", at: 1 }] };
  assert.deepEqual(resultTabs([shell, agent, aim, done]).map((h) => h.code), ["f5"]);
});

test("tabFacts and mergeTabs carry worked: an agent ran in the tab", () => {
  const ev = [
    { t: 1, e: "label", a: "t1", c: "f1", k: "cwd", v: "/x" },
    { t: 2, e: "agent", a: "t1", c: "f1", s: "working" },
    { t: 3, e: "label", a: "t2", c: "f2", k: "cwd", v: "/x" },
    { t: 4, e: "focus", c: "f2" },
  ];
  const tabs = tabFacts(ev, 10);
  assert.deepEqual(tabs.map((t) => [t.code, t.active, t.worked]), [["f1", true, true], ["f2", true, false]]);
  assert.deepEqual(mergeTabs(tabs).map((t) => t.worked), [true, false]);
});

test("commitsByTab: a tab with news takes the repo before a shell you only looked at", () => {
  const shell = { a: "t1", code: "f1", active: true, worked: false, purpose: null, results: [], cwd: "/r" };
  const agent = { a: "t2", code: "f2", active: true, worked: true, purpose: "Fix it", results: [], cwd: "/r" };
  const c = commitsByTab([shell, agent], new Map([["/r", "R"]]), new Map([["R", 3]]));
  assert.deepEqual([...c], [["f2", 3]]);
  // With no tab that has news, a shell with commits still gets them, and is a result.
  const c2 = commitsByTab([shell], new Map([["/r", "R"]]), new Map([["R", 3]]));
  assert.deepEqual([...c2], [["f1", 3]]);
});

test("mergeTabs: cwds holds every folder, and commitsByTab adds up their repos", () => {
  const t = (a, cwd, worked) => ({ a, code: "f1", letter: "f", purpose: "P", active: true, worked, results: [], sessions: [], cwd });
  const m = mergeTabs([t("t1", "/r", true), t("t2", "/r2", false)]);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].cwds, ["/r", "/r2"]);
  const c = commitsByTab(m, new Map([["/r", "R"], ["/r2", "R2"]]), new Map([["R", 3], ["R2", 1]]));
  assert.deepEqual([...c], [[hitKey(m[0]), 4]]);
});

test("mergeTabs: Enter and LOOK go to the last terminal an agent worked in, else the newest", () => {
  const t = (a, worked) => ({ a, code: "f1", letter: "f", purpose: null, active: true, worked, results: [], sessions: [], cwd: null });
  assert.equal(mergeTabs([t("t1", true), t("t2", false)])[0].a, "t1");
  assert.equal(mergeTabs([t("t1", true), t("t2", true), t("t3", false)])[0].a, "t2");
  assert.equal(mergeTabs([t("t1", false), t("t2", false)])[0].a, "t2");
});

test("REVIEW_WORDS.noResults matches the result rule", () => {
  assert.equal(REVIEW_WORDS.noResults, "no tab has anything to report");
});

test("commentsWords: COMMENTS with the day's comment count", () => {
  assert.equal(commentsWords(4), "COMMENTS 4");
  assert.equal(commentsWords(0), "COMMENTS");
});

test("reviewKeys: Tab first, then the keys of the page", () => {
  assert.deepEqual(reviewKeys("day").map((k) => k.id), ["page", "pick", "look", "go", "copy", "day", "band"]);
  assert.deepEqual(reviewKeys("comments").map((k) => k.id), ["page", "pick", "look", "go", "copy", "day"]);
  assert.deepEqual(reviewKeys("day")[0].keys, ["tab"]);
  assert.equal(reviewKeys("day")[0].words, "COMMENTS");
  assert.equal(reviewKeys("comments")[0].words, "DAY");
  assert.equal(reviewKeys("day")[1].words, "pick a result");
  assert.equal(reviewKeys("day").find((k) => k.id === "copy").words, "copy the pick");
  assert.equal(reviewKeys("comments").find((k) => k.id === "copy").words, "copy the pick");
  assert.equal(reviewKeys("comments")[1].words, "pick a comment");
});

test("doneShares: each count against the largest, so the largest bar is full", () => {
  assert.deepEqual(doneShares([{ verb: "fixed", n: 4 }, { verb: "shipped", n: 2 }, { verb: "other", n: 1 }]).map((d) => d.share), [1, 0.5, 0.25]);
  assert.deepEqual(doneShares([{ verb: "built", n: 3 }]), [{ verb: "built", n: 3, share: 1 }]);
  assert.deepEqual(doneShares([]), []);
});

test("leadSentence: the note's first sentence", () => {
  assert.equal(leadSentence("Most of the day went to fixes. The plan waited."), "Most of the day went to fixes.");
  assert.equal(leadSentence("Version 1.5 shipped! Then the docs."), "Version 1.5 shipped!");
  assert.equal(leadSentence("  Two\nlines, one sentence.  "), "Two lines, one sentence.");
  assert.equal(leadSentence("No end mark at all"), "No end mark at all");
  assert.equal(leadSentence(""), "");
});

test("resultRows: one row per result, newest first, with the tab's place in the list", () => {
  const f1 = nt({ a: "t1", code: "f1", results: [{ v: "fixed x", at: at(9) }, { v: "shipped y", at: at(15) }] });
  const c2 = nt({ a: "t2", code: "c2", results: [{ v: "built z", at: at(12) }] });
  const rows = resultRows([f1, c2]);
  assert.deepEqual(rows.map((r) => [r.t.code, r.v, r.tab]), [["f1", "shipped y", 0], ["c2", "built z", 1], ["f1", "fixed x", 0]]);
  assert.deepEqual(resultRows([]), []);
});

test("resultRows: results at the same time keep the tabs' order", () => {
  const a = nt({ a: "t1", code: "a1", results: [{ v: "fixed a", at: at(10) }] });
  const b = nt({ a: "t2", code: "b1", results: [{ v: "fixed b", at: at(10) }] });
  assert.deepEqual(resultRows([a, b]).map((r) => r.t.code), ["a1", "b1"]);
});

test("resultRowWords: time, code, mark (✕ only, for a dropped task) and result, then the tab's facts", () => {
  const t = nt({ code: "f1", purpose: "Rate-limit the public API", tasks: "7/7" });
  assert.deepEqual(resultRowWords({ t, v: "shipped rate limiter", at: at(15, 31) }, 3, { text: "All green.", time: at(15, 32) }), {
    time: "15:31", code: "f1", mark: null, v: "shipped rate limiter", purpose: "Rate-limit the public API",
    facts: "todo 7/7 · 3 commits", report: "✎ All green.", reportTime: "15:32",
  });
  const dropped = resultRowWords({ t: nt({ code: "g1" }), v: "dropped log cleanup", at: at(9) }, 1, null);
  assert.equal(dropped.mark, "✕");
  assert.equal(dropped.purpose, null);
  assert.equal(dropped.facts, "1 commit");
  assert.equal(dropped.report, null);
  assert.equal(dropped.reportTime, null);
});

test("resultRowWords: a result older than the tab's purpose says so", () => {
  const t = nt({ code: "f1", purpose: "Pick a way", purposeAt: 2000 });
  assert.equal(resultRowWords({ t, v: "planned x", at: 1000 }, 0, null).facts, "before this purpose");
  assert.equal(resultRowWords({ t, v: "planned x", at: 2000 }, 0, null).facts, "");
});

test("reportFor: the tab's report nearest to the result, within REPORT_NEAR_MS", () => {
  const p = (terminal, time, text = "r") => ({ kind: "report", terminal, time, text });
  const posts = [p("t1", at(9, 1), "early"), p("t1", at(15, 32), "late"), p("t2", at(15, 31), "other tab"), { kind: "comment", terminal: "t1", time: at(15, 31), text: "c" }];
  assert.equal(reportFor(posts, ["t1"], at(15, 31)).text, "late");
  assert.equal(reportFor(posts, ["t1"], at(9)).text, "early");
  assert.equal(reportFor(posts, ["t1"], at(12)), null, "no report near the result");
  assert.equal(reportFor(posts, ["t1"], at(15, 31) - REPORT_NEAR_MS - 60000), null);
  assert.equal(reportFor(posts, ["t1", "t2"], at(15, 31)).text, "other tab", "a merged tab's terminals all count");
});

test("spaceNames: each letter's last name in the day's line events", () => {
  const ev = [{ t: 1, e: "line", l: "d", n: "old" }, { t: 2, e: "line", l: "d", n: "hxat" }, { t: 2, e: "line", l: "c", n: "herdr-plato" }, { t: 3, e: "line", l: "e", n: null }];
  assert.deepEqual([...spaceNames(ev)], [["d", "hxat"], ["c", "herdr-plato"]]);
});

test("groupRows: groups by space in letter order, rows newest first inside, with the place of each child", () => {
  const t = (code) => nt({ code, letter: code[0] });
  const [c1, d1, c2] = [t("c1"), t("d1"), t("c2")];
  const rows = [{ t: c1, v: "shipped z", at: 30 }, { t: d1, v: "tested y", at: 20 }, { t: c2, v: "fixed x", at: 10 }];
  const groups = groupRows(rows, new Map([["c", "herdr-plato"], ["d", "hxat"]]));
  assert.deepEqual(groups.map((g) => [g.letter, g.name, g.rows.map((r) => r.v)]), [["c", "herdr-plato", ["shipped z", "fixed x"]], ["d", "hxat", ["tested y"]]]);
  assert.deepEqual(groupRows([{ t: t("f1"), v: "x", at: 1 }], new Map()).map((g) => g.name), [""], "a space with no name in the record");
  assert.deepEqual(groupRows([], new Map()), []);
});

test("rowsBelow: counts the result rows in the hidden part at the bottom of RESULTS", () => {
  const kinds = ["head", "group", "row", "row", "group", "row", "row", "row"];
  assert.equal(rowsBelow(kinds, 0), 0, "nothing hidden");
  assert.equal(rowsBelow(kinds, 1), 0, "a pixel of rounding is not a row");
  assert.equal(rowsBelow(kinds, 5), 1, "the last row is partly hidden");
  assert.equal(rowsBelow(kinds, ROW_PX + GAP_PX + 5), 2);
  assert.equal(rowsBelow(kinds, 3 * (ROW_PX + GAP_PX) + GROUP_PX), 3, "a group heading is not a row");
  assert.equal(rowsBelow(kinds, 3 * (ROW_PX + GAP_PX) + GROUP_PX + GAP_PX + 5), 4);
});

test("rowsBelow: stops at the picked row, whose height it does not know", () => {
  assert.equal(rowsBelow(["head", "group", "row", "picked", "row"], 500), 2);
  assert.equal(rowsBelow(["head", "group", "row", "row", "other"], ROW_PX + GAP_PX + 5), 1, "the quiet line at the end is not a row");
});

test("moreWords: the count of rows below, or null", () => {
  assert.equal(moreWords(3), "3 more ↓");
  assert.equal(moreWords(0), null);
});

test("reviewKeys: t hides or shows the timeline, on DAY only", () => {
  assert.deepEqual(reviewKeys("day", true).find((k) => k.id === "band"), { id: "band", keys: ["t"], words: "hide the timeline" });
  assert.equal(reviewKeys("day", false).find((k) => k.id === "band").words, "show the timeline");
  assert.equal(reviewKeys("comments", true).find((k) => k.id === "band"), undefined);
  assert.equal(REVIEW_WORDS.timelineHidden, "hidden · t shows it");
});

test("resultCopyText: the code and purpose, the time and result, then the report", () => {
  const words = { time: "11:59", v: "documented prod state", purpose: "Update the explainer" };
  assert.equal(resultCopyText({ code: "a1", words, report: { text: "Updated it.\n\nAll good." } }), "a1 Update the explainer\n11:59 documented prod state\nUpdated it.\n\nAll good.");
  assert.equal(resultCopyText({ code: "g1", words: { ...words, purpose: null }, report: null }), "g1\n11:59 documented prod state");
});

test("commentCopyText: the comment, then its by-line", () => {
  assert.equal(commentCopyText({ text: "You approved the same command.", by: "— f2 · 15:12" }), "You approved the same command.\n— f2 · 15:12");
});

test("resultCountWords: a space heading's count", () => {
  assert.equal(resultCountWords(1), "1 result");
  assert.equal(resultCountWords(7), "7 results");
});

test("GROUP_PX: a space heading is a line with 10 px above it", () => {
  assert.equal(GROUP_PX, ROW_PX + 10);
});
