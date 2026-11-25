// REVIEW's page model: the facts of one day, counted from the day record, the posts and the
// commit lists. Pure (no herdr import), tested by node --test. The review role passes in what is
// live (purposes, folders' commits) and draws what comes out. All times here are ms.
import { dayKey, dayStart, sessions, waits, short } from "./day.js";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const LONG = 2 * HOUR;
const MARK_JOIN = 0.015; // TIMELINE: results closer than this share of the band join in one mark
const SWITCH_SHORT = 2 * 60000, SWITCH_WITHIN = 15 * 60000, SWITCH_MIN = 5; // TIMELINE: a switch burst
const BURST_LABEL_GAP = 0.04; // TIMELINE: a burst's count shows only this share of the band after the last one

/** The verbs a result may start with, in the order the page lists them: finding out, thinking,
 *  making, checking, delivering, writing, and dropping. */
export const VERBS = ["researched", "explored", "explained", "brainstormed", "designed", "planned", "decided", "built", "fixed", "refactored", "configured", "tested", "diagnosed", "reviewed", "shipped", "documented", "drafted", "dropped"];

/** The kinds of post (bin/plato-post). */
export const POST_KINDS = ["report", "comment", "note"];

const pad = (n) => String(n).padStart(2, "0");
const clock = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
const secsToMs = (v) => (/^\d+$/.test(v ?? "") ? Number(v) * 1000 : null);

/** The day the page opens on. Before 12:00, the newest day before today; from 12:00, today.
 *  null when no such day has a record. */
export function openDay(dayKeys, now) {
  const today = dayKey(now);
  if (new Date(now).getHours() >= 12) return dayKeys.includes(today) ? today : null;
  return dayKeys.filter((k) => k < today).sort().pop() ?? null;
}

/** The next day with a record from `from`, in dir (-1 earlier, 1 later); null at the end. */
export function stepDay(dayKeys, from, dir) {
  const ks = dayKeys.filter((k) => (dir < 0 ? k < from : k > from)).sort();
  return (dir < 0 ? ks[ks.length - 1] : ks[0]) ?? null;
}

/** Each tab the day's events know, in first-seen order:
 *  { a, code, letter, purpose, purposeAt, doneAt (the latest, from any day), tasks, results: [{ v, at }], sessions, cwd, active }.
 *  A result counts once per distinct plato.done_at that falls in the day. purpose is the last
 *  plato.purpose_yours, else the last plato.purpose. active: its agent worked or you focused it. */
export function tabFacts(events, now, live = true) {
  void now; void live;
  const from = events.length ? dayStart(events[0].t) : 0;
  const tabs = new Map();
  // The keys each tab nulls at one instant: a tab that closes nulls all it has, and a closed
  // tab's last values stay (the recorder writes only the nulls).
  const nulled = new Map();
  for (const ev of events) {
    if (ev.e === "label" && ev.v == null) {
      const key = `${ev.a}|${ev.t}`;
      nulled.set(key, (nulled.get(key) ?? new Set()).add(ev.k));
    }
  }
  const tab = (a, c) => {
    let t = tabs.get(a);
    if (!t) tabs.set(a, (t = { a, code: c, letter: c?.[0] ?? null, vals: {}, results: [], seen: new Set(), sessions: [], worked: false }));
    if (c) { t.code = c; t.letter = c[0]; }
    return t;
  };
  for (const ev of events) {
    if (ev.e === "agent") {
      const t = tab(ev.a, ev.c);
      if (ev.s === "working") t.worked = true;
    } else if (ev.e === "label") {
      const t = tab(ev.a, ev.c);
      if (ev.v == null) {
        const gone = nulled.get(`${ev.a}|${ev.t}`);
        if (Object.keys(t.vals).every((k) => t.vals[k] == null || gone.has(k))) continue;
      }
      t.vals[ev.k] = ev.v ?? null;
      if (ev.k === "plato.session" && ev.v && !t.sessions.includes(ev.v)) t.sessions.push(ev.v);
      if (ev.k === "plato.done_at") {
        const at = secsToMs(ev.v);
        const v = t.vals["plato.done"];
        if (at != null && v && at >= from && at < from + DAY && !t.seen.has(at)) {
          t.seen.add(at);
          t.results.push({ v, at });
        }
      }
    }
  }
  const focused = new Set(events.filter((e) => e.e === "focus" && e.c).map((e) => e.c));
  return [...tabs.values()].map((t) => ({
    a: t.a, code: t.code, letter: t.letter,
    purpose: t.vals["plato.purpose_yours"] ?? t.vals["plato.purpose"] ?? null,
    purposeAt: secsToMs(t.vals["plato.purpose_at"]),
    doneAt: secsToMs(t.vals["plato.done_at"]),
    tasks: t.vals["plato.tasks"] ?? null,
    results: t.results, sessions: t.sessions, cwd: t.vals.cwd ?? null,
    active: t.worked || focused.has(t.code), worked: t.worked,
  }));
}

