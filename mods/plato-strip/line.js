// PLATO, as pure functions: letters as slots, stops and stop codes,
// the NEXT / NEXT1 / BACK order, and the route's rows. No "herdr" import, so Node can
// test it (test/line.test.mjs). plato-strip, plato-sign, plato-nowat and plato-banner keep
// identical copies (a test checks them), because a mod
// cannot import from another mod's folder.

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Row heights and x positions of the route, in px, shared by drawing and tests. dotY and
 *  markY are the centers of a dot and a stop marker, down from the top of their row:
 *  the NEXT1 run ends there. dotUnder is the line under a dot row that the run comes in on.
 *  slotBox is the side of a space's square, which holds its letter. compact is the
 *  height of a one-line stop row (ALL: other spaces' stops), compactMarkY its
 *  lamp's center, compactUnder the line under it that the NEXT1 run comes in on;
 *  stopUnder is that line for a full two-line stop row. */
export const ROW = { slot: 34, dots: 22, stop: 50, hint: 20, dotX: 40, dotStep: 16, stopX: 40, dotY: 5, dotUnder: 16, markY: 18, stopUnder: 45, slotBox: 18, compact: 28, compactMarkY: 12, compactUnder: 25 };

/** How long a "was d" mark stays after closing up the line. */
export const MOVED_MS = 24 * 3600000;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Reconcile shared("plato.line") with Herdr's spaces (appendix C, rules C1 to C4).
 *  o: { now, pending, ready(machine) -> bool }. Returns { line, pending, changed }. */
export function reconcile(line, spaces, o) {
  const slots = (line?.slots ?? []).map((s) => ({ ...s }));
  let pending = o.pending ?? null;
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const known = new Set(slots.map((s) => s.space).filter(Boolean));

  // Occupied slots keep their space's latest name and folder, for `was` and the fallback.
  for (const slot of slots) {
    const s = slot.space && byId.get(slot.space);
    if (s) Object.assign(slot, { name: s.name, folder: s.folder ?? "", machine: s.machine ?? null });
  }
  const missing = slots.filter((slot) => slot.space && !byId.has(slot.space) && o.ready(slot.machine ?? null));

  const occupy = (slot, s) => {
    Object.assign(slot, { space: s.id, name: s.name, folder: s.folder ?? "", machine: s.machine ?? null, opened: o.now, due: slot.due ?? null });
    delete slot.closed;
    delete slot.was;
  };

  // C2: a space Plato doesn't know takes a letter.
  for (const s of spaces) {
    if (known.has(s.id)) continue;
    // Fallback if ids change across restarts: same folder as a slot whose space is gone.
    const moved = s.folder && missing.find((m) => m.folder === s.folder && (m.machine ?? null) === (s.machine ?? null));
    if (moved) {
      missing.splice(missing.indexOf(moved), 1);
      Object.assign(moved, { space: s.id, name: s.name });
      continue;
    }
    let slot = null;
    if (pending && pending.name === s.name) {
      const i = LETTERS.indexOf(pending.letter);
      while (i >= 0 && slots.length <= i) slots.push({ letter: LETTERS[slots.length], space: null, closed: o.now, was: "" });
      slot = slots[i] && !slots[i].space ? slots[i] : null;
      if (slot) slot.due = pending.due ?? null;
      pending = null;
    }
    slot ??= slots.find((x) => !x.space);
    if (!slot && slots.length < LETTERS.length) {
      slot = { letter: LETTERS[slots.length], space: null };
      slots.push(slot);
    }
    if (slot) occupy(slot, s);
  }

  // C3: a slot whose space no longer exists becomes free.
  for (const slot of missing) {
    const was = slot.name ?? "";
    for (const k of Object.keys(slot)) if (k !== "letter") delete slot[k];
    Object.assign(slot, { space: null, closed: o.now, was });
  }

  // C4: trim trailing free slots.
  while (slots.length && !slots[slots.length - 1].space) slots.pop();

  // "was d" marks from closing up the line last a day.
  for (const slot of slots) {
    if (slot.moved_at != null && o.now - slot.moved_at >= MOVED_MS) {
      delete slot.moved_from;
      delete slot.moved_at;
    }
  }

  const next = { version: 1, slots };
  const changed = !same(line, next);
  return { line: changed ? next : line, pending, changed };
}

/** The letter of a space, or null. */
export function letterOf(line, spaceId) {
  return line?.slots?.find((s) => s.space === spaceId)?.letter ?? null;
}

/** space.move calls (1-based index) that put this machine's spaces in letter order. */
export function spaceMoves(line, spaces) {
  const order = (s) => {
    const l = letterOf(line, s.id);
    return l ? LETTERS.indexOf(l) : LETTERS.length;
  };
  const cur = spaces.filter((s) => !s.machine).map((s) => s.id);
  const want = [...cur].sort((a, b) => order({ id: a }) - order({ id: b }));
  const moves = [];
  for (let i = 0; i < want.length; i++) {
    if (cur[i] === want[i]) continue;
    cur.splice(cur.indexOf(want[i]), 1);
    cur.splice(i, 0, want[i]);
    moves.push({ id: want[i], index: i + 1 });
  }
  return moves;
}

/** "c3", or "c3.2" for the second pane of a split tab. */
export function stopCode(letter, tabIndex, paneNo) {
  return `${letter ?? "?"}${tabIndex}${paneNo ? `.${paneNo}` : ""}`;
}

/** Every stop in line order: each tab of each occupied space (settled tabs left out),
 *  and each pane of a split tab. Free letters have none. */
export function stops(line, spaces, panes) {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const out = [];
  for (const slot of line?.slots ?? []) {
    const s = slot.space && byId.get(slot.space);
    if (!s) continue;
    for (const t of s.tabs ?? []) {
      if (t.settled) continue;
      const ps = panes.filter((p) => p.tab === t.id);
      const base = { letter: slot.letter, space: s.id, spaceName: s.name, tab: t.id, tabIndex: t.index, tabName: t.name, tabStatus: t.status ?? null };
      if (ps.length <= 1) {
        const p = ps[0];
        out.push({ ...base, code: stopCode(slot.letter, t.index), pane: p?.pane ?? null, terminal: p?.terminal ?? null, status: p?.status ?? t.status ?? null, program: programWord(p?.program), label: tabLabel(t, p) });
      } else {
        ps.forEach((p, k) => out.push({ ...base, code: stopCode(slot.letter, t.index, k + 1), pane: p.pane, terminal: p.terminal ?? null, status: p.status ?? null, program: programWord(p.program), label: tabLabel(t, p) }));
      }
    }
  }
  return out;
}

/** How many tabs these stops are on: the panes of a split tab count as one tab. */
export function tabCount(list) {
  return new Set(list.map((s) => s.tab)).size;
}

/** What BACK remembers for a stop: its pane, else its tab. */
export function stopKey(stop) {
  return stop ? stop.pane ?? stop.tab : null;
}

/** The stop you are at, from focused(). */
export function currentStop(list, focus) {
  if (!focus) return null;
  return list.find((s) => focus.pane && s.pane === focus.pane) ?? list.find((s) => s.tab === focus.tab) ?? null;
}

/** NEXT: the stop after this one in line order, wrapping. Null when there is nowhere else. */
export function nextStop(list, current) {
  if (!list.length) return null;
  const i = current ? list.findIndex((s) => stopKey(s) === stopKey(current)) : -1;
  const n = list[(i + 1) % list.length];
  return current && stopKey(n) === stopKey(current) ? null : n;
}

/** BACK: the stop before this one in line order, wrapping from the first to the last.
 *  NEXT's mirror. Null when there is nowhere else. */
export function prevStop(list, current) {
  if (!list.length) return null;
  const i = current ? list.findIndex((s) => stopKey(s) === stopKey(current)) : 0;
  const p = list[(Math.max(i, 0) - 1 + list.length) % list.length];
  return current && stopKey(p) === stopKey(current) ? null : p;
}

/** NEXT1's order: blocked agents longest waiting first (lowest seq), then done-but-unseen,
 *  oldest first. */
export function signalList(agents) {
  const by = (st) => agents.filter((a) => a.status === st).sort((a, b) => a.seq - b.seq);
  return [...by("blocked"), ...by("done")];
}

/** The agent NEXT1 goes to: the first of the signal list that is not the one you are at. */
export function next1Agent(agents, currentTerminal) {
  return signalList(agents).find((a) => a.address !== currentTerminal) ?? null;
}

/** The agents that need you, in NEXT1 order, without the one you are at: the banner's
 *  count, the route's WAITING tags and the signals agree with NEXT1. */
export function waitingFor(agents, currentTerminal) {
  return signalList(agents).filter((a) => a.address !== currentTerminal);
}

/** The letters of the spaces with an agent that needs you (not counting where you are). */
export function waitingLetters(agents, all, currentTerminal) {
  const out = new Set();
  for (const a of waitingFor(agents, currentTerminal)) {
    const s = all.find((x) => x.pane === a.pane);
    if (s?.letter) out.add(s.letter);
  }
  return out;
}

/** The NEXT1 readout: the code and the reason first, so a narrow route cuts only the names. */
export function next1Words(stop, agent) {
  if (!stop || !agent) return "nothing waiting";
  const why = agent.status === "blocked" ? "needs you" : agent.status === "done" ? "done" : agent.status;
  return `→ ${stop.code} ${why} · ${stop.spaceName} · ${stop.label}`;
}

/** Where the route's "NEXT1" label goes: on the target's row, at its right end, just left
 *  of the run's vertical (runX), where no space or stop text is. */
export function next1Label(run, runX) {
  if (!run) return null;
  return { left: runX - 48, top: run.y2 - 9 };
}

/** Where the ◀ that shows the NEXT1 run's direction goes, when the run ends at a dot: on its
 *  last line, halfway between the dot and the "NEXT1" label. Null if there is no room, or
 *  if the run ends at a stop marker (that end has its own ◀). */
export function next1Arrow(run, runX) {
  if (!run || run.rise == null) return null;
  const from = run.x2 + 8, to = runX - 48;
  return to - from < 24 ? null : { x: (from + to) / 2, y: run.y2 };
}

/** A stop row's lamp: its center (y) and its top edge. A full row has a 10 px lamp,
 *  a compact (ALL) row an 8 px one. */
export function markY(r) {
  return r.y + (r.compact ? ROW.compactMarkY : ROW.markY);
}
export function lampTop(r) {
  return markY(r) - (r.compact ? 4 : 5);
}

/** Where the route's ▼ for NEXT goes: at the end of the line into the target, its tip
 *  on the top edge (tip) of the target's marker. On the branch for a stop of this
 *  space, or on the main line for the next space's square. Null when NEXT wraps back
 *  up the line, or a key is missing. */
export function nextMark(rows, fromKey, toKey) {
  const i = rows.findIndex((r) => r.type === "stop" && stopKey(r.stop) === fromKey);
  if (i < 0 || toKey == null) return null;
  for (let j = i + 1; j < rows.length; j++) {
    const r = rows[j];
    if (r.type === "stop" && stopKey(r.stop) === toKey) return { on: "branch", tip: lampTop(r) };
    if (r.type === "dots" && r.stops.some((s) => stopKey(s) === toKey)) {
      const st = rows.slice(0, j).reverse().find((x) => x.type === "slot");
      return st ? { on: "main", tip: st.y + (ROW.slot - ROW.slotBox) / 2 } : null;
    }
  }
  return null;
}

/** For setAgentOrder: the signal list, then every other agent in model order. */
export function agentOrder(agents) {
  const sig = signalList(agents);
  const set = new Set(sig);
  return [...sig, ...agents.filter((a) => !set.has(a))].map((a) => a.address);
}

/** BACK's list: this stop first, no repeats, at most 20. The same array when unchanged. */
export function pushBack(list, key) {
  const l = list ?? [];
  if (l[0] === key) return l;
  return [key, ...l.filter((k) => k !== key)].slice(0, 20);
}

/** BACK: the most recent stop in the list that still exists and is not this one. */
export function backStop(list, all, current) {
  const cur = stopKey(current);
  for (const k of list ?? []) {
    if (k === cur) continue;
    const s = all.find((x) => stopKey(x) === k);
    if (s) return s;
  }
  return null;
}

/** The route, top to bottom: each space; under the current one its stops, under the
 *  others a row of dots; under a free slot a hint. Each row has y and h in px. */
export function routeRows(line, spaces, list, currentSpace, all = false) {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const rows = [];
  let y = 0;
  const add = (r) => { rows.push({ ...r, y }); y += r.h; };
  for (const slot of line?.slots ?? []) {
    const space = slot.space ? byId.get(slot.space) ?? null : null;
    add({ type: "slot", h: ROW.slot, slot, space });
    if (!slot.space) { add({ type: "free-hint", h: ROW.hint, slot }); continue; }
    if (!space) continue;
    const mine = list.filter((s) => s.space === space.id);
    if (space.id === currentSpace) for (const stop of mine) add({ type: "stop", h: ROW.stop, slot, stop });
    // ALL: the other spaces' stops as one-line rows instead of a row of dots.
    else if (all) for (const stop of mine) add({ type: "stop", h: ROW.compact, slot, stop, compact: true });
    else if (mine.length) add({ type: "dots", h: ROW.dots, slot, stops: mine });
  }
  return rows;
}

/** Where the NEXT1 run goes: from the middle of the current stop's row (y1) to the
 *  target, ending at its marker (x2). It comes in on a line under the target's row (y2:
 *  ROW.dotUnder, compactUnder or stopUnder), so it crosses no dot and no text, and rises
 *  from there to the bottom edge of the marker (rise). Null if either is not drawn as a
 *  stop row or a dot. */
export function next1Run(rows, fromKey, toKey) {
  const from = rows.find((r) => r.type === "stop" && stopKey(r.stop) === fromKey);
  if (!from) return null;
  for (const r of rows) {
    if (r.type === "stop" && stopKey(r.stop) === toKey) {
      // Come in on a line under the row and rise into its lamp, as for a dot, so the run never
      // crosses the row's text; the ◀ and the label sit on that line in small boxes (tight).
      const under = r.y + (r.compact ? ROW.compactUnder : ROW.stopUnder);
      return { y1: from.y + from.h / 2, y2: under, x2: ROW.stopX + 4, rise: markY(r) + (r.compact ? 4 : 5), tight: true };
    }
    if (r.type === "dots") {
      const k = r.stops.findIndex((s) => stopKey(s) === toKey);
      // Under the dot row, then up into the target dot: it crosses no other dot.
      if (k >= 0) return { y1: from.y + from.h / 2, y2: r.y + ROW.dotUnder, x2: ROW.dotX + k * ROW.dotStep, rise: r.y + ROW.dotY + 4 };
    }
  }
  return null;
}

/** A stop's name: the tab's name if someone named it, else its terminal's title, else
 *  its program ("zsh"). A shell that sets no title gets its terminal id (t3v) as one from
 *  Herdr; that counts as no title. */
export function tabLabel(tab, pane) {
  if (tab?.named) return tab.name;
  const title = (pane?.title ?? "").trim();
  if (title && title !== pane?.terminal) return title;
  return pane?.program?.name || "";
}

/** "claude" for an agent, the process name ("zsh", "htop") for a shell or unlisted program. */
export function programWord(program) {
  if (!program) return "";
  return program.key === "shell" || program.key === "program" ? program.name : program.key;
}

/** How long since `since` (ms): "now", "4m", "1h 02m", "1d 6h"; "" without a time. */
export function duration(since, now) {
  if (since == null) return "";
  const m = Math.floor((now - since) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ---- Sign-on and close up (appendix C) ----

/** The letters a sign-on can take: the first free slot (null if none) and the next letter
 *  after the last slot ("end of line"; null when all 26 are used). */
export function signOnLetters(line) {
  const slots = line?.slots ?? [];
  return {
    free: slots.find((s) => !s.space)?.letter ?? null,
    end: slots.length < LETTERS.length ? LETTERS[slots.length] : null,
  };
}

/** Close up the line: drop free slots and reletter the rest in order. A space that
 *  moves gets moved_from (its old letter) and moved_at, so views can show "was d". */
export function closeUp(line, now) {
  const slots = (line?.slots ?? []).filter((s) => s.space).map((s, i) => {
    const n = { ...s, letter: LETTERS[i] };
    if (n.letter !== s.letter) Object.assign(n, { moved_from: s.letter, moved_at: now });
    return n;
  });
  return { version: 1, slots };
}

/** A close-up asked for on sign-off ({space, at} in shared "plato.closeup"): "apply" once
 *  its space is gone, "wait" while it is closing, "drop" if it is still there after a minute. */
export function closeUpStep(req, spaces, now) {
  if (!req) return null;
  if (!req.space || !spaces.some((s) => s.id === req.space)) return "apply";
  return now - (req.at ?? 0) > 60000 ? "drop" : "wait";
}

// ---- Arrival and the last prompt sent (appendix H) ----

/** How long the arrival banner and the yellow strip stay. */
export const ARRIVAL_MS = 4000;

/** A label of a terminal (from terminals()), or null. */
export function labelOf(terms, address, key) {
  if (!address) return null;
  return terms.find((t) => t.address === address)?.labels?.[key] ?? null;
}

/** The last prompt sent to a terminal, from its plato.last and plato.last_at labels:
 *  { text, at } with at in ms (null if the time is missing or not a number), or null. */
export function lastSent(terms, address) {
  const text = labelOf(terms, address, "plato.last");
  const raw = labelOf(terms, address, "plato.last_at");
  const sec = raw != null && /^\d+$/.test(String(raw).trim()) ? Number(raw) : null;
  if (text == null && sec == null) return null;
  return { text: text ?? "", at: sec == null ? null : sec * 1000 };
}

/** The arrival record when the current stop changed from prev to cur, or null.
 *  lastAt is the raw plato.last_at label of cur's terminal now: a new prompt changes it. */
export function arrivalFor(prev, cur, now, lastAt) {
  if (!prev || !cur || stopKey(prev) === stopKey(cur)) return null;
  return {
    from: { code: prev.code, name: prev.spaceName, label: prev.label },
    to: { code: cur.code, name: cur.spaceName, label: cur.label, key: stopKey(cur), terminal: cur.terminal ?? null },
    at: now,
    last_at: lastAt ?? null,
  };
}

/** The arrival in words, for the banner: "▶ ARRIVED AT c3 moss · api from e1 plans". */
export function arrivalWords(a) {
  return `▶ ARRIVED AT ${a.to.code} ${a.to.name} · ${a.to.label} from ${a.from.code} ${a.from.name}`;
}

/** Whether an arrival still shows: less than 4 s old and no prompt sent since
 *  (lastAt is the raw plato.last_at label of its terminal now). */
export function arrivalLive(arrival, lastAt, now) {
  if (!arrival) return false;
  return now - arrival.at < ARRIVAL_MS && (lastAt ?? null) === (arrival.last_at ?? null);
}

/** Whether the stop with this key shows the arrival (the banner, the yellow strip). */
export function arrivalShown(arrival, key, lastAt, now) {
  return Boolean(arrival && key && arrival.to?.key === key && arrivalLive(arrival, lastAt, now));
}
