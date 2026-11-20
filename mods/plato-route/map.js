// The map, as pure functions: one column per letter (free letters keep theirs), the
// stop code you type, the cursor, and the signals and totals beside it. No "herdr"
// import, so Node can test it (test/map.test.mjs). plato-signals keeps an identical copy
// (a test checks it), because a mod cannot import from another mod's folder.

import { signalList, tabCount } from "./line.js";

/** One column per slot of the line, in letter order: { letter, free, space, name, closed,
 *  was, stops }. A free letter keeps its column, so the others never slide sideways. */
export function mapColumns(line, spaces, all) {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  return (line?.slots ?? []).map((slot) => {
    const space = slot.space ? byId.get(slot.space) ?? null : null;
    return {
      letter: slot.letter,
      free: !slot.space,
      space,
      name: space?.name ?? slot.name ?? "",
      closed: slot.closed ?? null,
      was: slot.was ?? "",
      stops: space ? all.filter((s) => s.space === space.id) : [],
    };
  });
}

/** A key typed in the map, with buf the code typed so far.
 *  Returns { buf, go } (a stop to go to), { buf, signOn } (a free letter) or { buf }.
 *  A space's letter starts a code; digits and "." extend it while some stop's code
 *  starts with it; it goes as soon as exactly one stop matches the whole code. */
export function typeCode(buf, key, columns) {
  const k = String(key ?? "").toLowerCase();
  if (/^[a-z]$/.test(k)) {
    const t = columns.find((x) => x.letter === k);
    if (!t) return { buf };
    if (t.free) return { buf: "", signOn: k };
    return { buf: k };
  }
  if (!/^[0-9.]$/.test(k) || !buf) return { buf };
  const code = buf + k;
  const cands = codeCandidates(code, columns);
  if (!cands.length) return { buf };
  if (cands.length === 1 && cands[0].code === code) return { buf: "", go: cands[0] };
  return { buf: code };
}

/** A key during JUMP (cmd-j): the map's codes without the map. Returns { buf }, { go }
 *  (a stop) or { cancel }. It reads the key, not the character it types, so a code typed
 *  with shift still held after the chord counts (shift-3 is 3). A free letter does nothing:
 *  a jump never starts a sign-on. A letter and Enter goes to that space's active stop. */
export function jumpKey(buf, e, columns) {
  const m = e.modifiers ?? {};
  if (m.platform || m.control || m.alt) return { buf };
  if (e.key === "escape") return { cancel: true };
  if (e.key === "backspace") return { buf: buf.slice(0, -1) };
  if (e.key === "enter") {
    if (!buf) return { cancel: true };
    if (buf.length === 1) {
      const t = columns.find((x) => x.letter === buf);
      const active = t?.space?.tabs?.find((x) => x.active)?.id;
      const stop = t?.stops.find((s) => s.tab === active) ?? t?.stops[0] ?? null;
      return stop ? { go: stop } : { cancel: true };
    }
    const stop = enterCode(buf, columns);
    return stop ? { go: stop } : { buf };
  }
  const key = String(e.key ?? "").toLowerCase();
  if (key.length !== 1) return { buf };
  if (columns.find((x) => x.letter === key)?.free) return { buf };
  const t = typeCode(buf, key, columns);
  return t.go ? { go: t.go } : { buf: t.buf };
}

/** The stops whose code starts with code, in line order. */
export function codeCandidates(code, columns) {
  if (!code) return [];
  return columns.flatMap((t) => t.stops).filter((s) => s.code.startsWith(code));
}

/** Enter with a code typed: the stop with exactly that code, else the first that
 *  starts with it (c3 in a split tab goes to c3.1). Null for a bare letter or no match. */
export function enterCode(buf, columns) {
  if (!buf || buf.length < 2) return null;
  const c = codeCandidates(buf, columns);
  return c.find((s) => s.code === buf) ?? c[0] ?? null;
}

/** Where the cursor starts: on the current stop, else the first stop. */
export function startCursor(columns, cur) {
  for (let col = 0; col < columns.length; col++) {
    const row = columns[col].stops.findIndex((s) => cur && s.code === cur.code);
    if (row >= 0) return { col, row };
  }
  const col = Math.max(0, columns.findIndex((t) => t.stops.length));
  return { col, row: 0 };
}

/** The cursor after an arrow key: left and right change column (keeping the row as far as
 *  the new column goes), up and down move along it. No wrapping. */
export function moveCursor(c, key, columns) {
  if (!columns.length) return c;
  let { col, row } = c;
  if (key === "left") col -= 1;
  else if (key === "right") col += 1;
  else if (key === "up") row -= 1;
  else if (key === "down") row += 1;
  else return c;
  col = Math.min(Math.max(col, 0), columns.length - 1);
  const n = columns[col].stops.length;
  row = Math.min(Math.max(row, 0), Math.max(n - 1, 0));
  return { col, row };
}

/** What the cursor is on: { column, stop } (stop null on a free column). */
export function cursorAt(columns, c) {
  const column = columns[Math.min(c.col, columns.length - 1)] ?? null;
  return { column, stop: column?.stops[c.row] ?? null };
}

/** When a stop's state began (ms), from its tab: working since, else last changed. */
export function stateSince(stop, spaces) {
  const tab = spaces.find((s) => s.id === stop.space)?.tabs?.find((t) => t.id === stop.tab);
  if (!tab) return null;
  return stop.status === "working" ? tab.working_since ?? null : tab.changed_at ?? null;
}

