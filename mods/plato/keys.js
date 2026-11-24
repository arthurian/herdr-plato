// The PLATO keys: what each one does and its binding.
// The keyset role runs them; the help role lists them.

import { run, shared, setShared, openOverlay, closeOverlay, keys, layout, spaces, panes } from "herdr";
import { isHidden, focusCommands, dialogAction, dialogLive, closeAction, BEAT_MS } from "./logic.js";
import { commandFor } from "./commands.js";
import { dialogKey, aliveKey, viewerKey } from "./shared.js";
import { shortcut } from "./look.js";

/** The boxed keys along the bottom, in three groups from left to right: the moves (JUMP last,
 *  the move to anywhere), the views, then LAB, TERM and HELP, with HELP at the far right. */
export const KEYS = [
  { name: "NEXT", cmd: "next" },
  { name: "BACK", cmd: "back" },
  { name: "NEXT1", cmd: "next1" },
  { name: "BACK1", cmd: "back1" },
  { name: "JUMP", cmd: "jump" },
  { name: "AGENDA", cmd: "agenda" },
  { name: "FOCUS", cmd: "focus" },
  { name: "LAB", cmd: "lab" },
  { name: "TERM", cmd: "term" },
  { name: "HELP", cmd: "help" },
];

/** The binding shown for a PLATO key, from the layout:plato section. */
export function bindingFor(cmd) {
  const action = commandFor(cmd);
  return keys().find((k) => k.section === "layout:plato" && k.action === action)?.keys ?? "";
}

/** The binding of a Herdr command, from any section of keys.json. */
export function bindingOfAction(action) {
  return keys().find((k) => k.action === action)?.keys ?? "";
}

/** A key as HELP and the menus show it: { cmd } a PLATO key, { action } a Herdr command,
 *  { text } a plain key such as "↩". */
export function keyText(k) {
  return k?.cmd ? shortcut(bindingFor(k.cmd)) : k?.action ? shortcut(bindingOfAction(k.action)) : k?.text ?? "";
}

/** Open a PLATO dialog, or close it if it is already open, so dialogs never stack.
 *  The open overlay id is kept in shared "plato.dialog.<name>", and the dialog reports
 *  that it is alive in "plato.dialog.<name>.alive" (see alive()). A record without a
 *  recent report is stale: the dialog closed without a word, so the key opens a new one. */
export function toggleDialog(name, spec) {
  const act = dialogAction(shared(dialogKey(name)), shared(aliveKey(name)), Date.now());
  if (act.close) {
    setShared(dialogKey(name), null);
    return closeOverlay(act.close);
  }
  const id = openOverlay({ kind: "dialog", modal: true, ...spec }); // the keys panel is a "window"
  setShared(dialogKey(name), id);
  setShared(aliveKey(name), Date.now());
  return id;
}

/** Whether a PLATO dialog is open now (its record is live). */
export function dialogOpen(name) {
  return dialogLive(shared(dialogKey(name)), shared(aliveKey(name)), Date.now());
}

/** When a dialog last reported alive (null if never). */
export function aliveAt(name) {
  return shared(aliveKey(name)) ?? null;
}

/** A dialog's first sign of life, set by whoever opens it, so it counts as open before its
 *  first report. */
export function markAlive(name) {
  setShared(aliveKey(name), Date.now());
}

/** An open dialog's sign of life, each BEAT_MS while it is shown. */
export function alive(name, cx) {
  setShared(aliveKey(name), Date.now());
  cx.timer.after(BEAT_MS, (cx) => alive(name, cx));
}

/** The dialogs this role opens (SIGN-ON and SIGN-OFF belong to the route role). */
const DIALOGS = ["help", "look", "jump", "keys"];

/** Close a PLATO dialog that is open (LOOK when ⌘E opens SET PURPOSE for its tab). */
export function closeDialog(name) {
  const id = shared(dialogKey(name));
  dialogClosed(name);
  if (id) closeOverlay(id);
}

/** A dialog closed itself (Esc, a choice, Enter): forget its id. */
export function dialogClosed(name) {
  setShared(dialogKey(name), null);
  setShared(aliveKey(name), null);
}

/** Show a file in this space's viewer pane, opening one beside the terminal if needed. */
export function openInViewer(file) {
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs.find((t) => t.active);
  if (!space) return;
  setShared(viewerKey(space.id), file);
  if (panes().some((p) => p.mod === "plato" && p.tab === tab?.id)) return;
  run("pane.split", { direction: "right", mod: "plato", props: { role: "viewer", file, space: space.id } });
}

/** True while FOCUS is on: the right column hidden and the route narrowed. */
export function focusOn() {
  return isHidden(layout(), "right");
}

/** Run a PLATO key: HELP, KEYS, FOCUS and CLOSE here; the others as their plato.* command, which
 *  the role that owns it takes (NEXT, LAB and AGENDA the route, GLOW the banner). */
export async function perform(command) {
  const [cmd, arg] = command.split(":");
  switch (cmd) {
    case "help":
      // "help:words" opens HELP on its WORDS screen.
      return toggleDialog("help", { mod: "plato", props: { role: "help", screen: arg ?? null }, width: 680, height: 640 });
    case "keys":
      // ⌘K: the keys panel (keyspage.js), see-through over the whole window, no dimming.
      return toggleDialog("keys", { mod: "plato", props: { role: "keys" }, kind: "window", frame: "none", width: 1, height: 1, at: { x: 0, y: 0 } });
    case "focus":
      for (const [name, args] of focusCommands(focusOn())) run(name, args);
      return;
    case "close": {
      // CLOSE (cmd-w): close the open PLATO dialogs; with none open, close the tab as usual.
      const open = DIALOGS.map((name) => ({ name, id: shared(dialogKey(name)), aliveAt: shared(aliveKey(name)) }));
      const act = closeAction(open, Date.now());
      if (act.tab) return run("tab.close");
      for (const [name, id] of act.close) { dialogClosed(name); closeOverlay(id); }
      return;
    }
    default:
      return run(commandFor(cmd));
  }
}
