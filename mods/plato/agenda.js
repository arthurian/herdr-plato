// The agenda, as pure functions: the columns' cursor and the code you type, each space's
// day in blocks and words (TODAY), and its nine days (WEEK). No "herdr" import, so Node can
// test it (test/agenda.test.mjs). agendaview.js and agendaweek.js draw it.


import { dueWords, segTotals, yAt, gaps, daySegs, daySegsCached, dayKey, dueList } from "./day.js";
import { span } from "./overview.js";

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

/** Less than this in a day (ran, waited and your time together) is not activity: passing
 *  through a space with NEXT does not make it busy, and a space keeps its QUIET tag. */
const ACTIVE_MIN = 60000;

/** When a slot's space took its letter: when it opened, or when CLOSE UP moved it there. */
export function slotSince(slot) {
  return Math.max(slot?.opened ?? 0, slot?.letter_at ?? 0);
}

/** A letter's day as one daySegs entry: its stretches under every name it held, from the time
 *  its space opened (slot.opened). A rename keeps the space's history, and an earlier space at
 *  the same letter is left out. Undefined when the letter has none. */
export function letterEntry(segs, letter, opened = 0) {
  const byName = segs?.[letter];
  if (!byName) return undefined;
  const clip = (list) => list.filter((x) => x.to > opened).map((x) => ({ ...x, from: Math.max(x.from, opened) }));
  const all = Object.values(byName);
  return {
    segs: clip(all.flatMap((e) => e.segs)).sort((a, b) => a.from - b.from),
    you: clip(all.flatMap((e) => e.you)).sort((a, b) => a.from - b.from),
  };
}

/** A TODAY column's marks, top to bottom in px on an axis height px tall: the closed bands
 *  first (drawn under the rest), then the stretches when an agent ran or waited, then your
 *  time there. entry is a daySegs entry (or undefined), ses the day's sessions. Each mark is
 *  at least 3 px tall; a label gives the time shown (clipped to the axis) where it fits.
 *  [{ kind: "closed" | "ran" | "wait" | "you", top, height, label }] */
export function dayBlocks(entry, ses, axis, height) {
  const out = [];
  const mark = (kind, from, to, words, min) => {
    const a = Math.max(from, axis.from), b = Math.min(to, axis.to);
    if (b <= a) return;
    const top = yAt(axis, height, a);
    const h = Math.max(3, yAt(axis, height, b) - top);
    out.push({ kind, top, height: h, label: words && h >= min ? words(b - a) : "" });
  };
  for (const g of gaps(ses, axis.from, axis.to)) mark("closed", g.from, g.to, () => "not recorded", 16);
  for (const s of entry?.segs ?? []) {
    if (s.kind === "ran") mark("ran", s.from, s.to, (ms) => `ran ${span(ms)}`, 30);
    else mark("wait", s.from, s.to, (ms) => `WAIT ${span(ms)}`, 16);
  }
  for (const s of entry?.you ?? []) mark("you", s.from, s.to, null, 0);
  return out;
}

/** A TODAY column head's words: its due date and tone ("late", "soon" for today to two days,
 *  "plain", or "none" with no date and no words), the time agents ran and you were there today
 *  (none when quiet), and its last activity. Under ACTIVE_MIN of activity today, the column is
 *  quiet. Your own time counts as activity, so the space you are in reads "active now".
 *  entry is a daySegs entry (or undefined), due a dueList entry (or null). */
