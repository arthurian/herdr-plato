// The sign-on and sign-off pages' logic, as pure functions (test/sign.test.mjs):
// the space name or folder typed, where to look for its folder, the optional due
// date, what signing off does to the line, and where you land after it.

import { closeUp } from "./line.js";

const DAY = 86400000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const midnight = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** What was typed on the name line: a space name, or a folder path (/… or ~/…) whose
 *  last part becomes the name. { name, path } with path null for a plain name. */
export function signOnTarget(text, home) {
  const t = String(text ?? "").trim();
  if (t.startsWith("/") || t === "~" || t.startsWith("~/")) {
    const path = (t.startsWith("~") ? home + t.slice(1) : t).replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    return { name: path.split("/").pop() || path, path };
  }
  return { name: t, path: null };
}

/** Where to look for a space's folder, in order: beside the folders of the open
 *  spaces, then the home folder. No folder names are built in, so it works the same on
 *  any computer: your spaces show where your projects live. */
export function folderCandidates(name, home, folders) {
  if (!name || name.includes("/")) return [];
  const parents = folders.filter(Boolean).map((f) => f.replace(/\/+$/, "").replace(/\/[^/]*$/, "")).filter(Boolean);
  const roots = [...new Set([...parents, home])];
  return roots.map((r) => `${r}/${name}`);
}

/** A folder path that fits in max characters: whole if it fits, else "~/…/" or "/…/" and
 *  as many of its last parts as fit, so the folder's own name always shows. */
export function shortPath(path, max) {
  if (!path || path.length <= max) return path ?? "";
  const head = path.startsWith("~/") ? "~/…/" : "/…/";
  const parts = path.split("/").filter(Boolean);
  let tail = parts.pop() ?? "";
  while (parts.length && head.length + parts[parts.length - 1].length + 1 + tail.length <= max) tail = `${parts.pop()}/${tail}`;
  return head + tail;
}

/** A path that can wrap after each "/" (a zero-width space there), for showing it whole. */
export function wrapPath(path) {
  return String(path ?? "").replace(/\//g, "/\u200b");
}

/** The optional due date: "" (none), 2026-11-27, 11/27 or 11-27, 27 (that day of the
 *  month), a weekday (fri), or +5 (days from today). The next such date from today.
 *  { due: "YYYY-MM-DD" | null } or { error }. */
export function parseDue(text, now) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return { due: null };
  const today = midnight(now);
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() !== Number(m[2]) - 1) return { error: "no such date" };
    return { due: iso(d) };
  }
  if ((m = t.match(/^(\d{1,2})[/-](\d{1,2})$/))) {
    const mo = Number(m[1]) - 1, day = Number(m[2]);
    for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
      const d = new Date(y, mo, day);
      if (d.getMonth() !== mo) return { error: "no such date" };
      if (d >= today) return { due: iso(d) };
    }
  }
  if ((m = t.match(/^\+(\d{1,3})$/))) return { due: iso(addDays(today, Number(m[1]))) };
  const word = t.match(/^([a-z]{3})[a-z]*\.?(?:\s+(\d{1,2}))?$/);
  const wd = word ? WEEKDAYS.indexOf(word[1]) : -1;
  const dayOnly = t.match(/^(\d{1,2})$/)?.[1] ?? (wd >= 0 ? word[2] : null);
  if (dayOnly) {
    const day = Number(dayOnly);
    for (let k = 0; k < 400; k++) {
      const d = addDays(today, k);
      if (d.getDate() === day && (wd < 0 || d.getDay() === wd)) return { due: iso(d) };
    }
    return { error: "no such date" };
  }
  if (wd >= 0) for (let k = 1; k <= 7; k++) { const d = addDays(today, k); if (d.getDay() === wd) return { due: iso(d) }; }
  return { error: "write it as 2026-11-27, 11/27, 27, fri or +5" };
}

/** "Fri 27 Nov · 8 days" (or today, tomorrow, 2 days ago). */
export function dueWords(due, now) {
  if (!due) return "";
  const [y, mo, d] = due.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  const n = Math.round((date - midnight(now)) / DAY);
  const name = WEEKDAYS[date.getDay()];
  const when = n === 0 ? "today" : n === 1 ? "tomorrow" : n > 0 ? `${n} days` : n === -1 ? "1 day ago" : `${-n} days ago`;
  return `${name[0].toUpperCase()}${name.slice(1)} ${d} ${MONTHS[mo - 1]} · ${when}`;
}

/** "a–c", "a", or null for an empty list of slots. */
function span(slots) {
  if (!slots.length) return null;
  return slots.length === 1 ? slots[0].letter : `${slots[0].letter}–${slots[slots.length - 1].letter}`;
}

