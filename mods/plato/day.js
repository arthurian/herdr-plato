// The TODAY panel's day: what the timetable role records, how the train graph is built from it,
// each agent's waits on you, and the rolling window the graph shows. Pure (no herdr import),
// tested by node --test.
//
// A day file (plato-data/YYYY-MM-DD.json under the app home) holds events in time order:
//   { t, e: "open" }                      the app (this panel) started recording; carry: a new day
//   { t, e: "close" }                     it stopped (app quit, layout switched away)
//   { t, e: "line", l: "d", n: "docs" }   a space took letter d (n null: d went free)
//   { t, e: "agent", a: "t7", c: "d1", s: "working" }   an agent's state (s null: it went away)
//   { t, e: "focus", c: "d1" }            the stop you are at (c null: none)
//   { t, e: "label", a: "t7", c: "d1", k: "plato.done", v: "fixed tests" }   a tab's logged label
//                                         or its folder (k "cwd"); v null: it went away
// A blocked agent event also carries st, the cut step (cutStep). Old day files have no labels.
// Each "open" is followed by a snapshot of everything, so a session never needs the one before.

const HOUR = 3600000;
const DAY = 24 * HOUR;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-19", in local time. */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of the day of ms. */
export function dayStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The labels the day record keeps (never plato.first, plato.last or the full plato.step). */
export const LOGGED_LABELS = ["plato.session", "plato.session_how", "plato.done", "plato.done_at", "plato.purpose", "plato.purpose_yours", "plato.purpose_at", "plato.tasks"];

/** The step an agent waits on, cut so no private text is kept: the first two words of a Bash
 *  command, else only the tool name. null for no step. */
export function cutStep(step) {
  if (!step) return null;
  const m = /^Bash: (\S+(?: \S+)?)/.exec(step);
  return m ? `Bash: ${m[1]}` : step.split(/[ :]/)[0];
}

/** What the timetable watches: the occupied letters, each agent's state and stop code,
 *  the stop you are at, and each tab's logged labels and folder. `stops` are line.js stops
 *  (code, terminal, status); `terms` is terminals() and `panes` is panes() from herdr. */
export function worldOf(line, spaces, stops, focusCode, terms = [], panes = []) {
  const names = new Map(spaces.map((s) => [s.id, s.name]));
  const slots = {};
  for (const s of line?.slots ?? []) if (s.space && names.has(s.space)) slots[s.letter] = { space: s.space, name: names.get(s.space) };
  const labels = new Map(terms.map((x) => [x.address, x.labels ?? {}]));
  const cwds = new Map(panes.map((x) => [x.terminal, x.cwd]));
  const agents = {}, tabs = {};
  for (const p of stops) {
    if (!p.terminal) continue;
    const have = labels.get(p.terminal) ?? {};
    const l = {};
    for (const k of LOGGED_LABELS) if (typeof have[k] === "string") l[k] = have[k];
    tabs[p.terminal] = { c: p.code, l, cwd: cwds.get(p.terminal) ?? null };
    if (!p.status) continue;
    agents[p.terminal] = { c: p.code, s: p.status };
    if (p.status === "blocked") agents[p.terminal].st = cutStep(have["plato.step"]);
  }
  return { slots, agents, focus: focusCode ?? null, tabs };
}

// A tab's logged values by key: its folder, then its logged labels.
const tabValues = (tab) => [["cwd", tab?.cwd ?? null], ...LOGGED_LABELS.map((k) => [k, tab?.l?.[k] ?? null])];

/** The events that state the whole world at t: the start of a session ("open"), or of a new
 *  day while the app stays open (carry). */
export function snapshot(world, t, carry = false) {
  const out = [carry ? { t, e: "open", carry: true } : { t, e: "open" }];
  for (const l of Object.keys(world.slots).sort()) out.push({ t, e: "line", l, n: world.slots[l].name });
  for (const a of Object.keys(world.agents).sort()) out.push({ t, e: "agent", a, c: world.agents[a].c, s: world.agents[a].s, ...stOf(world.agents[a]) });
  for (const a of Object.keys(world.tabs ?? {}).sort()) {
    for (const [k, v] of tabValues(world.tabs[a])) if (v != null) out.push({ t, e: "label", a, c: world.tabs[a].c, k, v });
  }
  if (world.focus) out.push({ t, e: "focus", c: world.focus });
  return out;
}

