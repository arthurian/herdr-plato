// Pure PLATO logic: no "herdr" import, so Node can test it (test/logic.test.mjs).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** One month in the layout of Unix cal. month is 0-11; today is {y, m, d} or null. */
export function calMonth(year, month, today) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const isThis = today && today.y === year && today.m === month;
  return { title: `${MONTHS[month]} ${year}`, header: "Su Mo Tu We Th Fr Sa", weeks, today: isThis ? today.d : null };
}

const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };

export function statusWord(status) {
  return WORDS[status] ?? "";
}

export function spaceLetter(i) {
  return i >= 0 && i < 26 ? String.fromCharCode(97 + i) : null;
}

export function letterIndex(key) {
  return typeof key === "string" && /^[a-z]$/.test(key) ? key.charCodeAt(0) - 97 : -1;
}

/** The next agent that needs the person: blocked first, then done, in list order after current, wrapping. */
export function pickNext(agents, current) {
  const n = agents.length;
  const start = agents.findIndex((a) => a.address === current);
  const last = start >= 0 ? n - 1 : n; // never the current agent
  for (const status of ["blocked", "done"]) {
    for (let k = 1; k <= last; k++) {
      const a = agents[(start + k + n) % n];
      if (a.status === status) return a.address;
    }
  }
  return null;
}

export function rowTitle(agent) {
  const t = (agent.title ?? "").trim();
  return t || agent.program?.name || "";
}

export function projectFolder(gitRoot, cwd, last) {
  return gitRoot || cwd || last || null;
}

/** The folder NOTES follows: the focused cwd, else a terminal pane of the focused tab. */
export function notesCwd(focus, panes) {
  if (focus?.cwd) return focus.cwd;
  return panes.find((p) => p.tab === focus?.tab && p.cwd)?.cwd ?? null;
}

/** The command BACK runs for a saved terminal address. */
export function backAction(target, agents, panes) {
  if (target && agents.some((a) => a.address === target)) return ["agent.focus", { terminal: target }];
  const pane = target ? panes.find((p) => p.terminal === target)?.pane : null;
  if (pane) return ["pane.focus", { pane }];
  return ["agent.prev", {}];
}

/** A terminal pane in the active tab of a space, to give the keyboard back to. */
export function paneInSpace(space, panes) {
  const tab = space?.tabs?.find((t) => t.active);
  return panes.find((p) => p.tab === tab?.id && p.terminal)?.pane ?? null;
}

/** `ls -1Ap` output -> entries, folders first, by name; no dot files, no node_modules. */
export function parseListing(out) {
  return out.split("\n").filter(Boolean)
    .map((line) => ({ name: line.replace(/\/$/, ""), dir: line.endsWith("/") }))
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
    .sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
}

/** Flatten the open part of the tree. listings: relative dir ("" is the root) -> entries. */
export function treeRows(listings, open, dir = "", depth = 0) {
  const rows = [];
  for (const e of listings[dir] ?? []) {
    const path = dir ? `${dir}/${e.name}` : e.name;
    const isOpen = e.dir && open.has(path);
    rows.push({ path, name: e.name, depth, dir: e.dir, open: isOpen });
    if (isOpen) rows.push(...treeRows(listings, open, path, depth + 1));
  }
  return rows;
}

/** How the viewer shows a file: rendered markdown, plain text, or not at all. */
export function viewerKind(path, text) {
  if (text === null || text === undefined || text.includes("\u0000")) return "binary";
  return path.endsWith(".md") ? "markdown" : "text";
}

/** The shown folders (relative, "" is the root) that a watchFolder batch touched. */
export function dirsToRefresh(paths, root, shown) {
  if (paths.includes(root)) return [...shown];
  const hit = new Set();
  for (const p of paths) {
    if (!p.startsWith(root + "/")) continue;
    const rel = p.slice(root.length + 1);
    const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    if (shown.has(parent)) hit.add(parent);
  }
  return [...hit];
}
/** What a letter in the index runs: select that space, then give the keyboard to a
 *  terminal in that space. Never the focused pane: it still belongs to the old space,
 *  and focusing it switches straight back. */