export function columnWords({ entry, due, now }) {
  const t = segTotals(entry);
  const quiet = t.ran + t.wait + t.you < ACTIVE_MIN;
  const dueTone = !due ? "none" : due.days < 0 ? "late" : due.days <= 2 ? "soon" : "plain";
  const ends = [...(entry?.segs ?? []), ...(entry?.you ?? [])].map((s) => s.to);
  const lastAt = ends.length ? Math.max(...ends) : null;
  let last;
  if (quiet) last = "QUIET today";
  else if (now - lastAt < 60000) last = "active now";
  else last = `last active ${span(now - lastAt)} ago`;
  return {
    due: due ? dueWords(due) : null,
    dueTone,
    day: quiet ? null : `ran ${span(t.ran)} · you ${span(t.you)}`,
    last,
    quiet,
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The WEEK view's days, oldest first: before days before today, today, and after days after
 *  it. [{ key: "2026-11-19", label: "Thu 19", past, today, future }] */
export function weekDays(now, before = 4, after = 4) {
  const t = new Date(now);
  const out = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    out.push({ key: dayKey(d.getTime()), label: `${DAY_NAMES[d.getDay()]} ${d.getDate()}`, past: i < 0, today: i === 0, future: i > 0 });
  }
  return out;
}

// A past day's file does not change, so its replay is kept by its events array (the route
// reads each past day once). The agenda draws on every change in Herdr, and replaying a busy day
// each time is too slow for Herdr's render budget.
const PAST = new WeakMap();
function pastSegs(events) {
  if (!PAST.has(events)) PAST.set(events, daySegs(events, 0, false));
  return PAST.get(events);
}

/** The WEEK view's rows, one per slot in line order. days is weekDays(); events maps a day key
 *  to that day's events (the past days and today). A free slot is { letter, free: true, was }.
 *  A used one has a cell per day ("before" it opened, "ran" with its ran and your time, "none",
 *  and for the future "due" or "future"), the week's ran and your time, its last day with
 *  activity in words, quiet (nothing today or yesterday), its dueList entry, dueLater (the due
 *  date is after the last day), late and dueNote (the due words for under the name). A due
 *  date of today also marks today's cell (due: true). Time counts only since the space took
 *  its letter (slotSince, letterEntry), so a rename keeps its history and CLOSE UP does not
 *  mix in the space that had the letter before. */
export function weekGrid(days, events, line, spaces, now) {
  const names = new Map(spaces.map((s) => [s.id, s.name]));
  const dues = new Map(dueList(line, spaces, now).map((d) => [d.letter, d]));
  const byDay = new Map(days.filter((d) => !d.future).map((d) => [d.key, d.today ? daySegsCached(events.get(d.key) ?? [], now, true) : pastSegs(events.get(d.key) ?? [])]));
  const ti = days.findIndex((d) => d.today);
  const lastKey = days[days.length - 1].key;
  return (line?.slots ?? []).map((slot) => {
    const name = slot.space ? names.get(slot.space) : null;
    if (!name) return { letter: slot.letter, free: true, was: slot.was ?? null };
    const since = slotSince(slot);
    const opened = since ? dayKey(since) : "";
    const due = dues.get(slot.letter) ?? null;
    let ran = 0, you = 0, lastI = -1;
    const cells = days.map((d, i) => {
      if (d.future) return { kind: due && due.due === d.key ? "due" : "future" };
      if (d.key < opened) return { kind: "before" };
      const t = segTotals(letterEntry(byDay.get(d.key), slot.letter, since));
      const dueHere = d.today && due && due.due === d.key ? { due: true } : {};
      if (t.ran + t.wait + t.you < ACTIVE_MIN) return { kind: "none", ...dueHere };
      ran += t.ran;
      you += t.you;
      lastI = i;
      return { kind: "ran", ran: t.ran, wait: t.wait, you: t.you, ...dueHere };
    });
    const last = lastI === ti ? "today" : lastI >= 0 ? `since ${days[lastI].label}` : `before ${days[0].label}`;
    return {
      letter: slot.letter, name, free: false, cells, ran, you, last,
      quiet: lastI < ti - 1,
      due, dueLater: Boolean(due && due.due > lastKey), late: Boolean(due && due.days < 0),
      // The due words under the name, where no cell shows them: after the week (with →),
      // late, or today.
      dueNote: !due ? null : due.due > lastKey ? `${dueWords(due)} →` : due.days <= 0 ? dueWords(due) : null,
    };
  });
}

/** The WEEK view's totals: ran and your time over the used rows, and the past day or today
 *  with the most ran time ({ label, ran }, or null with none). */
export function weekTotals(rows, days) {
  const used = rows.filter((r) => !r.free);
  let busiest = null;
  days.forEach((d, i) => {
    if (d.future) return;
    const ran = used.reduce((n, r) => n + (r.cells[i].ran ?? 0), 0);
    if (ran > 0 && (!busiest || ran > busiest.ran)) busiest = { label: d.label, ran };
  });
  return { ran: used.reduce((n, r) => n + r.ran, 0), you: used.reduce((n, r) => n + r.you, 0), busiest };
}

/** The line under the agenda's view. "today": t = { ran, wait, you, quiet }; "week": t is weekTotals. */
export function totalsLine(kind, t) {
  const w = (ms) => (ms > 0 ? span(ms) : "0m");
  if (kind === "today") return `agents ran ${w(t.ran)} · waited on you ${w(t.wait)} · you ${w(t.you)} · ${t.quiet} quiet`;
  const parts = [`agents ran ${w(t.ran)}`, `you ${w(t.you)}`];
  if (t.busiest) parts.push(`busiest ${t.busiest.label} · ${w(t.busiest.ran)}`);
  return parts.join(" · ");
}

/** How many columns of min px, gap px apart, fit in width px. At least one. */
export function fitColumns(width, min, gap) {
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

/** The columns the agenda shows, { start, end } (end exclusive), when n columns do not all
 *  fit: fit of them, always with the cursor's column. The window keeps start while the
 *  cursor stays in view and slides only as far as it must, so it does not jump. */
export function columnWindow(n, cursor, fit, start = 0) {
  if (fit >= n) return { start: 0, end: n };
  let s = Math.min(Math.max(start, 0), n - fit);
  if (cursor < s) s = cursor;
  else if (cursor >= s + fit) s = cursor - fit + 1;
  return { start: s, end: s + fit };
}


/** What the agenda's cursor is on, for the keys panel (shared plato.agenda's cur): the space's
 *  letter and name, and the stop's code, tab id and label. at: cursorAt()'s { column, stop }. */
export function agendaCur(at) {
  if (!at?.column) return null;
  const { column, stop } = at;
  return { space: column.letter, code: stop?.code ?? null, tab: stop?.tab ?? null, name: column.name ?? "", label: stop?.label ?? "" };
}