// The stretches you stayed on one stop while PLATO recorded: { c, a, from, to, first }, first
// being a stretch that began with the session (restated at open, so not a switch), a the
// terminal that held code c when it began (codes shift when a tab closes), or null.
function focusRuns(events, now, live) {
  const runs = [];
  const holder = new Map();
  let cur = null, openT = null;
  const end = (t) => { if (cur) { cur.to = t; runs.push(cur); cur = null; } };
  let last = 0;
  for (const ev of events) {
    if (ev.e === "open") { end(ev.t); openT = ev.t; last = ev.t; continue; }
    if (openT == null) continue;
    last = Math.max(last, ev.t);
    if (ev.e === "close") { end(ev.t); openT = null; continue; }
    if ((ev.e === "agent" || ev.e === "label") && ev.c && ev.a) {
      // A tab that closes writes nulls under its old code: they release the code, never take it.
      if ((ev.e === "agent" && ev.s == null) || (ev.e === "label" && ev.v == null)) { if (holder.get(ev.c) === ev.a) holder.delete(ev.c); }
      else {
        for (const [c, a] of holder) if (a === ev.a && c !== ev.c) holder.delete(c); // it left its old code
        holder.set(ev.c, ev.a);
      }
    }
    if (ev.e !== "focus" || (cur && cur.c === ev.c) || (!cur && !ev.c)) continue;
    end(ev.t);
    if (ev.c) cur = { c: ev.c, a: holder.get(ev.c) ?? null, from: ev.t, to: ev.t, first: ev.t === openT };
  }
  if (openT != null) end(live ? Math.max(last, now) : last);
  return runs;
}

// Session id working time and /clear marks from the label and agent events. A session id counts
// for the day when a plato.session event names it outside an open or carry snapshot, or when its
// terminal works while it holds the id: a tab left open overnight is restated at each open and
// carry, and that alone is no session. Clears count only the ids that count.
function sessionFacts(events, now, live) {
  const work = new Map(), clears = new Map(), ids = new Set();
  let tabs = {}, openT = null, at = 0, snapT = null;
  const upTo = (t) => {
    for (const x of Object.values(tabs)) if (x.s === "working" && x.id) work.set(x.id, (work.get(x.id) ?? 0) + (t - at));
    at = t;
  };
  for (const ev of events) {
    if (ev.e === "open") { if (openT != null) upTo(ev.t); openT = ev.t; at = ev.t; tabs = {}; snapT = ev.t; continue; }
    if (openT == null) continue;
    if (ev.t !== snapT) snapT = null;
    upTo(ev.t);
    if (ev.e === "close") { openT = null; tabs = {}; continue; }
    let x = null;
    if (ev.e === "agent") { x = (tabs[ev.a] ??= {}); x.s = ev.s; }
    else if (ev.e === "label") {
      x = (tabs[ev.a] ??= {});
      if (ev.k === "plato.session") {
        x.id = ev.v ?? null;
        if (x.id) { if (snapT == null) ids.add(x.id); if (x.how === "clear") clears.set(`${ev.a}|${x.id}`, x.id); }
      } else if (ev.k === "plato.session_how") {
        x.how = ev.v ?? null;
        if (x.id) { if (x.how === "clear") clears.set(`${ev.a}|${x.id}`, x.id); else clears.delete(`${ev.a}|${x.id}`); }
      }
    }
    if (x?.s === "working" && x.id) ids.add(x.id);
  }
  if (openT != null) upTo(live ? Math.max(at, now) : at);
  const counted = [...clears.entries()].filter(([, id]) => ids.has(id));
  return { work, clears: counted.length, clearTabs: counted.map(([k]) => k.split("|")[0]), ids };
}

// The ms of [from, to] before and from noon of the day of from.
function halves(from, to) {
  const noon = dayStart(from) + 12 * HOUR;
  const am = Math.max(0, Math.min(to, noon) - from);
  return { am, pm: Math.max(0, to - Math.max(from, noon)) };
}

/** The day's numbers: tab switches per shown hour (before and from 12:00), the longest hold,
 *  time waited on you, agent questions with the most frequent cut step, sessions (long: its id
 *  is in seenBefore, or it worked over 2 hours) and restarts with /clear. */