/** "waiting" (needs you: blocked, or done and not seen), "working" or "idle". */
export function mapState(status) {
  if (status === "blocked" || status === "done") return "waiting";
  return status === "working" ? "working" : "idle";
}

/** SIGNALS: the agents that need you in NEXT1 order (blocked longest waiting first, then
 *  done-but-unseen oldest first), each with its stop when it has one. */
export function signalRows(agents, all) {
  return signalList(agents).map((a) => ({ agent: a, stop: all.find((s) => s.pane === a.pane) ?? null }));
}

/** MAP TOTALS: counts of spaces, free letters, tabs, the states of the stops, the
 *  longest-working stop and the stop idle longest ({ stop, since } or null). */
export function mapTotals(line, all, spaces) {
  const slots = line?.slots ?? [];
  const t = { spaces: slots.filter((s) => s.space).length, free: slots.filter((s) => !s.space).length, tabs: tabCount(all), waiting: 0, working: 0, idle: 0, longest: null, oldestIdle: null };
  for (const s of all) {
    const st = mapState(s.status);
    t[st] += 1;
    const since = stateSince(s, spaces);
    if (since == null) continue;
    if (st === "working" && (!t.longest || since < t.longest.since)) t.longest = { stop: s, since };
    if (st === "idle" && (!t.oldestIdle || since < t.oldestIdle.since)) t.oldestIdle = { stop: s, since };
  }
  return t;
}

/** A space's day in words, for its summary line, from the timetable's graph (day.js build:
 *  row.segs, each { from, to, kind: "ran" | "idle" | "wait" }): "ran 1h 40m today · last
 *  active 3m ago". "ran" counts the time any agent there was working. "last active" is the end
 *  of the last run or wait; it is left out while one is still going (the summary already
 *  says "working" or "waiting"). Null when nothing ran or waited today. */
export function activityWords(row, now) {
  const busy = (row?.segs ?? []).filter((s) => s.kind === "ran" || s.kind === "wait");
  if (!busy.length) return null;
  const ran = busy.filter((s) => s.kind === "ran").reduce((n, s) => n + (s.to - s.from), 0);
  const last = Math.max(...busy.map((s) => s.to));
  const parts = [ran > 0 ? `ran ${span(ran)} today` : "no runs today"];
  if (now - last >= 60000) parts.push(`last active ${span(now - last)} ago`);
  return parts.join(" · ");
}

/** "under 1m", "12m", "1h 40m". */
function span(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "under 1m";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** How many columns of min px, gap px apart, fit in width px. At least one. */
export function fitColumns(width, min, gap) {
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

/** The columns the map shows, { start, end } (end exclusive), when n columns do not all
 *  fit: fit of them, always with the cursor's column. The window keeps start while the
 *  cursor stays in view and slides only as far as it must, so it does not jump. */
export function columnWindow(n, cursor, fit, start = 0) {
  if (fit >= n) return { start: 0, end: n };
  let s = Math.min(Math.max(start, 0), n - fit);
  if (cursor < s) s = cursor;
  else if (cursor >= s + fit) s = cursor - fit + 1;
  return { start: s, end: s + fit };
}

/** What the map's GO box says beside the code typed so far: { text, kind }, where kind is
 *  "hint" (nothing typed), "space" (a letter), "tab" (a code that matches) or "none". */
export function codeWords(code, columns) {
  if (!code) return { text: "type a code: c3", kind: "hint" };
  if (code.length === 1) {
    const t = columns.find((x) => x.letter === code);
    if (!t) return { text: "no such space", kind: "none" };
    return { text: t.free ? `${t.letter} · free` : `${t.letter} ${t.name} · add its tab number`, kind: "space" };
  }
  const c = codeCandidates(code, columns)[0];
  return c ? { text: `${c.code} ${c.spaceName} · ${c.label}`, kind: "tab" } : { text: "no such tab", kind: "none" };
}

/** A key typed in the map, which selects a card rather than going there (Enter goes):
 *  { code, cursor }, where cursor is { col, row } or null when nothing changes. A letter
 *  selects its space's first card (a free letter its dashed card); digits and "." narrow
 *  it to the stop with that exact code, else the first stop whose code starts with it. */
export function selectCode(code, key, columns) {
  const k = String(key ?? "").toLowerCase();
  if (/^[a-z]$/.test(k)) {
    const col = columns.findIndex((x) => x.letter === k);
    return col < 0 ? { code, cursor: null } : { code: k, cursor: { col, row: 0 } };
  }
  if (!/^[0-9.]$/.test(k) || !code) return { code, cursor: null };
  const next = code + k;
  const cands = codeCandidates(next, columns);
  if (!cands.length) return { code, cursor: null };
  const s = cands.find((x) => x.code === next) ?? cands[0];
  const col = columns.findIndex((x) => x.letter === s.letter);
  return { code: next, cursor: { col, row: columns[col].stops.findIndex((x) => x.code === s.code) } };
}

/** Backspace in the map: { code, cursor } for the code one key shorter. The cursor goes
 *  where that code selects (a letter alone: its space's first card), and with no code
 *  left, back to where you are (cur). With nothing typed it stays put (cursor null). */
export function backCode(code, columns, cur) {
  if (!code) return { code: "", cursor: null };
  const next = code.slice(0, -1);
  if (!next) return { code: "", cursor: startCursor(columns, cur) };
  return { code: next, cursor: selectCode(next.slice(0, -1), next.slice(-1), columns).cursor };
}
