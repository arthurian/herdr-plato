// What TREE, JUMP, LOOK, SIGNALS, the agenda and the hover detail share, as pure functions:
// one column per letter, the code you type, the state of a tab, the signals and totals,
// LOOK's card and JUMP's list. No "herdr" import, so Node can test it (test/overview.test.mjs).

import { signalList, tabCount, purposeOf, purposeSource, purposeLines, duration } from "./line.js";
import { dueWords } from "./day.js";

/** One column per slot of the line, in letter order: { letter, free, space, name, closed,
 *  was, stops }. A free letter keeps its column, so the others never slide sideways. */
export function letterColumns(line, spaces, all) {
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

/** When a stop's state began (ms), from its tab: working since, else last changed. */
export function stateSince(stop, spaces) {
  const tab = spaces.find((s) => s.id === stop.space)?.tabs?.find((t) => t.id === stop.tab);
  if (!tab) return null;
  return stop.status === "working" ? tab.working_since ?? null : tab.changed_at ?? null;
}

/** "waiting" (needs you: blocked, or done and not seen), "working" or "idle". */
export function tabState(status) {
  if (status === "blocked" || status === "done") return "waiting";
  return status === "working" ? "working" : "idle";
}

/** SIGNALS: the agents that need you in NEXT1 order (blocked longest waiting first, then
 *  done-but-unseen oldest first), each with its stop when it has one. */
export function signalRows(agents, all) {
  return signalList(agents).map((a) => ({ agent: a, stop: all.find((s) => s.pane === a.pane) ?? null }));
}

/** The counts behind the last lines of DUE: counts of spaces, free letters, tabs, the states of the stops, the
 *  longest-working stop and the stop idle longest ({ stop, since } or null). */
export function tabTotals(line, all, spaces) {
  const slots = line?.slots ?? [];
  const t = { spaces: slots.filter((s) => s.space).length, free: slots.filter((s) => !s.space).length, tabs: tabCount(all), waiting: 0, working: 0, idle: 0, longest: null, oldestIdle: null };
  for (const s of all) {
    const st = tabState(s.status);
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
export function span(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "under 1m";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** A hovered tab's detail, for the readout of the route or the agenda: { title, purpose (at
 *  most two lines of perLine characters), source, program, status, time }, in the words of
 *  the strip and NOW AT. since: when the state began (stateSince), or null. */
export function hoverDetail(stop, purpose, since, now, perLine) {
  const source = purpose ? purposeSource(purpose) : "";
  return {
    title: `${stop.code} ${stop.spaceName} · ${stop.label || "—"}`,
    purpose: purpose ? purposeLines(purpose.text, source, perLine, 2) : [],
    source,
    program: stop.program || "—",
    status: stop.status,
    time: since != null ? duration(since, now) : "",
  };
}

/** LOOK's arrow keys: right and down step to the next card of n, left and up to the one
 *  before, wrapping; any other key keeps i. */
export function lookStep(n, i, key) {
  if (n < 1) return i;
  if (key === "right" || key === "down") return (i + 1) % n;
  if (key === "left" || key === "up") return (i - 1 + n) % n;
  return i;
}

const LOOK_BADGE = { blocked: "NEEDS YOU", done: "DONE", working: "WORKING" };
const LOOK_STATE = { blocked: "waiting on you", done: "done, not seen yet", working: "working" };
const LOOK_ROLE = { NEXT1: "NEXT1 goes here first", NEXT: "NEXT goes here" };

/** The LOOK card of a stop, as words: { letter, code, where, badge, tone, sub, rows }.
 *  tone is "bright" (needs you), "fg" (working) or "dim" (idle). Each row is { k, lines,
 *  note, tone }, its tone "text" (what was written), "fg" or "dim". d: { stop, labels (its
 *  terminal's), last ({ text, at }: lastSent), folder, home, tabs (the space's tab count),
 *  due (a dueList entry or null), today (activityWords or null), subAgents (a count), role
 *  ("NEXT1", "NEXT" or ""), since (stateSince), now, perLine }. */
export function lookCard(d) {
  const { stop, labels = {}, now, perLine } = d;
  const status = stop.status ?? null;
  const time = d.since != null ? duration(d.since, now) : "";
  const short = time === "now" ? "<1m" : time;
  const long = time === "now" ? "under 1m" : time;
  const quote = (t) => purposeLines(`“${t}”`, "", perLine, 3);
  const get = (k) => String(labels[k] ?? "").trim();
  const state = LOOK_STATE[status];
  const sub = [stop.program || "—", state ? `${state}${long ? ` for ${long}` : ""}` : "idle", LOOK_ROLE[d.role]].filter(Boolean).join(" · ");
  const rows = [];
  const purpose = purposeOf(labels);
  if (!purpose) rows.push({ k: "PURPOSE", lines: ["—"], note: "none set · ⌘E sets one", tone: "dim" });
  else {
    const was = get("plato.purpose_was");
    const note = purpose.source === "first" ? "first prompt · no purpose set yet"
      : `${purposeSource(purpose).slice(2)}${purpose.revised && was ? ` · earlier: “${was}”` : ""}`;
    rows.push({ k: "PURPOSE", lines: purposeLines(purpose.text, "", perLine, 3), note, tone: "text" });
  }
  const first = get("plato.first");
  if (first && purpose?.source !== "first" && first !== purpose?.text) rows.push({ k: "FIRST PROMPT", lines: quote(first), note: "", tone: "text" });
  rows.push(d.last?.text
    ? { k: "LAST SENT", lines: quote(d.last.text), note: d.last.at == null ? "" : duration(d.last.at, now) === "now" ? "just now" : `${duration(d.last.at, now)} ago`, tone: "text" }
    : { k: "LAST SENT", lines: ["nothing sent here yet"], note: "", tone: "dim" });
  if (d.folder) {
    const home = d.home && d.folder.startsWith(d.home) ? `~${d.folder.slice(d.home.length)}` : d.folder;
    rows.push({ k: "FOLDER", lines: [home], note: "", tone: "fg" });
  }
  const dueText = d.due ? dueWords(d.due) : "no due date";
  rows.push({ k: `SPACE ${stop.letter}`, lines: [`${stop.spaceName} · ${d.tabs} tab${d.tabs === 1 ? "" : "s"} · ${dueText}`], note: "", tone: "fg" });
  rows.push({ k: "TODAY", lines: [d.today ?? "nothing ran today"], note: "", tone: d.today ? "fg" : "dim" });
  rows.push({ k: "SUB-AGENTS", lines: [d.subAgents > 0 ? `${d.subAgents} running` : "none"], note: "", tone: d.subAgents > 0 ? "fg" : "dim" });
  return {
    letter: stop.letter, code: stop.code, where: `${stop.spaceName} · ${stop.label || "—"}`,
    badge: LOOK_BADGE[status] ? `${LOOK_BADGE[status]}${short ? ` ${short}` : ""}` : "IDLE",
    tone: status === "blocked" || status === "done" ? "bright" : status === "working" ? "fg" : "dim",
    sub, rows,
  };
}

// ---- JUMP (cmd-j): find a tab by its code, name, purpose or folder ----

/** JUMP's groups, in the order Tab steps through them. */
export const JUMP_GROUPS = ["all", "waiting", "working", "idle"];

/** Tab (or shift-Tab, back) in JUMP: the next group, wrapping. */
export function jumpGroupStep(group, back) {
  const i = Math.max(JUMP_GROUPS.indexOf(group), 0);
  return JUMP_GROUPS[(i + (back ? JUMP_GROUPS.length - 1 : 1)) % JUMP_GROUPS.length];
}

/** The words of a JUMP query, in lower case. Each must match, in any order. */
export function jumpWords(query) {
  return String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/** The stop a JUMP query names as a code, or null: the stop with exactly that code, else
 *  the first whose code starts with it (c3 in a split tab is c3.1); one letter of an
 *  occupied space names its active tab (else its first stop). */
export function jumpCode(query, columns) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!/^[a-z](\d+(\.\d*)?)?$/.test(q)) return null;
  if (q.length === 1) {
    const t = columns.find((x) => x.letter === q);
    const active = t?.space?.tabs?.find((x) => x.active)?.id;
    return t?.stops.find((s) => s.tab === active) ?? t?.stops[0] ?? null;
  }
  return enterCode(q, columns);
}

/** JUMP's list. entries: [{ stop, purpose, folder }] in line order (purpose and folder are
 *  text, or ""); waiting: the codes of the agents that need you, in NEXT1 order; columns:
 *  letterColumns, for codes. Every word of the query must appear in the stop's code, space,
 *  name, program, purpose or folder. Returns { code, groups, picks, counts }: code is the
 *  entry the query names as a code (shown first, and left out of its group); groups are
 *  [{ key, entries }] for the group asked for ("all" gives waiting in NEXT1 order, working,
 *  then idle, in line order), empty groups left out; picks are the entries in the order
 *  shown, code first; counts are the matches in each group, before the group filter. */
export function jumpList(entries, waiting, query, group, columns) {
  const words = jumpWords(query);
  const named = jumpCode(query, columns);
  const code = named ? entries.find((e) => e.stop.code === named.code) ?? null : null;
  const hay = (e) => [e.stop.code, e.stop.spaceName, e.stop.label, e.stop.program, e.purpose, e.folder].join(" ").toLowerCase();
  const matches = entries.filter((e) => e === code || words.every((w) => hay(e).includes(w)));
  const counts = { all: matches.length, waiting: 0, working: 0, idle: 0 };
  for (const e of matches) counts[tabState(e.stop.status)] += 1;
  const rank = (e) => { const i = waiting.indexOf(e.stop.code); return i < 0 ? waiting.length : i; };
  const groups = JUMP_GROUPS.slice(1)
    .filter((key) => group === "all" || group === key)
    .map((key) => {
      const list = matches.filter((e) => e !== code && tabState(e.stop.status) === key);
      return { key, entries: key === "waiting" ? [...list].sort((a, b) => rank(a) - rank(b)) : list };
    })
    .filter((g) => g.entries.length);
  return { code, groups, picks: [...(code ? [code] : []), ...groups.flatMap((g) => g.entries)], counts };
}

/** Text split where the query's words match, for lighting them: [{ text, hit }]. Each word
 *  lights its first match, ignoring case. */
export function matchSegs(text, words) {
  const s = String(text ?? "");
  const low = s.toLowerCase();
  const hit = new Array(s.length).fill(false);
  for (const w of words) {
    const i = low.indexOf(w);
    if (i >= 0) for (let k = i; k < i + w.length; k++) hit[k] = true;
  }
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.text += s[i];
    else out.push({ text: s[i], hit: hit[i] });
  }
  return out;
}
