// The ⌘K keys panel's letters: after ⌘K, one plain key runs a PLATO command, as C-x does in
// Emacs. The keys role (keyspage.js) draws them and asks leaderKey what a key does.
// No "herdr" import, so Node can test it.

/** How long ⌘K waits before it shows the panel: a fast letter never flashes it. */
export const PANEL_MS = 500;

/** Each row: the key, the name shown, and what it runs. cmd is a PLATO key for perform()
 *  (keys.js); action is a Herdr command. A lowercase move is the plain move, its capital
 *  the "1" move. HELP also takes "?". CANCEL is drawn but never typed: ctrl-g and Esc.
 *  RENAME TAB runs plato.rename-tab, so the route renames the agenda cursor's tab; its
 *  action is Herdr's command, whose key (F2) the panel shows.
 *  on: with the agenda open, the row acts on the cursor's space or tab, and names it. */
export const LEADER = [
  { group: "MOVE", key: "n", name: "NEXT", cmd: "next" },
  { group: "MOVE", key: "p", name: "BACK", cmd: "back" },
  { group: "MOVE", key: "N", name: "NEXT1", cmd: "next1" },
  { group: "MOVE", key: "P", name: "BACK1", cmd: "back1" },
  { group: "MOVE", key: "j", name: "JUMP", cmd: "jump" },
  { group: "VIEW", key: "a", name: "AGENDA", cmd: "agenda" },
  { group: "VIEW", key: "t", name: "TREE", cmd: "tree" },
  { group: "VIEW", key: "f", name: "FOCUS", cmd: "focus" },
  { group: "VIEW", key: "z", name: "ZOOM", action: "pane.zoom" },
  { group: "VIEW", key: "g", name: "GLOW", cmd: "glow" },
  { group: "SPACE AND TAB", key: "s", name: "SIGN-ON", cmd: "signon" },
  { group: "SPACE AND TAB", key: "l", name: "LAB", cmd: "lab", on: "space" },
  { group: "SPACE AND TAB", key: "e", name: "PURPOSE", cmd: "purpose", on: "tab" },
  { group: "SPACE AND TAB", key: "d", name: "DUE", cmd: "due", on: "space" },
  { group: "SPACE AND TAB", key: "k", name: "SIGN-OFF", cmd: "signoff", on: "space" },
  { group: "SPACE AND TAB", key: "u", name: "CLOSE UP", cmd: "closeup" },
  { group: "SPACE AND TAB", key: "r", name: "RENAME TAB", cmd: "renametab", action: "tab.rename", on: "tab" },
  { group: "MORE", key: "x", name: "TERM", cmd: "term" },
  { group: "MORE", key: "h", also: "?", name: "HELP", cmd: "help" },
  { group: "MORE", key: "⌃G", name: "CANCEL", cancel: true },
];

const GROUPS = ["MOVE", "VIEW", "SPACE AND TAB", "MORE"];

/** The rows by group, in the panel's four columns. */
export function leaderGroups() {
  return GROUPS.map((title) => ({ title, rows: LEADER.filter((r) => r.group === title) }));
}

const MOD_WORDS = { cmd: "cmd", ctrl: "ctrl", control: "ctrl", alt: "alt", shift: "shift" };
/** A key event's modifier as keys.json writes it; GPUI's name for ⌘ is the only other one. */
const modWord = (m) => MOD_WORDS[m] ?? (m === "function" ? null : "cmd");

/** A chord as one text, the same for a keys.json chord ("cmd-shift-g", any order) and a key
 *  event (key, modifiers): the modifiers sorted, then the key. */
export function chordOf(key, mods) {
  let parts;
  if (mods) parts = [...Object.keys(mods).filter((m) => mods[m] && modWord(m)).map(modWord), String(key)];
  else {
    const s = String(key);
    parts = s.endsWith("--") ? [...s.slice(0, -2).split("-"), "-"] : s.split("-");
    parts = [...parts.slice(0, -1).map((m) => MOD_WORDS[m] ?? m), parts.at(-1)];
  }
  const k = parts.pop().toLowerCase();
  return [...new Set(parts)].sort().concat(k).join("-");
}

/** What a key after ⌘K does: { run: row }, { cancel: true }, { undefined: text } (the key as
 *  typed, for the notice), { pass: true } for a chord Herdr binds (bound(chordOf(...))), which
 *  Herdr runs as usual, or null for a modifier pressed alone. Plain keys only: a key with
 *  ⌘, ctrl or alt held is never a panel key, and ctrl-g cancels. */
export function leaderKey(key, mods = {}, bound = () => false) {
  const k = String(key ?? "");
  if (mods[k] === true) return null; // a modifier alone: its key name is its flag
  if (k === "escape" || (mods.control && !mods.platform && !mods.alt && k === "g")) return { cancel: true };
  const typed = mods.shift && /^[a-z]$/.test(k) ? k.toUpperCase() : mods.shift && k === "/" ? "?" : k;
  if (mods.platform || mods.control || mods.alt) {
    if (bound(chordOf(k, mods))) return { pass: true };
    const held = `${mods.control ? "⌃" : ""}${mods.alt ? "⌥" : ""}${mods.shift ? "⇧" : ""}${mods.platform ? "⌘" : ""}`;
    return { undefined: held + k.toUpperCase() };
  }
  const row = LEADER.find((r) => !r.cancel && (r.key === typed || r.also === typed));
  return row ? { run: row } : { undefined: typed };
}