// The cut step of a blocked agent, as event fields (none when it has none).
const stOf = (x) => (x.s === "blocked" && x.st ? { st: x.st } : {});

const union = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

/** The events for what changed between two worlds (none when nothing did). A rename alone is
 *  not a change; a different space taking a letter is. */
export function changes(prev, cur, t) {
  const out = [];
  for (const l of union(prev.slots, cur.slots)) {
    const a = prev.slots[l], b = cur.slots[l];
    if ((a?.space ?? null) !== (b?.space ?? null)) out.push({ t, e: "line", l, n: b ? b.name : null });
  }
  for (const a of union(prev.agents, cur.agents)) {
    const x = prev.agents[a], y = cur.agents[a];
    if (!y) out.push({ t, e: "agent", a, c: x.c, s: null });
    else if (!x || x.s !== y.s || x.c !== y.c || (y.s === "blocked" && (x.st ?? null) !== (y.st ?? null))) out.push({ t, e: "agent", a, c: y.c, s: y.s, ...stOf(y) });
  }
  if (prev.focus !== cur.focus) out.push({ t, e: "focus", c: cur.focus });
  for (const a of union(prev.tabs ?? {}, cur.tabs ?? {})) {
    const x = prev.tabs?.[a], y = cur.tabs?.[a], before = new Map(tabValues(x));
    for (const [k, v] of tabValues(y)) if (before.get(k) !== v) out.push({ t, e: "label", a, c: (y ?? x).c, k, v });
  }
  return out;
}

/** The day file's text: one event per line, so it reads and diffs well. */
export function dayText(day, events) {
  return `{"version":1,"day":"${day}","events":[\n${events.map((e) => JSON.stringify(e)).join(",\n")}\n]}\n`;
}

/** One step of the recorder (recorder.js): the world w at now against the state
 *  { day, events, prev }. Returns the next state and whether to write the day file. A new
 *  day starts with the world at midnight (carry) and is written at once, so the new day's
 *  file exists for its readers. Before today's file is read (events null), nothing changes. */
export function recordStep(state, w, now) {
  if (!state.events) return { ...state, write: false };
  let { day, events } = state;
  const rolled = dayKey(now) !== day;
  if (rolled) {
    day = dayKey(now);
    events = state.prev ? snapshot(state.prev, dayStart(now), true) : [];
  }
  const add = state.prev ? changes(state.prev, w, now) : snapshot(w, now);
  if (add.length) events = [...events, ...add];
  return { day, events, prev: w, write: rolled || add.length > 0 };
}

/** The day to keep after a read, prev and next being { key, events }. A day file only grows
 *  within its day, so a shorter read of the same day is the file caught mid-write: keep prev. */
export function freshDay(prev, next) {
  if (!prev || prev.key !== next.key || next.events.length >= prev.events.length) return next;
  return prev;
}

/** The events of a day file; [] for a missing or broken one. */
export function parseDay(text) {
  if (!text) return [];
  try {
    const d = JSON.parse(text);
    return Array.isArray(d?.events) ? d.events.filter((e) => e && typeof e.t === "number" && typeof e.e === "string") : [];
  } catch {
    return [];
  }
}

/** When the app was recording: from each "open" to its "close", else to the next "open" (a mod
 *  reload or an update writes no close, and the panel kept running), else, for the last one, to
 *  now while live or to its last event. */
export function sessions(events, now, live = true) {
  const out = [];
  let cur = null;
  for (const ev of events) {
    if (ev.e === "open") {
      if (cur) out.push({ from: cur.from, to: Math.max(cur.to, ev.t) });
      cur = { from: ev.t, to: ev.t };
    } else if (cur && ev.e === "close") {
      cur.to = ev.t;
      out.push(cur);
      cur = null;
    } else if (cur) {
      cur.to = Math.max(cur.to, ev.t);
    }
  }
  if (cur) {
    if (live) cur.to = Math.max(cur.to, now);
    out.push(cur);
  }
  return out;
}

