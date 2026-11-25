// Pure logic for the plato mod (keyset, HELP, FILES and the viewer of PLATO):
// no "herdr" import, so Node can test it (test/logic.test.mjs).

export function projectFolder(gitRoot, cwd, last) {
  return gitRoot || cwd || last || null;
}

/** The folder FILES follows: the focused cwd, else a terminal pane of the focused tab. */
export function notesCwd(focus, panes) {
  if (focus?.cwd) return focus.cwd;
  return panes.find((p) => p.tab === focus?.tab && p.cwd)?.cwd ?? null;
}

/** `ls -1Ap` output -> entries, folders first, by name; no dot files, no node_modules. */
export function parseListing(out) {
  return out.split("\n").filter(Boolean)
    .map((line) => ({ name: line.replace(/\/$/, ""), dir: line.endsWith("/") }))
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
    .sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
}

/** Flatten the open part of the folder tree. listings: relative dir ("" is the root) -> entries. */
export function folderRows(listings, open, dir = "", depth = 0) {
  const rows = [];
  for (const e of listings[dir] ?? []) {
    const path = dir ? `${dir}/${e.name}` : e.name;
    const isOpen = e.dir && open.has(path);
    rows.push({ path, name: e.name, depth, dir: e.dir, open: isOpen });
    if (isOpen) rows.push(...folderRows(listings, open, path, depth + 1));
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

/** Whether the layout node with this id is hidden. */
export function isHidden(layout, id) {
  if (!layout || typeof layout !== "object") return false;
  if (layout.id === id) return Boolean(layout.hidden);
  return (layout.children ?? []).some((c) => isHidden(c, id));
}

/** The layout node with this id, or null. */
export function findNode(layout, id) {
  if (!layout || typeof layout !== "object") return null;
  if (layout.id === id) return layout;
  for (const c of layout.children ?? []) { const n = findNode(c, id); if (n) return n; }
  return null;
}

/** The keyset's padding, so its keys center under the terminal and not the whole window:
 *  the route's width on the left while the line shows (not over REVIEW), and the right
 *  column's width unless FOCUS hides it. */
export function keysetPad(layout) {
  const px = (n) => (n && !n.hidden && typeof n.size?.px === "number" ? n.size.px : 0);
  const main = findNode(layout, "plato-main");
  const lineShown = !main || (main.active ?? "line-view") === "line-view";
  return { left: lineShown ? px(findNode(layout, "route")) : 0, right: px(findNode(layout, "right")) };
}

/** The route's width, and its width as a column of space squares in focus mode. */
export const ROUTE_PX = 260;
export const ROUTE_SLIM_PX = 56;

/** FOCUS: hide the right column and narrow the route, or undo both when focus is on.
 *  The route stays shown, or NEXT, BACK, NEXT1 and REVIEW (its commands) would stop. */
export function focusCommands(focusOn) {
  const name = focusOn ? "layout.show" : "layout.hide";
  return [[name, { id: "right" }], ["layout.resize", { id: "route", px: focusOn ? ROUTE_PX : ROUTE_SLIM_PX }]];
}

/** The SIGNAL line in focus mode: the first blocked agent other than the one you are on,
 *  named by its stop ("f1 meridian · docs needs you"), and how many more wait. `all`
 *  is stops() from line.js. Null outside focus mode or when nobody waits. */
export function pageFor(agents, current, focusOn, all = []) {
  if (!focusOn) return null;
  // In NEXT1's order (longest waiting first), so the line names where NEXT1 goes.
  const waiting = agents.filter((a) => a.status === "blocked" && a.address !== current).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  if (!waiting.length) return null;
  const a = waiting[0];
  const s = all.find((x) => x.pane && x.pane === a.pane);
  const text = s ? `${s.code} ${s.spaceName} · ${s.label} needs you` : `${a.space_name ?? ""} needs you`;
  return { address: a.address, text, more: waiting.length - 1 };
}

/** HELP, in two screens shown one at a time. A row is [name, key, text]. The key is
 *  { cmd } for a PLATO command (its binding in layout:plato), { action } for a Herdr
 *  command (its binding in any section), or "" for none. */
const KEY_ROWS = [
  ["NEXT", { cmd: "next" }, "Go to the next tab on the line."],
  ["BACK", { cmd: "back" }, "Go to the tab before this one on the line."],
  ["NEXT1", { cmd: "next1" }, "Go to the agent that has waited longest for you."],
  ["BACK1", { cmd: "back1" }, "Return to where you were before."],
  ["REVIEW", { cmd: "review" }, "Show the day: results, posts and facts."],
  ["JUMP", { cmd: "jump" }, "Find a tab by its code, name or purpose."],
  ["TREE", { cmd: "tree" }, "Show every space's tabs on the route, as a tree."],
  ["PICKER", { action: "mod.open:picker" }, "Herdr's picker: find a tab by its name."],
  ["SIGN-ON", { cmd: "signon" }, "Open a new space."],
  ["SIGN-OFF", { cmd: "signoff" }, "Close this space, after a summary."],
  ["CLOSE UP", { cmd: "closeup" }, "Drop free letters; later spaces move up."],
  ["RENAME", { action: "space.rename" }, "Rename this space. Its letter stays."],
  ["RENAME TAB", { action: "tab.rename" }, "Rename this tab."],
  ["LAB", { cmd: "lab" }, "Add a tab to this space."],
  ["PURPOSE", { cmd: "purpose" }, "Set what this tab is for."],
  ["DUE", { cmd: "due" }, "Set or clear this space's due date."],
  ["FOLDER", { cmd: "folder" }, "Open this tab's folder in the file manager."],
  ["TERM", { cmd: "term" }, "Herdr's command palette: any command by name."],
  ["GLOW", { cmd: "glow" }, "Step the glow: four modern, four classic."],
  ["FOCUS", { cmd: "focus" }, "Narrow the route and hide the right column."],
  ["HELP", { cmd: "help" }, "Show these keys."],
  ["KEYS", { cmd: "keys" }, "Then one letter runs any PLATO command."],
  ["CLOSE", { cmd: "close" }, "Close a PLATO dialog, else the tab."],
  ["MOUSE", "", "Right-click: a menu. Hover: a tab's detail."],
];

const WORD_ROWS = [
  ["letter", "", "Each space has a letter. It never moves on its own."],
  ["code", "", "A tab's address: c3 is tab 3 of space c. A split tab adds the pane: c3.2."],
  ["free letter", "", "The letter of a closed space. It stays dashed on the route until a sign-on fills it, or CLOSE UP removes it."],
  ["WAITING", "", "A space with an agent that needs you. SIGNALS, at the top right, lists them in NEXT1 order."],
  ["the route", "", "The dashed line shows where NEXT1 goes. The ▼ on the line shows where NEXT goes."],
  ["SIGNAL", "", "In FOCUS, a flashing line above the keys names another agent that needs you. Press NEXT1."],
  ["in REVIEW", "", "Tab switches between DAY and COMMENTS. The arrows pick a result on DAY or a comment on COMMENTS, and Enter goes to its tab. The Space bar opens LOOK for that tab before you go. c copies the pick, and e exports the day to a Markdown file. ← and → show another day. Esc closes REVIEW."],
  ["JUMP", "", "Type a code, a name, a purpose or a folder. Enter goes to the lit row. Tab shows one group. Esc closes."],
  ["purpose", "", "What a tab is for, on its strip, in LOOK and in JUMP. Yours (set with PURPOSE) comes first, then the agent's, then the session's first prompt."],
];

/** HELP's screens, in order. */
export function helpScreens() {
  return [{ name: "KEYS", rows: KEY_ROWS }, { name: "WORDS", rows: WORD_ROWS }];
}

/** A key on a HELP screen: the screen to show (i, 0-based), { close }, or null for a key
 *  HELP does not use. → or Enter goes on, ← back, a number straight to that screen. */
export function helpKey(i, key, n) {
  if (key === "escape") return { close: true };
  if (key === "right" || key === "enter") return { i: Math.min(i + 1, n - 1) };
  if (key === "left") return { i: Math.max(i - 1, 0) };
  if (/^[1-9]$/.test(key) && Number(key) <= n) return { i: Number(key) - 1 };
  return null;
}

/** The right-click menu of a space (its square or name on the route):
 *  [{ id, name, key }], each item a PLATO key that already exists. key is { cmd }
 *  for a PLATO command, { action } for a Herdr command, or { text } for a plain key. A free
 *  letter offers SIGN-ON there. CLOSE UP shows only while the line has free letters. */
export function spaceMenu({ free, freeLetters }) {
  const items = free
    ? [{ id: "sign-on", name: "SIGN-ON here", key: { cmd: "signon" } }]
    : [
      { id: "rename", name: "RENAME", key: { action: "space.rename" } },
      { id: "lab", name: "LAB", key: { cmd: "lab" } },
      { id: "due", name: "SET DUE…", key: { cmd: "due" } },
      { id: "sign-off", name: "SIGN-OFF", key: { cmd: "signoff" } },
    ];
  if (freeLetters > 0) items.push({ id: "close-up", name: "CLOSE UP", key: { cmd: "closeup" } });
  return items;
}

/** The right-click menu of a tab (a route row or dot). GO is left out where you already are. */
export function tabMenu({ current }) {
  const items = [];
  if (!current) items.push({ id: "go", name: "GO", key: { text: "↩" } });
  items.push({ id: "look", name: "LOOK", key: { text: "" } });
  items.push({ id: "rename-tab", name: "RENAME TAB", key: { action: "tab.rename" } });
  items.push({ id: "purpose", name: "SET PURPOSE…", key: { cmd: "purpose" } });
  items.push({ id: "folder", name: "FOLDER", key: { cmd: "folder" } });
  return items;
}

/** The command that opens a folder in the file manager of the OS (as Herdr's window().platform
 *  names it): Finder on macOS, Explorer on Windows, the desktop's default (xdg-open) elsewhere. */
export function folderOpener(os) {
  return os === "macos" ? "open" : os === "windows" ? "explorer" : "xdg-open";
}

/** Enter belongs to a dialog unless cmd is held: the cmd-enter chords are layout keys (NEXT
 *  and BACK), which the route handles or hands to a sign dialog. A dialog that acted
 *  on them too closed or went, and then the route moved again. */
export function ownEnter(mods) {
  return !mods?.platform;
}

/** The route's moves, which wait while LOOK, JUMP, HELP or a right-click menu is open, so a
 *  key never moves you behind a dialog. open: the names of the dialogs open now. */
const MOVES = ["next", "back", "next1", "back1"];
export function moveHeld(c, open) {
  return MOVES.includes(c) && open.length > 0;
}

/** How often an open dialog reports its sign of life, and how long it counts as open after
 *  the last one. Herdr closes a dialog on Esc without telling the mod, so REVIEW takes the
 *  keyboard back only once the dialog counts as closed: keys before that are lost. Short, but
 *  room for two missed beats, so a slow frame never closes an open dialog. */
export const BEAT_MS = 250;
export const ALIVE_MS = 750;

/** Whether a dialog record is a dialog that is still open: it has an id and reported
 *  recently. A dialog that closed without a word (a mod reload) leaves a stale record. */
export function dialogLive(openId, aliveAt, now) {
  return Boolean(openId) && aliveAt != null && now - aliveAt < ALIVE_MS;
}

/** A sign dialog's record ({ id, page, ... } in plato.dialog.sign) while that dialog reports
 *  alive, else null: a record left by a dialog that closed without a word is no dialog. */
export function liveRecord(record, aliveAt, now) {
  return record && dialogLive(record.id, aliveAt, now) ? record : null;
}

/** PLATO dialogs are toggles: with the dialog open, the key closes it; with no dialog or
 *  only a stale record, the key opens it. */
export function dialogAction(openId, aliveAt, now) {
  return dialogLive(openId, aliveAt, now) ? { close: openId } : { open: true };
}

/** CLOSE (cmd-w in PLATO): the open PLATO dialogs to close; with none open, close the tab
 *  as usual. dialogs: [{ name, id, aliveAt }]. A stale record does not count as open. */
export function closeAction(dialogs, now) {
  const open = (dialogs ?? []).filter((d) => dialogLive(d.id, d.aliveAt, now)).map((d) => [d.name, d.id]);
  return open.length ? { close: open } : { tab: true };
}

/** How long the banner shows a notice, as long as the glow's name stays bright. */
export const NOTICE_MS = 2000;

/** A notice's text while it is new ({ text, at } in plato.notice), else null. */
export function noticeLive(notice, now) {
  return notice?.text && now - notice.at < NOTICE_MS ? notice.text : null;
}

/** Whether the banner should clear a notice: its time is over. */
export function noticeStale(notice, now) {
  return Boolean(notice) && !noticeLive(notice, now);
}

/** Whether the keys panel closed without running a row (Esc, ctrl-g, an undefined key, a
 *  click beside it) since REVIEW saw it open: then REVIEW takes the keyboard back.
 *  back: shared plato.keys.back { at }. A row may open a dialog, so then it does not. */
export function keysGaveBack(back, since) {
  return Boolean(back) && back.at >= since;
}