export function dayStats(events, now, live, seenBefore = new Set()) {
  const runs = focusRuns(events, now, live);
  const shown = { am: 0, pm: 0 }, count = { am: 0, pm: 0 };
  for (const s of sessions(events, now, live)) {
    const h = halves(s.from, s.to);
    shown.am += h.am;
    shown.pm += h.pm;
  }
  for (const r of runs) {
    if (!r.first) count[new Date(r.from).getHours() < 12 ? "am" : "pm"]++;
  }
  const per = (k) => (shown[k] ? Math.round(count[k] / (shown[k] / HOUR)) : 0);
  let hold = null;
  for (const r of runs) if (!hold || r.to - r.from > hold.ms) hold = { code: r.c, ms: r.to - r.from };
  if (hold && hold.ms <= 0) hold = null;

  // A blocked state restated in an open or carry snapshot is not a new ask.
  const asks = new Map();
  const state = {};
  let n = 0, snapT = null;
  for (const ev of events) {
    if (ev.e === "open") { snapT = ev.t; continue; }
    if (ev.t !== snapT) snapT = null;
    if (ev.e !== "agent") continue;
    if (ev.s === "blocked" && state[ev.a] !== "blocked" && snapT == null) {
      n++;
      if (ev.st) asks.set(ev.st, (asks.get(ev.st) ?? 0) + 1);
    }
    state[ev.a] = ev.s;
  }
  let top = null;
  for (const [step, k] of asks) if (!top || k > top.n) top = { step, n: k };

  const sf = sessionFacts(events, now, live);
  let long = 0;
  for (const id of sf.ids) if (seenBefore.has(id) || (sf.work.get(id) ?? 0) > LONG) long++;
  return {
    switches: { am: per("am"), pm: per("pm") },
    hold,
    waitedMs: waits(events, now, live).reduce((sum, w) => sum + (w.to - w.from), 0),
    asks: { n, top },
    sessions: { total: sf.ids.size, long, quick: sf.ids.size - long },
    clears: sf.clears,
  };
}

// Each agent's working spells: { a, c, from, to }. A spell ends when the agent leaves working or
// goes away, or when recording stops; an open restates the agents, so a spell can start there.
function workSpells(events, now, live) {
  const out = [];
  let open = false, last = 0, cur = {};
  const endAll = (t) => {
    for (const [a, w] of Object.entries(cur)) out.push({ a, c: w.c, from: w.from, to: t });
    cur = {};
  };
  for (const ev of events) {
    if (ev.e === "open") { if (open) endAll(ev.t); open = true; last = ev.t; continue; }
    if (!open) continue;
    if (ev.e === "close") { endAll(ev.t); open = false; continue; }
    last = Math.max(last, ev.t);
    if (ev.e !== "agent") continue;
    const w = cur[ev.a];
    if (ev.s === "working" && !w) cur[ev.a] = { c: ev.c, from: ev.t };
    else if (ev.s !== "working" && w) { out.push({ a: ev.a, c: w.c, from: w.from, to: ev.t }); delete cur[ev.a]; }
  }
  if (open) endAll(live ? Math.max(last, now) : last);
  return out.sort((x, y) => x.from - y.from);
}

/** TIMELINE band: the recorded stretch (from the first open to the last close, or now while
 *  live), the stretches between sessions (offs), the hour marks inside it, and for each space
 *  of the day the focus runs (here), the agents' working spells (work), the waits on you and
 *  the results inside the band (ok: not dropped). null for a day with no session or none with
 *  a length. */
export function dayBand(events, now, live) {
  const ses = sessions(events, now, live);
  if (!ses.length) return null;
  const from = ses[0].from, to = ses[ses.length - 1].to;
  if (to <= from) return null;
  const offs = [];
  for (let i = 1; i < ses.length; i++) if (ses[i].from > ses[i - 1].to) offs.push({ from: ses[i - 1].to, to: ses[i].from });
  const ticks = [];
  for (let t = dayStart(from) + HOUR * Math.floor((from - dayStart(from)) / HOUR + 1); t < to; t += HOUR) ticks.push(t);
  const rows = new Map();
  const row = (l) => {
    if (!rows.has(l)) rows.set(l, { letter: l, name: "", here: [], work: [], waits: [], results: [] });
    return rows.get(l);
  };
  for (const ev of events) if (ev.e === "line" && ev.n) row(ev.l).name = ev.n;
  for (const r of focusRuns(events, now, live)) if (r.to > r.from) row(r.c[0]).here.push({ code: r.c, a: r.a ?? null, from: r.from, to: r.to });
  for (const w of workSpells(events, now, live)) if (w.c && w.to > w.from) row(w.c[0]).work.push({ code: w.c, a: w.a ?? null, from: w.from, to: w.to });
  for (const w of waits(events, now, live)) if (w.c) row(w.c[0]).waits.push({ code: w.c, a: w.a ?? null, from: w.from, to: w.to });
  for (const t of tabFacts(events, now, live)) {
    if (!t.letter) continue;
    for (const r of t.results) if (r.at >= from && r.at <= to) row(t.letter).results.push({ code: t.code, a: t.a, at: r.at, ok: !/^dropped\b/i.test(r.v.trim()) });
  }
  for (const r of rows.values()) r.results.sort((x, y) => x.at - y.at);
  return { from, to, offs, ticks, rows: [...rows.values()].sort((x, y) => (x.letter < y.letter ? -1 : 1)) };
}