/** Replays the events, calling span(from, to, state) for each stretch of time the app was
 *  recording, with the state that held over it (slots: letter -> name, agents: a -> {c, s},
 *  focus). event(ev, state) sees each event after it is applied. */
function replay(events, now, live, span, event) {
  let open = false, last = null;
  let st = { slots: {}, agents: {}, focus: null };
  const upTo = (t) => { if (open && last != null && t > last) span(last, t, st); };
  for (const ev of events) {
    if (ev.e === "open") {
      // A session without a close ran to this open (sessions() agrees).
      upTo(ev.t);
      open = true;
      last = ev.t;
      st = { slots: {}, agents: {}, focus: null };
      continue;
    }
    if (!open) continue;
    if (ev.e === "close") { upTo(ev.t); open = false; continue; }
    upTo(ev.t);
    last = Math.max(last, ev.t);
    if (ev.e === "line") { if (ev.n) st.slots[ev.l] = ev.n; else delete st.slots[ev.l]; }
    else if (ev.e === "agent") { if (ev.s) st.agents[ev.a] = { c: ev.c, s: ev.s }; else delete st.agents[ev.a]; }
    else if (ev.e === "focus") st.focus = ev.c ?? null;
    event?.(ev, st);
  }
  if (open && live) upTo(now);
}

/** A space's state over a stretch: "wait" if an agent there waited on you (blocked),
 *  else "ran" if one was working, else "idle". */
export function slotKind(agents, letter) {
  let k = "idle";
  for (const x of Object.values(agents)) {
    if (x.c?.[0] !== letter) continue;
    if (x.s === "blocked") return "wait";
    if (x.s === "working") k = "ran";
  }
  return k;
}

function add(list, seg, same) {
  const prev = list[list.length - 1];
  if (prev && prev.to === seg.from && same(prev, seg)) prev.to = seg.to;
  else list.push(seg);
}

/** The train graph: per letter, its stretches (ran, idle, wait) while it was on the line and
 *  the app was open, and the times it went free (ends); your path as stretches at a letter;
 *  and the sessions, so the rest of the day can be drawn as a gap. */
export function build(events, now, live = true) {
  const rows = {};
  const path = [];
  const row = (l) => (rows[l] ??= { name: null, segs: [], ends: [] });
  replay(events, now, live,
    (from, to, st) => {
      for (const l of Object.keys(st.slots)) add(row(l).segs, { from, to, kind: slotKind(st.agents, l) }, (a, b) => a.kind === b.kind);
      const fl = st.focus?.[0];
      if (fl && st.slots[fl]) add(path, { from, to, letter: fl }, (a, b) => a.letter === b.letter);
    },
    (ev) => {
      if (ev.e !== "line") return;
      if (ev.n) row(ev.l).name = ev.n;
      else row(ev.l).ends.push(ev.t);
    });
  return { rows, path, sessions: sessions(events, now, live) };
}

const MIN = 60000;
const SPAN = 2 * HOUR;   // the window: the last two hours of recorded time, unless chosen
/** How many days of day files TODAY keeps; older ones are deleted when it starts. */
export const KEEP_DAYS = 60;

/** The day files in a folder listing that are older than keep days before now. Other names
 *  are never included, so nothing but a day file is ever deleted. */
export function oldDayFiles(names, now, keep = KEEP_DAYS) {
  const cutoff = dayKey(now - keep * 24 * HOUR);
  return names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) < cutoff).sort();
}

/** The dated folders (YYYY-MM-DD) in a folder listing that are older than keep days before
 *  now. Other names are never included. */
export function oldPostFolders(names, now, keep = KEEP_DAYS) {
  const cutoff = dayKey(now - keep * 24 * HOUR);
  return names.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n < cutoff).sort();
}

/** How long one write of the day file may run. Each write holds the whole day, so the
 *  recorder can drop a write that never ends and let the next one save everything. */
export const WRITE_MS = 10000;

/** A write that started at `at` (null: none is running) is stuck at `now`. */
export function writeStuck(at, now) {
  return at != null && now - at > WRITE_MS;
}

/** A change waits unsaved (pending), no write runs, and the last write was asked for more than
 *  WRITE_MS before now: the recorder writes again, so a full disk or a lost permission heals. */
