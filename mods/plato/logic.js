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

/** Whether the layout node with this id is hidden. */
export function isHidden(tree, id) {
  if (!tree || typeof tree !== "object") return false;
  if (tree.id === id) return Boolean(tree.hidden);
  return (tree.children ?? []).some((c) => isHidden(c, id));
}

/** The layout node with this id, or null. */
export function findNode(tree, id) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.id === id) return tree;
  for (const c of tree.children ?? []) { const n = findNode(c, id); if (n) return n; }
  return null;
}

/** The keyset's padding, so its keys center under the terminal and not the whole window:
 *  the route's width on the left while the line shows (not in the map), and the right
 *  column's width unless FOCUS hides it. */
export function keysetPad(tree) {
  const px = (n) => (n && !n.hidden && typeof n.size?.px === "number" ? n.size.px : 0);
  const main = findNode(tree, "plato-main");
  const lineShown = !main || (main.active ?? "line-view") === "line-view";
  return { left: lineShown ? px(findNode(tree, "route")) : 0, right: px(findNode(tree, "right")) };
}

/** The route's width, and its width as a column of space squares in focus mode. */
export const ROUTE_PX = 260;
export const ROUTE_SLIM_PX = 56;

/** FOCUS: hide the right column and narrow the route, or undo both when focus is on.
 *  The route stays shown, or NEXT, BACK, NEXT1 and the map (its commands) would stop. */
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
  ["MAP", { cmd: "map" }, "Show every space as a column of tab cards."],
  ["JUMP", { cmd: "jump" }, "Type a tab code (c3) to go there."],
  ["ALL", { cmd: "all" }, "Show every space's tabs on the route."],
  ["PICKER", { action: "mod.open:picker" }, "Herdr's picker: find a tab by its name."],
  ["SIGN-ON", { cmd: "signon" }, "Open a new space."],
  ["SIGN-OFF", { cmd: "signoff" }, "Close this space, after a summary."],
  ["CLOSE UP", { cmd: "closeup" }, "Drop free letters; later spaces move up."],
  ["RENAME", { action: "space.rename" }, "Rename this space. Its letter stays."],
  ["RENAME TAB", { action: "tab.rename" }, "Rename this tab."],
  ["LAB", { cmd: "lab" }, "Add a tab to this space."],
  ["TERM", { cmd: "term" }, "Herdr's command palette: any command by name."],
  ["GLOW", { cmd: "glow" }, "Glow: orange, amber, green, white, nord, mocha."],
  ["FOCUS", { cmd: "focus" }, "Narrow the route and hide the right column."],
  ["HELP", { cmd: "help" }, "Show these keys."],
  ["CLOSE", { cmd: "close" }, "Close a PLATO dialog, else the tab."],
];

const WORD_ROWS = [
  ["letter", "", "Each space has a letter. It never moves on its own."],
  ["code", "", "A tab's address: c3 is tab 3 of space c. A split tab adds the pane: c3.2."],
  ["free letter", "", "The letter of a closed space. It stays dashed on the route until a sign-on fills it, or CLOSE UP removes it."],
  ["WAITING", "", "A space with an agent that needs you. SIGNALS, at the top right, lists them in NEXT1 order."],
  ["the route", "", "The dashed line shows where NEXT1 goes. The ▼ on the line shows where NEXT goes."],
  ["SIGNAL", "", "In FOCUS, a flashing line above the keys names another agent that needs you. Press NEXT1."],
  ["in the map", "", "Type a code to select its card, then Enter goes. The Space bar peeks at the tab under the ▶ cursor. LAB and SIGN-OFF act on its space. Esc closes the map."],
  ["JUMP", "", "A letter and Enter goes to that space's active tab. Esc, or a few seconds without a key, cancels."],
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

/** How long a dialog counts as open after its last sign of life (it reports each second). */
export const ALIVE_MS = 2500;

/** Whether a dialog record is a dialog that is still open: it has an id and reported
 *  recently. A dialog that closed without a word (a mod reload) leaves a stale record. */
export function dialogLive(openId, aliveAt, now) {
  return Boolean(openId) && aliveAt != null && now - aliveAt < ALIVE_MS;
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