export function letterCommands(key, spaces, panes) {
  return spaceCommands(spaces[letterIndex(key)], panes);
}

/** Select a space and give the keyboard to a terminal in it. */
export function spaceCommands(s, panes) {
  if (!s) return [];
  const pane = paneInSpace(s, panes);
  return pane ? [["space.select", { id: s.id }], ["pane.focus", { pane }]] : [["space.select", { id: s.id }]];
}
/** The CAL panel height in px for a month with this many weeks (rows of 19 px). */
export function calHeight(weeks) {
  return 172 + (weeks - 5) * 19;
}
/** NEXT and BACK: the terminal pane after (dir 1) or before (dir -1) current in this
 *  space, tabs in order, wrapping. Mod panes are skipped. */
export function cyclePane(space, panes, current, dir) {
  const list = (space?.tabs ?? []).flatMap((t) => panes.filter((p) => p.tab === t.id && p.terminal).map((p) => p.pane));
  if (!list.length) return null;
  const i = list.indexOf(current);
  if (i < 0) return dir > 0 ? list[0] : list[list.length - 1];
  return list[(i + dir + list.length) % list.length];
}
/** A shell's line: its program and the last part of its folder ("zsh · proj"). */
function shellTitle(p) {
  const name = p.program?.name ?? "shell";
  const dir = (p.cwd ?? "").replace(/\/+$/, "").split("/").pop();
  return dir ? `${name} · ${dir}` : name;
}

/** Talkomatic rows: every terminal pane of the space, tabs in order (the NEXT order).
 *  Agents show their status word; shells show "shell". */
export function talkRows(space, panes, agents) {
  const byAddress = new Map(agents.map((a) => [a.address, a]));
  const tabs = new Map((space?.tabs ?? []).map((t) => [t.id, t]));
  return (space?.tabs ?? []).flatMap((t) => panes.filter((p) => p.tab === t.id && p.terminal)).map((p) => {
    const a = byAddress.get(p.terminal);
    return {
      pane: p.pane,
      terminal: p.terminal,
      agent: Boolean(a),
      word: a ? statusWord(a.status) : "shell",
      status: a ? a.status : null,
      title: a ? rowTitle(a) : shellTitle(p),
      focused: Boolean(a ? a.focused : p.focused),
      peek: !(a ? a.focused : p.focused), // MONITOR: look at any terminal but the one you are on
      tab: p.tab,
      tabName: tabs.get(p.tab)?.named ? tabs.get(p.tab).name : null,
    };
  });
}
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** DATA paste: clipboard text added to the line, with every run of spaces,
 *  tabs and line breaks turned into one space. */
export function pasteText(text, clip) {
  return clip ? text + clip.replace(/\s+/g, " ") : text;
}
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
    // readline / Emacs keys
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
    // readline word keys; on macOS Option also types a character, which is ignored here
    if (ev.key === "b") return at(t, wordLeft(t, c));
    if (ev.key === "f") return at(t, wordRight(t, c));
    if (ev.key === "d") return at(t.slice(0, c) + t.slice(wordRight(t, c)), c);
  }
  if (m.platform && ev.key === "v") return insert(pasteText("", ev.clip));
  if (ev.char && !m.control && !m.platform) return insert(ev.char);
  return null;
}
export const AMBER = "#ffb000";

/** The GLOW rotation: each theme's accent color and its name, in order. */
export const GLOWS = [
  ["#ff8a1f", "plato"],
  [AMBER, "plato-amber"],
  ["#4fd06a", "plato-green"],
  ["#dcdcd2", "plato-white"],
];

