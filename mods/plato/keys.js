// The PLATO keys: what each one does and its binding.
// The keyset role runs them; the help role lists them.

import { run, shared, setShared, openOverlay, closeOverlay, keys, layout } from "herdr";
import { isHidden, focusCommands, dialogAction, closeAction } from "./logic.js";

/** The boxed keys along the bottom, in order. */
export const KEYS = [
  { name: "NEXT", cmd: "next" },
  { name: "BACK", cmd: "back" },
  { name: "NEXT1", cmd: "next1" },
  { name: "BACK1", cmd: "back1" },
  { name: "HELP", cmd: "help" },
  { name: "TERM", cmd: "term" },
  { name: "LAB", cmd: "lab" },
  { name: "MAP", cmd: "map" },
  { name: "JUMP", cmd: "jump" },
  { name: "FOCUS", cmd: "focus" },
];

/** NEXT, BACK, NEXT1, BACK1, SIGN-ON, SIGN-OFF, MAP, JUMP and ALL belong to plato-route, GLOW to plato-banner. */
const ROUTE = { next: "next", back: "back", next1: "next1", back1: "back1", signon: "sign-on", signoff: "sign-off", closeup: "close-up", map: "map", jump: "jump", all: "all" };

/** The PLATO mod command for a keyset command, or null for one this mod runs. */
export function routeCommand(cmd) {
  if (cmd === "glow") return "plato-banner.glow";
  return ROUTE[cmd] ? `plato-route.${ROUTE[cmd]}` : null;
}

/** The binding shown for a PLATO command, from the layout:plato section. */
export function bindingFor(cmd) {
  const action = cmd === "term" ? "app.palette" : routeCommand(cmd) ?? `plato.${cmd}`;
  return keys().find((k) => k.section === "layout:plato" && k.action === action)?.keys ?? "";
}

/** Open a PLATO dialog, or close it if it is already open, so dialogs never stack.
 *  The open overlay id is kept in shared "plato.dialog.<name>", and the dialog reports
 *  that it is alive in "plato.dialog.<name>.alive" (see alive()). A record without a
 *  recent report is stale: the dialog closed without a word, so the key opens a new one. */
export function toggleDialog(name, spec) {
  const key = `plato.dialog.${name}`;
  const act = dialogAction(shared(key), shared(`${key}.alive`), Date.now());
  if (act.close) {
    setShared(key, null);
    return closeOverlay(act.close);
  }
  const id = openOverlay({ ...spec, kind: "dialog", modal: true });
  setShared(key, id);
  setShared(`${key}.alive`, Date.now());
  return id;
}

/** An open dialog's sign of life, each second while it is shown. */
export function alive(name, cx) {
  setShared(`plato.dialog.${name}.alive`, Date.now());
  cx.timer.after(1000, (cx) => alive(name, cx));
}

/** The dialogs this mod opens (SIGN-ON and SIGN-OFF belong to plato-route). */
const DIALOGS = ["help"];

/** A dialog closed itself (Esc, a choice, Enter): forget its id. */
export function dialogClosed(name) {
  setShared(`plato.dialog.${name}`, null);
  setShared(`plato.dialog.${name}.alive`, null);
}

/** True while FOCUS is on: the right column hidden and the route narrowed. */
export function focusOn() {
  return isHidden(layout(), "right");
}

export async function perform(command) {
  const route = routeCommand(command);
  if (route) return run(route);
  const [cmd, arg] = command.split(":");
  switch (cmd) {
    case "help":
      // "help:words" opens HELP on its WORDS screen.
      return toggleDialog("help", { mod: "plato", props: { role: "help", screen: arg ?? null }, width: 680, height: 560 });
    case "term":
      return run("app.palette");
    case "lab":
      // The map is open: LAB is for the space under its cursor.
      if (shared("plato.map")) return run("plato-route.lab");
      return openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
    case "focus":
      for (const [name, args] of focusCommands(focusOn())) run(name, args);
      return;
    case "close": {
      // CLOSE (cmd-w): close the open PLATO dialogs; with none open, close the tab as usual.
      const open = DIALOGS.map((name) => ({ name, id: shared(`plato.dialog.${name}`), aliveAt: shared(`plato.dialog.${name}.alive`) }));
      const act = closeAction(open, Date.now());
      if (act.tab) return run("tab.close");
      for (const [name, id] of act.close) { dialogClosed(name); closeOverlay(id); }
      return;
    }
  }
}