/** What signing off a space does to the line. A space in the middle leaves a free slot
 *  (and U would close up: moves lists [from, to] letters); the last space comes off
 *  with the free slots right before it. Null if the space has no letter. */
export function signOffPlan(line, spaceId) {
  const slots = line?.slots ?? [];
  const i = slots.findIndex((s) => s.space === spaceId);
  if (i < 0) return null;
  const middle = slots.slice(i + 1).some((s) => s.space);
  let keep = i;
  if (!middle) while (keep > 0 && !slots[keep - 1].space) keep--;
  const after = slots.map((s, k) => (k === i ? { letter: s.letter, space: null } : s));
  return {
    letter: slots[i].letter,
    middle,
    comesOff: middle ? [] : slots.slice(keep, i + 1).map((s) => s.letter),
    leaves: span(middle ? slots : slots.slice(0, keep)),
    moves: middle ? closeUp({ slots: after }, 0).slots.filter((s) => s.moved_from).map((s) => [s.moved_from, s.letter]) : [],
  };
}

/** What CLOSE UP does to the line: the free letters that come off, and each space that
 *  moves up, as [from, to, name]. Both empty when there is nothing to close up. */
export function closeUpPlan(line) {
  const slots = line?.slots ?? [];
  return {
    free: slots.filter((s) => !s.space).map((s) => s.letter),
    moves: closeUp({ slots }, 0).slots.filter((s) => s.moved_from).map((s) => [s.moved_from, s.letter, s.name ?? ""]),
  };
}

/** Where NEXT lands after signing off: the first stop of the next space in line
 *  order (wrapping), or null if this is the only space. */
export function landing(list, spaceId) {
  let i = -1;
  list.forEach((s, k) => { if (s.space === spaceId) i = k; });
  for (let k = 1; k <= list.length; k++) {
    const s = list[(i + k + list.length) % list.length];
    if (s.space !== spaceId) return s;
  }
  return null;
}

// ---- A one-line input, macOS and readline keys ----

const wordLeft = (t, i) => { while (i > 0 && t[i - 1] === " ") i--; while (i > 0 && t[i - 1] !== " ") i--; return i; };
const wordRight = (t, i) => { while (i < t.length && t[i] === " ") i++; while (i < t.length && t[i] !== " ") i++; return i; };

/** One key applied to a one-line input {text, cursor}, macOS style. Returns the new
 *  state, or null for a key it does not handle. ev: {key, mods, char, clip}. */
export function editLine(state, ev) {
  const { text: t, cursor: c } = state;
  const m = ev.mods ?? {};
  const at = (text, cursor) => ({ text, cursor });
  const insert = (s) => at(t.slice(0, c) + s + t.slice(c), c + s.length);
  switch (ev.key) {
    case "left": return at(t, m.platform ? 0 : m.alt ? wordLeft(t, c) : Math.max(0, c - 1));
    case "right": return at(t, m.platform ? t.length : m.alt ? wordRight(t, c) : Math.min(t.length, c + 1));
    case "home": return at(t, 0);
    case "end": return at(t, t.length);
    case "backspace": {
      const from = m.platform ? 0 : m.alt ? wordLeft(t, c) : Math.max(0, c - 1);
      return at(t.slice(0, from) + t.slice(c), from);
    }
    case "delete": return at(t.slice(0, c) + t.slice(c + 1), c);
  }
  if (m.control && !m.alt && !m.platform) {
    switch (ev.key) {
      case "a": return at(t, 0);
      case "e": return at(t, t.length);
      case "b": return at(t, Math.max(0, c - 1));
      case "f": return at(t, Math.min(t.length, c + 1));
      case "d": return at(t.slice(0, c) + t.slice(c + 1), c);
      case "h": return at(t.slice(0, Math.max(0, c - 1)) + t.slice(c), Math.max(0, c - 1));
      case "k": return at(t.slice(0, c), c);
      case "u": return at(t.slice(c), 0);
      case "w": { const from = wordLeft(t, c); return at(t.slice(0, from) + t.slice(c), from); }
    }
    return null;
  }
  if (m.alt && !m.control && !m.platform) {
    if (ev.key === "b") return at(t, wordLeft(t, c));
    if (ev.key === "f") return at(t, wordRight(t, c));
    if (ev.key === "d") return at(t.slice(0, c) + t.slice(wordRight(t, c)), c);
  }
  if (m.platform && ev.key === "v") return insert(String(ev.clip ?? "").replace(/\s+/g, " "));
  if (ev.char && !m.control && !m.platform) return insert(ev.char);
  return null;
}
