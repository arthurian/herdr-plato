// The PLATO keys: what each one does, its binding and its help line.
// The keyset role runs them; the help role lists them.

import { agents, focused, run, shared, setShared, openOverlay, closeOverlay, keys, panes, spaces, layout } from "herdr";
import { pickNext, backAction, cyclePane, isHidden, focusCommands, currentPlace, dialogAction, closeAction, goToCommand } from "./logic.js";

export const KEYS = [
  { name: "NEXT", cmd: "next", help: "Press NEXT to go to the next shell or agent in this lesson." },
  { name: "BACK", cmd: "back", help: "Press BACK to go to the one before." },
  { name: "NEXT1", cmd: "next1", help: "Press NEXT1 to go to the next agent that needs you." },
  { name: "BACK1", cmd: "back1", help: "Press BACK1 to return to where you were before NEXT1." },
  { name: "HELP", cmd: "help", help: "Press HELP to see this page." },
  { name: "TERM", cmd: "term", help: "Press TERM and type the name of any command." },
  { name: "LAB", cmd: "lab", help: "Press LAB to start a new terminal or agent." },
  { name: "DATA", cmd: "data", help: "Press DATA to write a quick note." },
  { name: "FOCUS", cmd: "focus", help: "Press FOCUS to hide or show the side columns." },
];


/** The binding shown for a PLATO command, from the layout:plato section. */
export function bindingFor(cmd) {
  const action = cmd === "term" ? "app.palette" : `plato.${cmd}`;
  return keys().find((k) => k.section === "layout:plato" && k.action === action)?.keys ?? "";
}

/** INDEX and DATA say where the person is, so HELP can show the right keys. */
export function setPlace(place) {
  setShared("plato.place", place ? { place, at: Date.now() } : null);
}

/** Open a PLATO dialog, or close it if it is already open, so dialogs never stack.
 *  The open overlay id is kept in shared "plato.dialog.<name>". Dialogs are modal:
 *  only their own keys and this toggle close them, so the record stays right. */
export function toggleDialog(name, spec) {
  const key = `plato.dialog.${name}`;
  const act = dialogAction(shared(key));
  if (act.close) {
    setShared(key, null);
    return closeOverlay(act.close);
  }
  const id = openOverlay({ ...spec, kind: "dialog", modal: true });
  setShared(key, id);
  return id;
}

const DIALOGS = ["peek", "help", "data", "index", "monitor", "lesson", "notesfile", "calendar"];

/** MONITOR: look at a terminal in a PLATO dialog, under a title bar that closes it. */
export function openPeek(terminal) {
  const key = "plato.dialog.peek";
  const old = shared(key);
  if (old) closeOverlay(old);
  const id = openOverlay({
    kind: "dialog", modal: true, width: 0.8, height: 0.8,
    layout: { type: "column", children: [
      { type: "block", size: { px: 30 }, content: { mod: "plato", props: { role: "peekbar", terminal } } },
      { type: "block", content: { terminal } },
    ] },
  });
  setShared(key, id);
  setShared("plato.peekTerminal", terminal);
  return id;
}

/** Close the MONITOR view and go to its terminal (GO TO, or NEXT while it is open). */
export function goToPeek() {
  const id = shared("plato.dialog.peek");
  const cmd = goToCommand(shared("plato.peekTerminal") ?? null, agents(), panes());
  setShared("plato.dialog.peek", null);
  if (id) closeOverlay(id);
  if (cmd) run(cmd[0], cmd[1]);
}

/** A dialog closed itself (Esc, a choice, Enter): forget its id. */
export function dialogClosed(name) {
  setShared(`plato.dialog.${name}`, null);
}

/** True while FOCUS has the side columns hidden. */
export function focusOn() {
  return isHidden(layout(), "left");
}

export function openIndexDialog() {
  return toggleDialog("index", { mod: "plato", props: { role: "index", dialog: true }, width: 360, height: Math.min(520, 130 + spaces().length * 23) });
}