/** A bar's label on TIMELINE: the tab's number without the space letter ("c3.2" -> "3.2"),
 *  because the row already names the space. */
export function bandLabel(code) {
  return String(code ?? "").slice(1);
}

/** TIMELINE's result marks: results closer than MARK_JOIN of the span to the first of a group join
 *  in one mark { at, n, ok, items }. ok is false when any of them was dropped. items are the
 *  { code, a } the results came from, each once (for bandHit). results sorted by at. */
export function bandMarks(results, span) {
  const out = [];
  for (const r of results) {
    const g = out[out.length - 1];
    const item = { code: r.code, a: r.a ?? null };
    if (g && r.at - g.at < span * MARK_JOIN) {
      g.n++;
      g.ok = g.ok && r.ok;
      if (!g.items.some((x) => x.code === item.code && x.a === item.a)) g.items.push(item);
    } else out.push({ at: r.at, n: 1, ok: r.ok, items: [item] });
  }
  return out;
}

/** Quick switching on TIMELINE: SWITCH_MIN or more stays of SWITCH_SHORT or less, in any rows,
 *  that start within SWITCH_WITHIN of the first, are one burst { from, to, n }. Bursts less than
 *  SWITCH_WITHIN apart join in one. The rows keep their stays; the band marks bursts above them. */
export function switchBursts(rows) {
  const short = rows.flatMap((r, i) => r.here.filter((h) => h.to - h.from <= SWITCH_SHORT).map((h) => ({ h, i })))
    .sort((x, y) => x.h.from - y.h.from);
  const bursts = [];
  for (let i = 0; i < short.length;) {
    let j = i;
    while (j + 1 < short.length && short[j + 1].h.from - short[i].h.from <= SWITCH_WITHIN) j++;
    const group = short.slice(i, j + 1);
    if (group.length >= SWITCH_MIN) {
      const b = { from: group[0].h.from, to: Math.max(...group.map((g) => g.h.to)), n: group.length };
      const last = bursts[bursts.length - 1];
      if (last && b.from - last.to < SWITCH_WITHIN) { last.to = Math.max(last.to, b.to); last.n += b.n; } else bursts.push(b);
      i = j + 1;
    } else i++;
  }
  return bursts;
}

/** The burst counts TIMELINE shows ({ at, text: "×n" }): each only where it starts at least
 *  BURST_LABEL_GAP of the span after the last one shown, so counts never run together. */
export function burstLabels(bursts, span) {
  const out = [];
  for (const b of bursts) if (!out.length || b.from - out[out.length - 1].at >= span * BURST_LABEL_GAP) out.push({ at: b.from, text: `×${b.n}` });
  return out;
}

/** The label over today's now line on TIMELINE: "now 18:20". */
export function nowWords(t) {
  return `now ${clock(t)}`;
}

/** The place of the result a band item ({ code, a }) belongs to, or -1. Codes shift when a tab
 *  closes, so the item's terminal decides: the first hit whose terminals (as) hold it. An item
 *  with no terminal goes by its code. */
export function bandHit(hits, item) {
  if (item.a) return hits.findIndex((h) => (h.as ?? [h.a]).includes(item.a));
  return hitIndexForCode(hits, item.code);
}

/** The place of the first result with this code, or -1. */
export function hitIndexForCode(hits, code) {
  return hits.findIndex((h) => h.code === code);
}

/** Each tab's time facts by terminal address: the time you were there, the time its agents
 *  waited on you, their new questions (a blocked state restated at an open is none) and its
 *  /clear restarts. Keyed by terminal, because codes shift when a tab closes. */
export function hitTimes(events, now, live, tabs) {
  const zero = () => ({ here: 0, waited: 0, asks: 0, clears: 0 });
  const out = new Map(tabs.map((t) => [t.a, zero()]));
  const get = (a) => (a ? out.get(a) ?? out.set(a, zero()).get(a) : null);
  const lastHolder = new Map(tabs.filter((t) => t.code).map((t) => [t.code, t.a])); // no event named the terminal yet
  for (const r of focusRuns(events, now, live)) { const x = get(r.a ?? lastHolder.get(r.c)); if (x) x.here += r.to - r.from; }
  for (const w of waits(events, now, live)) { const x = get(w.a); if (x) x.waited += w.to - w.from; }
  const state = {};
  let snapT = null;
  for (const ev of events) {
    if (ev.e === "open") { snapT = ev.t; continue; }
    if (ev.t !== snapT) snapT = null;
    if (ev.e !== "agent") continue;
    if (ev.s === "blocked" && state[ev.a] !== "blocked" && snapT == null) { const x = get(ev.a); if (x) x.asks++; }
    state[ev.a] = ev.s;
  }
  for (const a of sessionFacts(events, now, live).clearTabs) { const x = get(a); if (x) x.clears++; }
  return out;
}