/** The theme the glow toggle switches to, from the current accent color. */
export function nextGlow(accent) {
  const i = GLOWS.findIndex(([c]) => c === String(accent ?? "").toLowerCase());
  return GLOWS[(Math.max(i, 0) + 1) % GLOWS.length][1];
}
/** Whether the layout node with this id is hidden. */
export function isHidden(tree, id) {
  if (!tree || typeof tree !== "object") return false;
  if (tree.id === id) return Boolean(tree.hidden);
  return (tree.children ?? []).some((c) => isHidden(c, id));
}

/** FOCUS: hide both side columns, or show them again when focus is on. */
export function focusCommands(focusOn) {
  const name = focusOn ? "layout.show" : "layout.hide";
  return [[name, { id: "left" }], [name, { id: "right" }]];
}
/** INDEX keys while choosing: ctrl-n / ctrl-p and the arrows move the highlight
 *  (wrapping), Enter goes to it. Returns {hi}, {go} or null. */
export function indexNav(ev, hi, n) {
  if (!n) return null;
  const m = ev.mods ?? {};
  const down = ev.key === "down" || (m.control && ev.key === "n");
  const up = ev.key === "up" || (m.control && ev.key === "p");
  if (down) return { hi: (hi + 1) % n };
  if (up) return { hi: (hi - 1 + n) % n };
  if (ev.key === "enter") return { go: hi };
  return null;
}
/** The focus-mode page, like a term-talk page: the first blocked agent other than the
 *  one you are on, and how many more wait. Null outside focus mode or when nobody waits. */
export function pageFor(agents, current, focusOn) {
  if (!focusOn) return null;
  const waiting = agents.filter((a) => a.status === "blocked" && a.address !== current);
  if (!waiting.length) return null;
  const a = waiting[0];
  return { address: a.address, text: `${a.space_name} · ${rowTitle(a)} needs you`, more: waiting.length - 1 };
}
const KEY_ROWS = [
  ["NEXT", { cmd: "next" }, "Press NEXT to go to the next shell or agent in this lesson."],
  ["BACK", { cmd: "back" }, "Press BACK to go to the one before."],
  ["NEXT1", { cmd: "next1" }, "Press NEXT1 to go to the next agent that needs you."],
  ["BACK1", { cmd: "back1" }, "Press BACK1 to return to where you were before NEXT1."],
  ["HELP", { cmd: "help" }, "Press HELP to see the keys for where you are."],
  ["TERM", { cmd: "term" }, "Press TERM and type the name of any command."],
  ["LAB", { cmd: "lab" }, "Press LAB to start a new terminal or agent."],
  ["DATA", { cmd: "data" }, "Press DATA for a checkpoint: goal, worked, noticed, next."],
  ["FOCUS", { cmd: "focus" }, "Press FOCUS to hide or show the side columns."],
  ["INDEX", { cmd: "index" }, "Press INDEX, then a letter, to go to that lesson."],
  ["EDIT", { cmd: "edit" }, "Press EDIT to rename this lesson."],
  ["EDIT TAB", { cmd: "edittab" }, "Press EDIT TAB to rename this tab (page)."],
  ["CLOSE", { cmd: "close" }, "Press CLOSE to close a PLATO dialog or peek, else the tab."],
];