export function retryDue(pending, running, asked, now) {
  return pending && !running && asked != null && now - asked > WRITE_MS;
}

/** How long a change may wait unsaved, or the first read of the day file may run, before the
 *  banner warns that the record is behind. */
export const BEHIND_MS = 60000;

/** Since when the record is behind at now, or null. The first read has not ended (ready
 *  false) BEHIND_MS after the start, or a change waits unsaved since pendingAt for longer than
 *  BEHIND_MS. The recorder writes only on a change, so a quiet hour is not behind. */
export function behindSince({ startedAt, ready, pendingAt }, now) {
  if (!ready && now - startedAt > BEHIND_MS) return startedAt;
  if (pendingAt != null && now - pendingAt > BEHIND_MS) return pendingAt;
  return null;
}

/** The banner's warning: "record not written for 47 min", "... for 2 h 5 min". */
export function behindWords(since, now) {
  const m = Math.floor((now - since) / MIN);
  const t = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return `record not written for ${t}`;
}

/** The windows TODAY steps through on a click: the last 2, 6, 12 or 24 hours. */
export const SPANS = [2, 6, 12, 24].map((h) => h * HOUR);

/** The day keys a window needs before today's, oldest first: none when it starts today. */
export function daysBefore(now, span) {
  const out = [];
  const today = dayStart(now);
  for (let d = dayStart(now - span); d < today; d = dayStart(d + 26 * HOUR)) out.push(dayKey(d));
  return out;
}

const FLOOR = 30 * MIN;  // the smallest time scale, so a short morning is not stretched
const BREAK = 6;         // px for a closed stretch between two pieces of the window
const JOIN = 2 * MIN;    // a shorter closed stretch (a reload, a quick restart) is no break

/** Each agent's waits on you (blocked spells), in time order: { a, c, from, to, open }. A spell
 *  ends when the agent leaves blocked or goes away, or when recording stops (a close, or the
 *  next open after a session without one). While live, a spell still going runs to now. */
export function waits(events, now, live = true) {
  const out = [];
  let open = false, last = null, cur = {};
  const endAll = (t) => {
    for (const [a, w] of Object.entries(cur)) out.push({ a, c: w.c, from: w.from, to: t, open: false });
    cur = {};
  };
  for (const ev of events) {
    if (ev.e === "open") {
      if (open) endAll(ev.t); // no close: it ran to this open, which restates any wait
      open = true;
      last = ev.t;
      continue;
    }
    if (!open) continue;
    if (ev.e === "close") { endAll(ev.t); open = false; continue; }
    last = Math.max(last, ev.t);
    if (ev.e !== "agent") continue;
    const w = cur[ev.a];
    if (ev.s === "blocked" && !w) cur[ev.a] = { c: ev.c, from: ev.t };
    else if (ev.s !== "blocked" && w) {
      out.push({ a: ev.a, c: w.c, from: w.from, to: ev.t, open: false });
      delete cur[ev.a];
    }
  }
  if (open) for (const [a, w] of Object.entries(cur)) out.push({ a, c: w.c, from: w.from, to: live ? now : last, open: live });
  return out.sort((x, y) => x.from - y.from);
}