/** A result's time line: "here 2h37 · waited 12m · 1 ask · 1 /clear", zero parts left out;
 *  null when all are zero. */
export function hitTimeWords(x) {
  if (!x) return null;
  const parts = [];
  if (x.here > 0) parts.push(`here ${short(x.here)}`);
  if (x.waited > 0) parts.push(`waited ${short(x.waited)}`);
  if (x.asks > 0) parts.push(`${x.asks} ask${x.asks === 1 ? "" : "s"}`);
  if (x.clears > 0) parts.push(`${x.clears} /clear`);
  return parts.length ? parts.join(" · ") : null;
}

/** DONE shows at most this many lines. */
const DONE_LINES = 5;

/** The results counted by verb, in VERBS order with n above 0; verbs outside the list come
 *  last as "other". Past DONE_LINES lines, only the four most used verbs stay. */
export function doneCounts(tabs) {
  const n = new Map();
  for (const t of tabs) {
    for (const r of t.results) {
      const w = r.v.trim().split(/\s+/)[0].toLowerCase();
      const verb = VERBS.includes(w) ? w : "other";
      n.set(verb, (n.get(verb) ?? 0) + 1);
    }
  }
  const all = [...VERBS, "other"].filter((v) => n.get(v)).map((verb) => ({ verb, n: n.get(verb) }));
  if (all.length <= DONE_LINES) return all;
  // A mixed day: the most used verbs (ties in list order), shown in list order, and the rest as other.
  const top = new Set(all.filter((x) => x.verb !== "other").sort((x, y) => y.n - x.n).slice(0, DONE_LINES - 1).map((x) => x.verb));
  const rest = all.filter((x) => !top.has(x.verb)).reduce((sum, x) => sum + x.n, 0);
  return [...all.filter((x) => top.has(x.verb)), { verb: "other", n: rest }];
}

/** DONE's bars: each line's share of the largest count, 0 to 1, so the longest bar is
 *  full width and the others are drawn to scale. */
export function doneShares(done) {
  const most = Math.max(0, ...done.map((d) => d.n));
  return done.map((d) => ({ ...d, share: most ? d.n / most : 0 }));
}

/** The tabs whose purpose has no result (doneAt) at or after the time it was set, oldest first,
 *  with the purpose's age in days. A purpose with no time is left out. After them, the active tabs
 *  with commits but no purpose and no result today, with purpose null. Agent work alone does not
 *  list a tab: on a day without tab labels, every agent tab would show.
 *  commits: hitKey -> the tab's commits (commitsByTab). */
export function openTabs(tabs, now, commits = new Map()) {
  const count = (t) => commits.get(hitKey(t)) ?? 0;
  const aims = tabs
    .filter((t) => t.purpose && t.purposeAt != null && !(t.doneAt >= t.purposeAt))
    .sort((a, b) => a.purposeAt - b.purposeAt)
    .map((t) => ({ code: t.code, purpose: t.purpose, days: Math.max(0, Math.floor((now - t.purposeAt) / DAY)), commits: count(t) }));
  const loose = tabs
    .filter((t) => t.active && t.code && !t.purpose && !t.results.length && count(t) > 0)
    .map((t) => ({ code: t.code, purpose: null, days: null, commits: count(t) }));
  return [...aims, ...loose];
}

/** One OPEN row's words: the purpose, or "(no purpose)", and the purpose's age, or the
 *  commits of a tab with no purpose. */
export function openWords(r) {
  if (r.purpose) return { purpose: r.purpose, meta: ageWords(r.days) };
  return { purpose: "(no purpose)", meta: r.commits > 0 ? `${r.commits} commit${r.commits === 1 ? "" : "s"}` : "" };
}

/** The letters of the day's spaces (slots that held a space) with no active tab. */
export function quietSpaces(events, tabs) {
  const letters = new Set(events.filter((e) => e.e === "line" && e.n).map((e) => e.l));
  const busy = new Set(tabs.filter((t) => t.active).map((t) => t.letter));
  return [...letters].filter((l) => !busy.has(l)).sort();
}

/** A post file as { kind, terminal, time, text }. kind, terminal and time come from the header
 *  lines before the first empty line, never from the name. null for an unknown kind or no
 *  time. A terminal of "none" is null. */