export async function perform(cmd) {
  const f = focused();
  switch (cmd) {
    case "next":
      if (shared("plato.dialog.peek")) return goToPeek(); // NEXT in a MONITOR view: go there
    // falls through
    case "back": {
      const pane = cyclePane(spaces().find((s) => s.active), panes(), f?.pane ?? null, cmd === "next" ? 1 : -1);
      if (pane) run("pane.focus", { pane });
      return;
    }
    case "next1": {
      const target = pickNext(agents(), f?.terminal ?? null);
      if (!target) return run("agent.next");
      if (f?.terminal && f.terminal !== target) setShared("plato.back", f.terminal);
      return run("agent.focus", { terminal: target });
    }
    case "back1": {
      const [name, args] = backAction(shared("plato.back") ?? null, agents(), panes());
      setShared("plato.back", null);
      return run(name, args);
    }
    case "help": {
      const place = currentPlace(shared("plato.place"), Date.now(), focusOn());
      return toggleDialog("help", { mod: "plato", props: { role: "help", place }, width: 680, height: 580 });
    }
    case "edit": {
      // A choosing INDEX or TALKOMATIC (column or dialog) arms EDIT for its next letter
      // or number. Dialogs get no key commands, so the request goes through shared state.
      const place = currentPlace(shared("plato.place"), Date.now(), focusOn());
      if (place === "index" || place === "monitor") return setShared("plato.edit", { at: Date.now(), arm: true });
      if (focusOn()) return toggleDialog("index", { mod: "plato", props: { role: "index", dialog: true, edit: true }, width: 360, height: Math.min(520, 130 + spaces().length * 23) });
      return setShared("plato.edit", { at: Date.now(), arm: false }); // rename this lesson in the INDEX column
    }
    case "edittab":
      if (focusOn()) return toggleDialog("monitor", { mod: "plato", props: { role: "talkomatic", dialog: true, editTab: true }, width: 380, height: 360 });
      return setShared("plato.edit", { at: Date.now(), arm: false, tab: true }); // TALKOMATIC edits this tab
    case "calendar":
      return toggleDialog("calendar", { mod: "plato", props: { role: "calendar" }, width: 760, height: 330 });
    case "notesfile":
      return toggleDialog("notesfile", { mod: "plato", props: { role: "notesfile" }, width: 720, height: 520 });
    case "lesson":
      return toggleDialog("lesson", { mod: "plato", props: { role: "lesson" }, width: 720, height: 420 });
    case "term":
      return run("app.palette");
    case "lab":
      return openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
    case "focus":
      for (const [name, args] of focusCommands(focusOn())) run(name, args);
      return;
    case "monitor": {
      // An open peek: MONITOR closes it (TALKOMATIC sees the fresh close and stays out).
      const peek = shared("plato.dialog.peek");
      if (peek) {
        setShared("plato.dialog.peek", null);
        setShared("plato.peekClosed", Date.now());
        return closeOverlay(peek);
      }
      // TALKOMATIC is hidden in focus mode and gets no commands, so open it as a dialog.
      if (focusOn()) toggleDialog("monitor", { mod: "plato", props: { role: "talkomatic", dialog: true }, width: 380, height: 360 });
      return;
    }
    case "close": {
      // CLOSE (cmd-w): close the open PLATO dialogs; with none open, close the tab as usual.
      const act = closeAction(Object.fromEntries(DIALOGS.map((d) => [`plato.dialog.${d}`, shared(`plato.dialog.${d}`)])));
      if (act.tab) return run("tab.close");
      for (const [name, id] of act.close) { setShared(`plato.dialog.${name}`, null); closeOverlay(id); }
      setShared("plato.place", null);
      return;
    }
    case "index":
      // The INDEX column is hidden in focus mode and gets no commands, so open it as a dialog.
      if (focusOn()) openIndexDialog();
      return;
    case "data":
      return toggleDialog("data", { mod: "plato", props: { role: "data" }, width: 680, height: 300 });
  }
}