/** A duration for a narrow column: "0m", "<1m", "14m", "1h10". */
export function short(ms) {
  if (ms <= 0) return "0m";
  if (ms < MIN) return "<1m";
  const m = Math.floor(ms / MIN);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${pad(m % 60)}`;
}

/** The response line: how many waits you answered today, the typical (median) one and the
 *  longest, with its stop. Waits still going are left out (SIGNALS shows those). */
export function responseWords(list) {
  const done = list.filter((w) => !w.open).map((w) => ({ c: w.c, d: w.to - w.from }));
  if (!done.length) return "No waits answered yet today.";
  if (done.length === 1) return `1 wait answered · ${short(done[0].d)} at ${done[0].c}`;
  const ds = done.map((w) => w.d).sort((a, b) => a - b);
  const longest = done.reduce((a, b) => (b.d > a.d ? b : a));
  return `${done.length} waits answered · typical ${short(ds[Math.floor((ds.length - 1) / 2)])} · longest ${short(longest.d)} at ${longest.c}`;
}

/** A graph row's ran and waited time (ms), for the words at its right end. */
export function rowTotals(row) {
  const t = { ran: 0, wait: 0 };
  for (const s of row?.segs ?? []) if (s.kind === "ran" || s.kind === "wait") t[s.kind] += s.to - s.from;
  return t;
}

/** The window the graph shows: the last `span` of recorded time (two hours unless chosen),
 *  ending now and starting no earlier than `since` (midnight, unless yesterday's events were
 *  read too). Closed stretches are left out, so each session in it is a piece:
 *  { pieces: [{from, to}], total }. Sessions less than two minutes apart count as one. */
export function windowAxis(ses, now, span = SPAN, since = dayStart(now)) {
  const start = since;
  const joined = [];
  for (const s of ses) {
    const prev = joined[joined.length - 1];
    if (prev && s.from - prev.to < JOIN) prev.to = Math.max(prev.to, s.to);
    else joined.push({ from: s.from, to: s.to });
  }
  const pieces = [];
  let left = span;
  for (let i = joined.length - 1; i >= 0 && left > 0; i--) {
    const to = Math.min(joined[i].to, now);
    const from = Math.max(joined[i].from, start, to - left);
    if (to <= from) continue;
    pieces.unshift({ from, to });
    left -= to - from;
  }
  return { pieces, total: span - left };
}

/** px along a window drawn `width` wide. Each closed stretch is a gap of brk px. Under the
 *  smallest scale the time sits at the right, with room at the left. Outside: clamped. */
export function xAt(wax, width, t, brk = BREAK) {
  const n = wax.pieces.length;
  if (!n) return width;
  const avail = width - brk * (n - 1);
  const ppm = avail / Math.max(wax.total, FLOOR);
  let x = avail - wax.total * ppm;
  for (let i = 0; i < n; i++) {
    const p = wax.pieces[i];
    if (t <= p.from) return Math.round(x);
    if (t <= p.to) return Math.round(x + (t - p.from) * ppm);
    x += (p.to - p.from) * ppm + (i < n - 1 ? brk : 0);
  }
  return Math.round(x);
}

/** Hour marks inside the window's pieces, at least minGap px apart for "09" labels. */
export function windowTicks(wax, width, minGap = 30, brk = BREAK) {
  const out = [];
  let lastX = -Infinity;
  for (const p of wax.pieces) {
    for (let t = Math.ceil(p.from / HOUR) * HOUR; t <= p.to; t += HOUR) {
      const x = xAt(wax, width, t, brk);
      if (x - lastX < minGap) continue;
      out.push({ t, x, label: pad(new Date(t).getHours()) });
      lastX = x;
    }
  }
  return out;
}

/** The stop behind a wait box at a space: the latest spell there that overlaps it. */
export function waitCode(list, letter, from, to) {
  let code = null;
  for (const w of list) if (w.c?.[0] === letter && w.from < to && w.to > from) code = w.c;
  return code;
}

/** The due list: each occupied space with a due date in plato.line, soonest first, with
 *  its days left (0 today, negative when late). */
export function dueList(line, spaces, now) {
  const names = new Map(spaces.map((s) => [s.id, s.name]));
  const today = dayStart(now);
  const out = [];
  for (const s of line?.slots ?? []) {
    const m = s.space && names.has(s.space) && typeof s.due === "string" && s.due.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    out.push({ letter: s.letter, name: names.get(s.space), due: s.due, days: Math.round((d.getTime() - today) / DAY), label: `${WEEKDAYS[d.getDay()]} ${d.getDate()}` });
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.letter < b.letter ? -1 : 1));
}

/** "1", "today", "2 late". */
export function daysWords(days) {
  if (days === 0) return "today";
  return days < 0 ? `${-days} late` : String(days);
}

/** A due date as one phrase, for a space's summary: "due Fri 27 · 3 days", "due Thu 19 ·
 *  today", "due Wed 18 · 1 late". d is a dueList entry. */
export function dueWords(d) {
  const days = d.days > 0 ? `${d.days} day${d.days === 1 ? "" : "s"}` : daysWords(d.days);
  return `due ${d.label} · ${days}`;
}