export function parsePost(name, text) {
  void name;
  const lines = String(text).split("\n");
  const end = lines.findIndex((l) => l.trim() === "");
  const head = {};
  for (const l of end < 0 ? lines : lines.slice(0, end)) {
    const m = /^(\w+):\s*(.*?)\s*$/.exec(l);
    if (m && !(m[1] in head)) head[m[1]] = m[2];
  }
  if (!POST_KINDS.includes(head.kind) || !/^\d+$/.test(head.time ?? "")) return null;
  const terminal = !head.terminal || head.terminal === "none" ? null : head.terminal;
  return { kind: head.kind, terminal, time: Number(head.time) * 1000, text: end < 0 ? "" : lines.slice(end + 1).join("\n").trimEnd() };
}

/** What REVIEW shows of a day's posts: the latest report for each tab code (codeOf maps a
 *  terminal to its code, also for a closed one), every comment newest first, and the latest
 *  note. Posts of the same second all count; the later in the list is the
 *  newer. */
export function layoutPosts(posts, codeOf) {
  const newest = posts.map((p, i) => [p, i]).sort((a, b) => b[0].time - a[0].time || b[1] - a[1]).map(([p]) => p);
  const reports = new Map();
  for (const p of newest) {
    if (p.kind !== "report" || !p.terminal) continue;
    const code = codeOf(p.terminal);
    if (code && !reports.has(code)) reports.set(code, p);
  }
  const comments = newest.filter((p) => p.kind === "comment");
  return { reports, comments, note: newest.find((p) => p.kind === "note") ?? null };
}

/** Post file names (<seconds>-<terminal>-<kind>[-<n>].md) in the order they were written: by
 *  time, then by the collision number plato-post adds (none is 1). */
export function postNameOrder(a, b) {
  const key = (n) => {
    const m = /^(\d+)-.*?(?:-(\d+))?\.md$/.exec(n);
    return m ? [Number(m[1]), Number(m[2] ?? 1)] : [0, 0];
  };
  const [x, y] = [key(a), key(b)];
  return x[0] - y[0] || x[1] - y[1] || (a < b ? -1 : a > b ? 1 : 0);
}

/** How many posts REVIEW shows on its two pages: the reports its results show, every comment and the note. */
export function postsShown(layout, reportsShown) {
  return reportsShown + layout.comments.length + (layout.note ? 1 : 0);
}

/** The live stop that shows this terminal, or null. */
export function liveStop(list, terminal) {
  return (terminal && list.find((s) => s.terminal === terminal)) || null;
}

/** The commits in a `git log` listing: its non-empty lines. */
export function countCommits(stdout) {
  return String(stdout).split("\n").filter((l) => l.trim()).length;
}

/** The badge: FACTS ONLY · counted 08:10, FACTS + 9 POSTS · counted 08:10 (· so far for
 *  today), or NO RECORD · <empty> for a day with no data. */
export function badge({ posts, countedAt, soFar, empty }) {
  if (empty != null) return `NO RECORD · ${empty}`;
  const what = posts > 0 ? `FACTS + ${posts} POST${posts === 1 ? "" : "S"}` : "FACTS ONLY";
  return `${what} · counted ${clock(countedAt)}${soFar ? " · so far" : ""}`;
}

/** Whether the day has tab labels from the hooks: a label event other than the folder (cwd),
 *  which the record keeps for every tab. */
export function hasTabLabels(events) {
  return events.some((e) => e.e === "label" && e.k !== "cwd");
}

/** OPEN's words when it lists nothing: every purpose has a result, or no tab has one
 *  (a purpose with no time is not listed, so it counts as none, as in openTabs). */
export function openEmpty(tabs) {
  return tabs.some((t) => t.purpose && t.purposeAt != null) ? REVIEW_WORDS.allDone : REVIEW_WORDS.noPurpose;
}

/** The sources line: the sources present, then the missing ones. While git still counts,
 *  "counting commits" in place of "no git log". null when every source is there. */
export function sourcesLine({ hasLabels, hasPosts, hasGit, counting = false }) {
  const have = ["day record"], lack = [];
  (hasLabels ? have : lack).push(hasLabels ? "tab labels" : "no tab labels");
  (hasGit ? have : lack).push(hasGit ? "git log" : counting ? "counting commits" : "no git log");
  (hasPosts ? have : lack).push(hasPosts ? "posts" : "no posts yet");
  if (!lack.length) return null; // every source is there: the page needs no line for it
  return [...have, ...lack].join(" · ");
}

/** One result's words: head (code and purpose), facts (the latest result, todo progress,
 *  commits), the report's text with ✎, or null, and the report's time as HH:MM, or null. A
 *  result older than the tab's purpose belongs to the purpose before it, and says so. */