const PAGES = {
  classroom: {
    title: "HELP · the PLATO keys",
    rows: [
      ...KEY_ROWS,
      ["GLOW", { cmd: "glow" }, "Press GLOW, or click PLATO, to step the glow: orange, amber, green, white."],
      ["MONITOR", { cmd: "monitor" }, "Press MONITOR, then a row number, to look at that terminal."],
    ],
  },
  focus: {
    title: "HELP · focus mode",
    rows: [
      ...KEY_ROWS.filter((r) => ["NEXT", "BACK", "NEXT1", "BACK1", "DATA"].includes(r[0])),
      ["INDEX", { cmd: "index" }, "Press INDEX to choose a lesson in a dialog."],
      ["MONITOR", { cmd: "monitor" }, "Press MONITOR to choose a terminal to look at."],
      ["FOCUS", { cmd: "focus" }, "Press FOCUS to bring the side columns back."],
      ["PAGE", "", "A flashing PAGE line above the keys means another agent needs you. Press NEXT1."],
    ],
  },
  index: {
    title: "HELP · INDEX",
    rows: [
      ["letter", "", "Go to that lesson at once."],
      ["ctrl-n / ↓", "", "Move the highlight to the next lesson."],
      ["ctrl-p / ↑", "", "Move the highlight to the lesson before."],
      ["Enter", "", "Go to the highlighted lesson."],
      ["EDIT", { cmd: "edit" }, "Then a letter, or Enter for the highlighted lesson, to rename it."],
      ["Esc", "", "Leave the index without a change."],
    ],
  },
  monitor: {
    title: "HELP · MONITOR",
    rows: [
      ["1 to 9", "", "Look at the terminal on that TALKOMATIC row. In that view, NEXT goes to it; MONITOR or CLOSE closes it."],
      ["EDIT", { cmd: "edit" }, "Then a row number, to rename that row's tab (page)."],
      ["Esc", "", "Leave without looking."],
      ["click", "", "Click monitor on a row, or right-click the row, to do the same."],
    ],
  },
  data: {
    title: "HELP · DATA",
    rows: [
      ["Tab / ↓", "", "Go to the next line: GOAL, WORKED, NOTICED, NEXT, FILE."],
      ["shift-Tab / ↑", "", "Go to the line before."],
      ["Enter", "", "Save: a changed goal, and a numbered response."],
      ["Esc", "", "Leave without saving."],
      ["empty lines", "", "Fine. Fill only NEXT for a quick note."],
      ["FILE", "", "A file for a Markdown copy of each checkpoint. Empty keeps notes in Herdr only."],
      ["cmd-v", "", "Paste. Line breaks become spaces."],
      ["ctrl-a / ctrl-e", "", "Go to the start or the end of the line."],
      ["ctrl-k / ctrl-u", "", "Delete to the end, or to the start."],
      ["ctrl-w / alt-d", "", "Delete the word before, or after."],
    ],
  },
  edit: {
    title: "HELP · EDIT",
    rows: [
      ["Enter", "", "Save the new name."],
      ["Esc", "", "Leave the name as it was."],
      ["empty", "", "Save an empty name to get the automatic name back."],
      ["ctrl-a / ctrl-e", "", "The same editing keys as DATA work here."],
    ],
  },
};

/** The HELP page for a place: classroom, focus, index or data. */
export function helpPage(place) {
  return PAGES[place] ?? PAGES.classroom;
}

const PLACE_MS = 60000;

/** Where HELP was pressed: a place that INDEX or DATA stored in the last minute,
 *  else focus mode or the classroom. */
export function currentPlace(stored, now, focusOn) {
  if (stored && now - stored.at < PLACE_MS) return stored.place;
  return focusOn ? "focus" : "classroom";
}
/** MONITOR, then a row number (1-9): the terminal of that TALKOMATIC row, if it is
 *  not the one you are on. */
export function monitorTarget(key, rows) {
  if (!/^[1-9]$/.test(key)) return null;
  const r = rows[Number(key) - 1];
  return r && r.peek ? r.terminal : null;
}
/** PLATO dialogs are toggles: with the dialog open (its overlay id), the key closes it. */
export function dialogAction(openId) {
  return openId ? { close: openId } : { open: true };
}
/** EDIT: the command that renames a space or a tab. An empty name gives back the
 *  automatic one (a space after its folder, a tab its number). */
export function renameCommand(kind, id, text) {
  return [kind === "tab" ? "tab.rename" : "space.rename", { id, name: String(text ?? "").trim() }];
}

/** EDIT starts from the name you gave, or an empty line for an automatic name. */
export function editStart(thing) {
  const text = thing && thing.named ? thing.name : "";
  return { text, cursor: text.length };
}
/** EDIT TAB: the TALKOMATIC row of the tab you are in (the focused row, else the
 *  first row of the active tab). */