export function resultTabWords(tab, commits, report) {
  const last = tab.results[tab.results.length - 1];
  const facts = [];
  if (!last) facts.push("○ no result today");
  else facts.push(`${/^dropped\b/i.test(last.v) ? "✕" : "✓"} ${last.v}${tab.purposeAt != null && last.at < tab.purposeAt ? " · before this purpose" : ""}`);
  if (tab.tasks) facts.push(/^todo\b/i.test(tab.tasks) ? tab.tasks : `todo ${tab.tasks}`);
  if (commits > 0) facts.push(`${commits} commit${commits === 1 ? "" : "s"}`);
  return {
    head: tab.purpose ? `${tab.code} ${tab.purpose}` : tab.code, facts: facts.join(" · "),
    report: report ? `✎ ${report.text}` : null, reportLine: report ? `✎ ${report.text.replace(/\s+/g, " ").trim()}` : null, reportTime: report?.time != null ? clock(report.time) : null,
  };
}

/** The first sentence of a note on one line: white space collapsed, cut after the first . ! or ?
 *  that is followed by white space or the end. */
export function leadSentence(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t;
}

/** The words the page shows that never change. */
export const REVIEW_WORDS = {
  title: "THE PLATO REVIEW",
  director: "DIRECTOR",
  results: "RESULTS",
  note: "DIRECTOR'S NOTE",
  shareable: "◆ shareable",
  done: "DONE",
  open: "OPEN",
  went: "HOW IT WENT",
  comments: "COMMENTS",
  timeline: "TIMELINE",
  day: "DAY",
  report: "report",
  noNoteLine: "no note today",
  noNoteToday: "no note today · see REVIEW in the README",
  noComments: "none yet",
  noResults: "no tab has anything to report",
  noneDone: "no results",
  allDone: "every purpose has a result",
  noPurpose: "no tab has a purpose",
  why: "PLATO was not running",
  copied: "note copied",
  noNote: "no note to copy",
  noTab: "this comment has no tab",
  nothingPicked: "nothing to pick",
  closes: "or esc closes",
  more: "tab reads more",
};

/** The key line, left to right. Each key is also a click. */
/** The key line of a page ("day" or "comments"): Tab to the other page, then the page's keys. */
export function reviewKeys(page) {
  const onDay = page === "day";
  return [
    { id: "page", keys: ["tab"], words: onDay ? REVIEW_WORDS.comments : REVIEW_WORDS.day },
    { id: "pick", keys: ["↑", "↓"], words: onDay ? "pick a result" : "pick a comment" },
    { id: "look", keys: ["space"], words: "LOOK at its tab" },
    { id: "go", keys: ["↵"], words: "go to the tab" },
    { id: "copy", keys: ["c"], words: "copy the note" },
    { id: "day", keys: ["←", "→"], words: "another day" },
  ];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateOf = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };

/** The day the page would open on with every day recorded: before 12:00 the day before, from
 *  12:00 today. Named on a page with no record. */
export function wantedDay(now) {
  const d = new Date(now);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}

/** A day's start and the next day's start, in unix seconds (local time), for git log. */
export function dayBounds(key) {
  const d = dateOf(key);
  const from = d.getTime() / 1000;
  d.setDate(d.getDate() + 1);
  return { from, to: d.getTime() / 1000 };
}

/** "covers Mon 23 Nov". */
export function coversWords(key) {
  const d = dateOf(key);
  return `covers ${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** A tab's key for its commits and hit: a merged tab's key (code and purpose), else its code. */
export const hitKey = (t) => t.key ?? t.code;

/** The tabs as the page shows them: the terminals that held one code with one purpose (or with
 *  none) are one tab, in the order the first was seen. Codes shift as tabs close and open, so a
 *  busy day has several terminals under one code; one hit for each keeps the page calm. A
 *  merged tab has as (its terminals), a (for Enter and LOOK: the last one an agent worked in,
 *  else the newest), all their results and sessions, cwds (all their folders), the oldest
 *  purpose time, the newest result time, and the newest todo and folder. The oldest purpose
 *  time and newest result time are meant: a purpose that got a result under this code, in any
 *  terminal, has its answer, so it leaves OPEN. A tab with no code stays alone. */
export function mergeTabs(tabs) {
  const groups = new Map();
  for (const t of tabs) {
    const key = t.code ? `${t.code}|${t.purpose ?? ""}` : `|${t.a}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const last = (list, k) => list.reduce((v, t) => t[k] ?? v, null);
  const nums = (list, k) => list.map((t) => t[k]).filter((v) => v != null);
  return [...groups.entries()].map(([key, list]) => ({
    ...list[list.length - 1],
    key, as: list.map((t) => t.a), a: (list.filter((t) => t.worked).pop() ?? list[list.length - 1]).a,
    cwds: [...new Set(nums(list, "cwd"))],
    results: list.flatMap((t) => t.results).sort((x, y) => x.at - y.at),
    sessions: [...new Set(list.flatMap((t) => t.sessions))],
    purposeAt: nums(list, "purposeAt").length ? Math.min(...nums(list, "purposeAt")) : null,
    doneAt: nums(list, "doneAt").length ? Math.max(...nums(list, "doneAt")) : null,
    tasks: last(list, "tasks"), cwd: last(list, "cwd"),
    active: list.some((t) => t.active), worked: list.some((t) => t.worked),
  }));
}