export function currentTabRow(rows, activeTab) {
  return rows.find((r) => r.focused) ?? rows.find((r) => r.tab === activeTab) ?? null;
}
/** A lesson's notesfile keeps its latest 63 responses, the limit of Woolley's Notes. */
export const NOTES_MAX = 63;

const emptyFile = () => ({ goal: null, responses: [] });

/** Add a checkpoint (worked, noticed, next) as the next numbered response.
 *  A checkpoint with every line empty adds nothing. */
export function checkpointAdd(file, fields, at) {
  const f = file ?? emptyFile();
  const c = { worked: clean(fields.worked), noticed: clean(fields.noticed), next: clean(fields.next) };
  if (!c.worked && !c.noticed && !c.next) return f;
  const last = f.responses[f.responses.length - 1];
  const r = { n: (last?.n ?? 0) + 1, at, ...c };
  return { ...f, responses: [...f.responses, r].slice(-NOTES_MAX) };
}

/** Set the lesson's goal (the base note). An empty text clears it. */
export function goalSet(file, text, at) {
  const f = file ?? emptyFile();
  const t = clean(text);
  return { ...f, goal: t ? { text: t, at } : null };
}

/** The newest non-empty Next of a notesfile. */
export function latestNext(file) {
  const r = [...(file?.responses ?? [])].reverse().find((x) => clean(x.next));
  return r ? r.next : null;
}

const stamp = (at) => {
  const d = new Date(at);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** The notes-file block for one response; empty lines are left out. */
export function checkpointBlock(spaceName, n, at, fields) {
  const lines = [["Worked", fields.worked], ["Noticed", fields.noticed], ["Next", fields.next]]
    .filter(([, v]) => clean(v)).map(([k, v]) => `- ${k}: ${clean(v)}\n`).join("");
  return `\n### ${spaceName} · #${n} · ${stamp(at)}\n${lines}`;
}

/** The notes-file block for a new goal. */
export function goalBlock(spaceName, at, text) {
  return `\n### ${spaceName} · goal · ${stamp(at)}\n- Goal: ${clean(text)}\n`;
}

/** Tab and Shift-Tab between the DATA lines, wrapping. */
export function nextField(i, n, back) {
  return (i + (back ? -1 : 1) + n) % n;
}
/** The CAL dialog: the month before, the month and the month after, shifted by offset months. */
export function monthsAround(year, month, offset) {
  return [-1, 0, 1].map((d) => {
    const t = year * 12 + month + offset + d;
    return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
  });
}
/** CLOSE (cmd-w in PLATO): the open PLATO dialogs to close, from their shared
 *  "plato.dialog.<name>" records; with none open, close the tab as usual. */
export function closeAction(records) {
  const open = Object.entries(records ?? {})
    .filter(([k, v]) => k.startsWith("plato.dialog.") && typeof v === "string" && v)
    .map(([k, v]) => [k.slice("plato.dialog.".length), v]);
  return open.length ? { close: open } : { tab: true };
}
/** GO TO (and NEXT in a MONITOR view): focus that terminal, an agent by its address,
 *  a shell by its pane. Null when the terminal is gone. */
export function goToCommand(terminal, agents, panes) {
  if (!terminal) return null;
  if (agents.some((a) => a.address === terminal)) return ["agent.focus", { terminal }];
  const pane = panes.find((p) => p.terminal === terminal)?.pane;
  return pane ? ["pane.focus", { pane }] : null;
}
/** DATA's copy file from the FILE setting: null for no file, else an absolute
 *  path. "~" and a relative path both start at the home folder. */
export function notesFilePath(setting, home) {
  const t = String(setting ?? "").trim();
  if (!t) return null;
  if (t === "~" || t.startsWith("~/")) return home + t.slice(1);
  return t.startsWith("/") ? t : `${home}/${t}`;
}