/** A merged tab's time facts: the sum over its terminals (hitTimes is keyed by terminal). */
export function sumTimes(times, as) {
  const out = { here: 0, waited: 0, asks: 0, clears: 0 };
  for (const a of as) for (const k of Object.keys(out)) out[k] += times.get(a)?.[k] ?? 0;
  return out;
}

/** The newest report from any of these terminals, or null. */
export function latestReport(posts, as) {
  const set = new Set(as);
  return posts.filter((p) => p.kind === "report" && set.has(p.terminal)).reduce((n, p) => (!n || p.time >= n.time ? p : n), null);
}

/** A tab has news of its own: an agent worked in it, or it has a purpose or a result. */
const hasNews = (t) => Boolean(t.worked || t.purpose || t.results.length);

/** The commits each tab shows: each repo counts once, for the first tab whose folder is in it,
 *  keyed by hitKey. Tabs with news come first, so a shell you only looked at never takes an
 *  agent's commits; after them, the rest in tabs order. A merged tab tries each of its cwds
 *  and adds up its repos. repoOf maps a folder to its repo, counts a repo to its commits. Tabs
 *  with none are left out. */
export function commitsByTab(tabs, repoOf, counts) {
  const out = new Map(), used = new Set();
  for (const t of [...tabs.filter(hasNews), ...tabs.filter((t) => !hasNews(t))]) {
    if (!t.code) continue;
    for (const cwd of t.cwds ?? (t.cwd ? [t.cwd] : [])) {
      const repo = repoOf.get(cwd);
      if (!repo || used.has(repo)) continue;
      used.add(repo);
      if (counts.get(repo) > 0) out.set(hitKey(t), (out.get(hitKey(t)) ?? 0) + counts.get(repo));
    }
  }
  return out;
}

/** The results: each active tab with a code and a result today, newest result first. A tab
 *  with news but no result is in OPEN (openTabs). */
export function resultTabs(tabs) {
  const lastAt = (t) => t.results[t.results.length - 1].at;
  return tabs.filter((t) => t.active && t.code && t.results.length).sort((a, b) => lastAt(b) - lastAt(a));
}

/** HOW IT WENT as [label, value] rows, from dayStats. */
export function dayWentRows(s) {
  return [
    ["sessions", `${s.sessions.total} · ${s.sessions.long} long · ${s.sessions.quick} quick`],
    ["switches per hour", `am ${s.switches.am} · pm ${s.switches.pm}`],
    ["longest hold", s.hold ? `${s.hold.code} · ${short(s.hold.ms)}` : "none"],
    ["agents waited on you", short(s.waitedMs)],
    ["agent questions", s.asks.top ? `${s.asks.n} · ${s.asks.top.step} ${s.asks.top.n}×` : String(s.asks.n)],
    ["restarts with /clear", String(s.clears)],
  ];
}

/** The results' last line: "b, g quiet", or null with no quiet space. */
export function quietWords(letters) {
  return letters.length ? `${letters.join(", ")} quiet` : null;
}

/** A purpose's age: "today", "1 day", "6 days". */
export function ageWords(days) {
  return days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`;
}

/** Who sent a post and when: "f2 · 15:12", or "no tab · 06:40" for a post with no tab. */
export function byline(post, code) {
  return `${code ?? "no tab"} · ${clock(post.time)}`;
}

/** "7 today" on today's page, "7 comments" on a past day's. */
const commentCount = (n, today) => `${n} ${today ? "today" : "comments"}`;

/** The page name COMMENTS with the day's comment count, so DAY shows that comments came. */
export function commentsWords(n) {
  return n ? `${REVIEW_WORDS.comments} ${n}` : REVIEW_WORDS.comments;
}

/** The heading note of COMMENTS' list: "7 today · newest first", or "none yet". */
export function commentsHead(n, today) {
  return n ? `${commentCount(n, today)} · newest first` : "none yet";
}

/** The notice for a tab that has closed since the day it shows. */
export function notOpen(code) {
  return `${code} is not open now`;
}
