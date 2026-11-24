// The route role: PLATO. Each space has a fixed letter (a slot in shared
// "plato.line"); each tab, or each pane of a split tab, is a stop. The current space shows its stops;
// the others show a dot per stop. NEXT1 is drawn before you press it, as a dashed
// yellow run; NEXT and BACK are named in the readout.
// Owns the letters (only this role writes plato.line) and the moves.
//   props { role: "route", mode: "line" | "agenda" }: the narrow line, or the agenda (agendaview.js). The
//   layout keeps both in stacks; "agenda" (cmd-shift-a) swaps them with layout.select: the line
//   copy opens the agenda, the agenda copy folds it back. While open, shared "plato.agenda" is
//   { at } and the agenda copy takes the keyboard.
//   commands: next, next1, back; agenda; jump, jump:<text> (open JUMP, jumppage.js, as a dialog, with that text typed); type:<keys> (into the open agenda; <down>, <space>: named keys); sign-on, sign-off (open the sign role as a dialog, or close
//   it), close-up (drop free slots and reletter); lab (plato.lab sends it while the agenda is
//   open: a terminal on the space under the cursor). In the agenda, sign-off is for the
//   space under the cursor, and the Space bar opens LOOK for the stop under it (lookpage.js); goto:<code> goes to a stop (LOOK's Enter). While a sign page is open, NEXT, BACK,
//   NEXT1 and close-up (its U) go to it through shared "plato.sign.key" (dialogs get no
//   key commands).

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, focused, machines, shared, setShared, run, setAgentOrder, checking, props, openOverlay, closeOverlay, terminals, appHome, readTextFile, watchFolder, window as appWindow, layout } from "herdr";
import { letterColumns, signalRows } from "./overview.js";
import { cursorAt, startCursor, weekDays, agendaCur } from "./agenda.js";
import { spaceMenu, tabMenu, ALIVE_MS, liveRecord, moveHeld, keysGaveBack } from "./logic.js";
import { toggleDialog, closeDialog, dialogOpen, aliveAt, markAlive, keyText } from "./keys.js";
import { dayKey, parseDay, freshDay } from "./day.js";
import * as agendaview from "./agendaview.js";
import * as agendaweek from "./agendaweek.js";
import { C, FONT, stateColor, stateWord, lit } from "./look.js";
import {
  ROW, markY, reconcile, spaceMoves, stops, stopKey, currentStop, nextStop, next1Agent,
  agentOrder, pushBack, backStop, prevStop, routeRows, next1Run, closeUp, closeUpStep, arrivalShown, labelOf,
  waitingLetters, waitingIn, next1Words, next1Label, next1Arrow, nextMark, setDue,
} from "./line.js";
import { parseDueCommand } from "./sign.js";
import { LINE, LINE_BACK, PENDING, SIGN_DIALOG, SIGN_KEY, CLOSEUP, AGENDA, ROUTE_TREE, ARRIVAL, LOOK, KEYS_BACK } from "./shared.js";

const DATA = "plato-data";          // the day files (recorder.js), under the app home
const LINE_X = 14;   // the main line
const RUN_X = 236;    // the NEXT1 run's vertical
const TEXT_X = 30;    // space names

/** Whether the layout node with this id is hidden (FOCUS hides the right column). */
function hiddenIn(layout, id) {
  if (!layout || typeof layout !== "object") return false;
  if (layout.id === id) return Boolean(layout.hidden);
  return (layout.children ?? []).some((c) => hiddenIn(c, id));
}

function ready(m) {
  const e = machines().find((x) => (x.name ?? null) === (m ?? null));
  return (e?.layout ?? (m == null ? "ready" : "unavailable")) === "ready";
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default class Route {
  init(_p, cx) {
    this.movedFor = null;
    this.agendaMode = (props()?.mode ?? "line") === "agenda";
    this.cursor = null; // the agenda: { col, row }
    this.h = cx.focus_handle();
    this.agendaScroll = ScrollHandle.new(); // the agenda's rows, so the arrows can scroll it
    if (this.agendaMode) {
      // Take the keyboard when the agenda opens. layout.select shows this copy a moment
      // after the line copy asks, so keep trying for a short while; a click also takes it.
      if (!checking()) cx.timer.every(200, (cx) => this.claim(cx));
      // The spaces' day words: today's day file (the banner writes it, recorder.js), read when the agenda
      // opens and again only when the folder changes while it is open; never on a render.
      this.day = { key: null, events: null, dirty: true };
      this.agendaView = "today"; // the agenda's view: "today" (each space's hours) or "week"
      this.past = new Map();  // the week's earlier day files: key -> events (each read once; they do not change)
      if (!checking()) cx.spawn(async (cx) => {
        for (;;) {
          try { await watchFolder(`${appHome()}/${DATA}`); } catch { await cx.sleep(5000); continue; } // no folder yet: look again soon
          this.day.dirty = true;
          if (shared(AGENDA)) { await this.readDay(); cx.notify(); }
        }
      });
    }
    // A sign page does not outlive a layout switch or a reload; forget a stale one, or
    // NEXT would keep going to it.
    if (!checking() && shared(SIGN_DIALOG)) setShared(SIGN_DIALOG, null);
  }

  /** The sign dialog's record (SIGN-ON, SIGN-OFF, CLOSE UP, SET PURPOSE, SET DUE) while that
   *  dialog reports alive, else null. A dialog that Herdr closed without a word leaves its
   *  record behind; counting it as open made the next key only close it. */
  signDialog() {
    return liveRecord(shared(SIGN_DIALOG), aliveAt("sign"), Date.now());
  }

  /** The world as the route sees it, after letters are settled. */
  world() {
    const sp = spaces();
    const line = shared(LINE) ?? null;
    const all = stops(line, sp, panes());
    const cur = currentStop(all, focused());
    return { sp, line, all, cur };
  }

  command(c, cx) {
    // close-up on an open sign-off page is its U: sign off and close up the line.
    if (this.signDialog() && (c === "next" || c === "back" || c === "next1" || c === "close-up")) {
      // The page takes each key within a moment. One still waiting means the page is gone
      // (closed by something it could not see): forget it and do the move.
      const waiting = shared(SIGN_KEY);
      if (!waiting || Date.now() - waiting.at < 1000) return setShared(SIGN_KEY, { key: c === "close-up" ? "up" : c, at: Date.now() });
      setShared(SIGN_DIALOG, null);
      setShared(SIGN_KEY, null);
    }
    // While LOOK, JUMP, HELP or a menu is open, a move waits: it never moves you behind a dialog.
    if (moveHeld(c, ["look", "jump", "help", "menu"].filter((n) => dialogOpen(n)))) return;
    if (c === "agenda") return this.agendaMode ? this.fold() : this.open();
    // JUMP: find a tab by its code, name, purpose or folder, as a dialog. The agenda copy opens
    // it while the agenda is open (and takes the keyboard back when it closes), else the line copy.
    // "jump:<text>" opens it with that text already typed (for scripts and screenshots).
    const jump = c.match(/^jump(?::(.*))?$/s);
    if (jump) {
      if (this.agendaMode !== Boolean(shared(AGENDA))) return;
      if (this.agendaMode) this.jumping = true;
      return toggleDialog("jump", { mod: "plato", props: { role: "jump", query: jump[1] ?? "" }, width: 1280, height: 640 });
    }
    // TREE: every space's stops on the route, or only the current space's again.
    if (c === "tree") return this.agendaMode ? null : setShared(ROUTE_TREE, !shared(ROUTE_TREE));
    // "type:c3" types into the open agenda as keys would (for scripts and checks); a key name in
    // angle brackets is that key: "type:<down><space>".
    const typed = c.match(/^type:(.*)$/);
    if (typed) {
      if (this.agendaMode) for (const [, name, ch] of typed[1].matchAll(/<(\w+)>|(.)/gu)) {
        agendaview.key(this, name ? { key: name, key_char: name === "space" ? " " : null } : { key: ch, key_char: ch }, this.columns ?? []);
      }
      return;
    }
    // "pick:<json>": an item picked in a right-click menu (the menu role).
    const pick = c.match(/^pick:(.*)$/s);
    if (pick) {
      let p;
      try { p = JSON.parse(pick[1]); } catch { return; }
      return this.menuPick(p.id, p.target ?? {});
    }
    // RENAME TAB from the keys panel: in the agenda the tab under the cursor (as its right-click
    // RENAME TAB), else the tab you are at, as F2.
    if (c === "rename-tab") {
      if (this.agendaMode !== Boolean(shared(AGENDA))) return;
      if (!this.agendaMode) return run("tab.rename");
      const stop = this.agendaAt().stop;
      return stop ? run("tab.rename", { id: stop.tab }) : undefined;
    }
    if (c === "lab") return this.lab();
    // SET PURPOSE (cmd-e): for the tab you are at, or in the agenda the card under the cursor.
    // While LOOK is open, SET PURPOSE is for the tab it shows: LOOK closes and the page opens.
    if (c === "purpose") {
      const look = this.lookOpen();
      if (look) {
        closeDialog("look");
        this.looking = false;
        return this.openPurpose(this.world().all.find((s) => s.terminal === look.terminal));
      }
      return this.openPurpose(this.agendaMode ? this.agendaAt().stop : this.world().cur);
    }
    // SET DUE (cmd-shift-e): for the space you are in, or in the agenda the space under the
    // cursor. "due:c=2026-11-27" (or "due:c=" to clear) is the dialog's answer: the route alone
    // writes the line.
    if (c === "due") {
      const w = this.world();
      const letter = this.agendaMode ? this.agendaAt().column?.letter : (w.line?.slots ?? []).find((s) => s.space && s.space === w.cur?.space)?.letter;
      return this.openDue(letter);
    }
    const dueSet = parseDueCommand(c);
    if (dueSet) {
      const line = shared(LINE) ?? null;
      const next = setDue(line, dueSet.letter, dueSet.due);
      if (next !== line) setShared(LINE, next);
      return;
    }
    // In the agenda, SIGN-OFF is for the space under the cursor (none on a free letter).
    const under = this.agendaMode && c === "sign-off" ? this.agendaAt().column : null;
    if (under && !under.space && !this.signDialog()) return;
    // In the agenda, a move or a sign page folds it back first, so you see where you went.
    if (this.agendaMode && (["next", "back", "next1", "back1", "close-up"].includes(c) || /^(sign-|go:|goto:)/.test(c))) this.fold();
    const sign = c.match(/^sign-(on|off)(?:[: ](.*))?$/);
    if (sign) return this.sign(sign[1], sign[2] ?? "", null, under?.space?.id ?? null);
    // CLOSE UP (cmd-u) opens a page that lists the moves; only its NEXT closes up the line.
    if (c === "close-up") return this.sign("up");
    const { all, cur } = this.world();
    if (c === "next") return this.go(nextStop(all, cur));
    // BACK walks the line backward (NEXT's mirror); BACK1 returns to where you were before.
    if (c === "back") return this.go(prevStop(all, cur));
    if (c === "back1") return this.go(backStop(shared(LINE_BACK), all, cur));
    if (c === "next1") return this.focusAgent(next1Agent(agents(), focused()?.terminal ?? null)?.address);
    // "go:<terminal>": a click on a signal (a SIGNALS row) goes to that agent as NEXT1 does.
    const goTo = c.match(/^go:(.+)$/);
    if (goTo) return this.focusAgent(goTo[1]);
    // "goto:<code>": LOOK's Enter goes to the stop it shows, as GO in a menu does.
    const code = c.match(/^goto:(.+)$/);
    if (code) return this.go(all.find((s) => s.code === code[1]));
  }

  /** NEXT1's move: focus an agent's terminal. Clicks on signals use it too, so arrival,
   *  BACK1 and TODAY see the same move as the key. */
  focusAgent(address) {
    if (address) run("agent.focus", { terminal: address });
  }

  /** A right-click menu: the menu role as a popup at the pointer, as Herdr's own tab menu. */
  openMenu(items, target) {
    openOverlay({ mod: "plato", kind: "popup", width: 240, props: { role: "menu", items, target } });
  }

  /** A right-click menu item (spaceMenu, tabMenu in logic.js) runs the same code as its key.
   *  target: { letter } for a space or { code } for a tab, and in the agenda the column and row
   *  it was on, so the cursor moves there first and LAB, SIGN-OFF and PEEK act on it, as
   *  their keys do. A space or tab that has gone since the menu opened does nothing. */
  menuPick(id, target) {
    const w = this.world();
    const slot = target.letter ? (w.line?.slots ?? []).find((s) => s.letter === target.letter) : null;
    const t = {
      letter: target.letter,
      space: slot?.space ? w.sp.find((sp) => sp.id === slot.space) ?? null : null,
      stop: target.code ? w.all.find((s) => s.code === target.code) ?? null : null,
    };
    if (target.code ? !t.stop : !slot || (!t.space && id !== "sign-on" && id !== "close-up")) return;
    if (this.agendaMode && target.col != null) this.cursor = { col: target.col, row: target.row ?? 0 };
    switch (id) {
      case "go": return this.agendaMode ? this.agendaGo(t.stop) : this.go(t.stop);
      case "rename-tab": return run("tab.rename", { id: t.stop.tab });
      case "look": return this.lookAt(t.stop, target.from ?? (this.agendaMode ? "agenda" : "route"));
      case "purpose": return this.openPurpose(t.stop);
      case "due": return this.openDue(t.letter);
      case "rename": return run("space.rename", { id: t.space.id });
      // LAB on the line: the new-tab menu, for that space (answer 3: select it first).
      case "lab":
        if (!this.agendaMode && t.space.id !== focused()?.space) run("space.select", { id: t.space.id });
        return this.lab();
      case "sign-off": return this.agendaMode ? this.command("sign-off") : this.sign("off", "", null, t.space.id);
      case "sign-on": return this.agendaMode ? this.agendaSignOn(t.letter) : this.sign("on", "", t.letter);
      case "close-up": return this.command("close-up");
    }
  }

  /** Open the sign-on or sign-off page, or close the one open (PLATO dialogs toggle).
   *  "sign-on <text>" starts the name line with text, or the folder field with a path. at: the space for sign-off (default:
   *  the one you are at). */
  sign(page, text, letter = null, at = null) {
    const open = this.signDialog();
    if (open) {
      setShared(SIGN_DIALOG, null);
      return closeOverlay(open.id);
    }
    const space = at ?? focused()?.space ?? spaces().find((s) => s.active)?.id ?? null;
    if (page === "off" && !space) return;
    const id = openOverlay({ mod: "plato", props: { role: "sign", page, space, text, letter }, kind: "dialog", modal: true, width: 640, height: 430 });
    setShared(SIGN_DIALOG, { id, page, space, letter, at: Date.now() });
    markAlive("sign");
  }

  /** SET PURPOSE: a one-line dialog for your purpose of a stop's terminal, or close the open
   *  dialog (PLATO dialogs toggle). It starts with your purpose, if you set one. */
  openPurpose(stop) {
    const open = this.signDialog();
    if (open) {
      setShared(SIGN_DIALOG, null);
      return closeOverlay(open.id);
    }
    if (!stop?.terminal) return;
    const text = labelOf(terminals(), stop.terminal, "plato.purpose_yours") ?? "";
    const id = openOverlay({ mod: "plato", props: { role: "sign", page: "purpose", terminal: stop.terminal, code: stop.code, label: stop.label, text }, kind: "dialog", modal: true, width: 640, height: 330 });
    setShared(SIGN_DIALOG, { id, page: "purpose", space: stop.space, letter: null, at: Date.now() });
    markAlive("sign");
    if (this.agendaMode) this.signing = true;
  }

  /** SET DUE: a one-line dialog for a space's due date, or close the open dialog (PLATO
   *  dialogs toggle). It starts with the date the space has. A free letter has none to set. */
  openDue(letter) {
    const open = this.signDialog();
    if (open) {
      setShared(SIGN_DIALOG, null);
      return closeOverlay(open.id);
    }
    const { line, sp } = this.world();
    const slot = (line?.slots ?? []).find((s) => s.letter === letter && s.space);
    if (!slot) return;
    const name = sp.find((s) => s.id === slot.space)?.name ?? slot.name ?? "";
    const id = openOverlay({ mod: "plato", props: { role: "sign", page: "due", letter, name, text: slot.due ?? "" }, kind: "dialog", modal: true, width: 640, height: 330 });
    setShared(SIGN_DIALOG, { id, page: "due", space: slot.space, letter, at: Date.now() });
    markAlive("sign");
    if (this.agendaMode) this.signing = true;
  }

  /** LAB. In the agenda: fold back and start a terminal in a new tab on the space under the
   *  cursor. On the line (the agenda was closed and plato.agenda is stale): the LAB menu. */
  lab() {
    if (!this.agendaMode) {
      if (shared(AGENDA)) setShared(AGENDA, null);
      return openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
    }
    const t = this.agendaAt().column;
    if (!t?.space) return;
    this.fold();
    run("space.select", { id: t.space.id });
    run("tab.new", { space: t.space.id, folder: t.space.folder });
  }

  // ---- the agenda ----

  /** Line ⇄ agenda: show the agenda in both stacks (appendix F). */
  open() {
    run("layout.select", { stack: "plato-main", child: "agenda-view" });
    run("layout.select", { stack: "box", child: "box-agenda" });
    setShared(AGENDA, { at: Date.now() });
  }

  /** Fold the agenda back to the line, and give the keyboard back to the current stop. */
  fold() {
    if (!this.agendaMode) return;
    run("layout.select", { stack: "plato-main", child: "line-view" });
    run("layout.select", { stack: "box", child: "box-line" });
    if (shared(AGENDA)) setShared(AGENDA, null);
    this.cursor = null;
    this.looking = false;
    this.jumping = false;
    this.signing = false;
    const p = focused()?.pane;
    if (p) run("pane.focus", { pane: p });
  }

  /** The agenda's cursor. Before the agenda has drawn since it opened, it is where it will
   *  start (the stop you are at), on lines made now, never a stale a1. */
  agendaCursor() {
    if (!this.cursor) {
      const w = this.world();
      this.columns = letterColumns(w.line, w.sp, w.all);
      this.cursor = startCursor(this.columns, w.cur);
    }
    return this.cursor;
  }

  /** The column and stop under the agenda's cursor. The cursor comes first: before the agenda has
   *  drawn since it opened, agendaCursor() makes new columns, and the cursor must be read on
   *  those, not on the columns of the last time the agenda was open (a space since closed). */
  agendaAt() {
    const c = this.agendaCursor();
    return cursorAt(this.columns ?? [], c);
  }

  /** The Space bar in the agenda: LOOK at the stop under the cursor, over the agenda. */
  agendaLook(stop) {
    if (!stop) return;
    this.looking = true;
    this.lookAt(stop, "agenda");
  }

  /** LOOK at a stop: its card as a dialog, or close the one open (PLATO dialogs toggle).
   *  The arrow keys in it step along the line, or from SIGNALS through the waiting agents
   *  in NEXT1 order. */
  lookAt(stop, from) {
    if (!stop) return;
    const { all } = this.world();
    let codes = all.map((s) => s.code);
    if (from === "signals") {
      const waiting = signalRows(agents(), all).map((r) => r.stop?.code).filter(Boolean);
      if (waiting.includes(stop.code)) codes = waiting;
    }
    toggleDialog("look", { mod: "plato", props: { role: "look", codes, at: Math.max(codes.indexOf(stop.code), 0), from }, width: 760, height: 560 });
  }

  /** LOOK's { terminal, at } while it is open, else null. */
  lookOpen() {
    const look = shared(LOOK);
    return look && Date.now() - look.at < ALIVE_MS ? look : null;
  }

  showCascade(cx) {
    if (this.cascade !== "hide") return;
    this.cascade = "run";
    cx.notify();
  }

  /** Today's day file, and the four days before it for WEEK (each read once). */
  async readDay() {
    const key = dayKey(Date.now());
    this.day.dirty = false;
    const text = await readTextFile(`${appHome()}/${DATA}/${key}.json`).catch(() => null);
    const fresh = freshDay(this.day, { key, events: parseDay(text) }); // a read caught mid-write keeps the last one
    this.day = { key, events: fresh.events, dirty: this.day.dirty };
    for (const d of weekDays(Date.now()).filter((x) => x.past && !this.past.has(x.key))) {
      this.past.set(d.key, parseDay(await readTextFile(`${appHome()}/${DATA}/${d.key}.json`).catch(() => null)));
    }
  }

  /** The agenda copy takes the keyboard for a moment after the agenda opens, and back after LOOK.
   *  It also reads the day file when the agenda opens, if it changed or the day turned. */
  claim(cx) {
    this.showCascade(cx);
    const y = shared(AGENDA);
    if (y && this.dayFor !== y.at) {
      this.dayFor = y.at;
      if (this.day.dirty || this.day.key !== dayKey(Date.now())) cx.spawn(async (cx) => { await this.readDay(); cx.notify(); });
    }
    // The keys panel reads what the cursor is on (agendaCur) while the agenda is open.
    if (y && this.agendaMode) {
      const cur = agendaCur(this.agendaAt());
      if (JSON.stringify(cur) !== JSON.stringify(y.cur ?? null)) setShared(AGENDA, { ...y, cur });
    }
    // The keys panel over the agenda: once it closes having run nothing, the agenda takes the
    // keyboard back. A row it ran may have opened HELP, TERM or a rename, which keep it.
    if (dialogOpen("keys")) { this.keyingAt ??= Date.now() - ALIVE_MS; return; }
    if (this.keyingAt != null) {
      const gaveBack = keysGaveBack(shared(KEYS_BACK), this.keyingAt);
      this.keyingAt = null;
      if (y && gaveBack && !this.looking && !this.jumping && !this.signing && !this.h.is_focused()) this.h.focus();
    }
    // LOOK, JUMP, SET PURPOSE or SET DUE from the agenda: once it closes, the agenda takes the
    // keyboard back (unless it went to a tab, which folds the agenda).
    if (this.looking || this.jumping || this.signing) {
      if (this.looking ? this.lookOpen() : this.jumping ? dialogOpen("jump") : this.signDialog()) return;
      this.looking = false;
      this.jumping = false;
      this.signing = false;
      if (y && !this.h.is_focused()) this.h.focus();
      return;
    }
    if (!y || this.h.is_focused() || Date.now() - y.at > 1500) return;
    if (this.claimed !== y.at) { this.claimed = y.at; this.cursor = null; cx.notify(); }
    this.h.focus();
  }

  agendaGo(stop) {
    this.fold();
    this.go(stop);
  }

  /** A free letter in the agenda: fold back and open sign-on for that letter. */
  agendaSignOn(letter) {
    this.fold();
    if (this.signDialog()) return;
    this.sign("on", "", letter);
  }

  go(stop) {
    if (!stop) return;
    run("space.select", { id: stop.space });
    run("tab.select", { id: stop.tab });
    if (stop.pane) run("pane.focus", { pane: stop.pane });
  }

  /** Settle letters, Herdr's space order and BACK's list. Writes only what changed, so
   *  the re-render it causes writes nothing. (A timer started from render was dropped
   *  when the next render came first, so this runs in render itself.) */
  sync() {
    const sp = spaces();
    if (checking() || !sp.length || !ready(null)) return;
    const pend = shared(PENDING) ?? null;
    const r = reconcile(shared(LINE) ?? null, sp, { now: Date.now(), pending: pend, ready });
    const step = closeUpStep(shared(CLOSEUP) ?? null, sp, Date.now());
    if (step === "apply") {
      r.line = closeUp(r.line, Date.now());
      r.changed = true;
    }
    if (step === "apply" || step === "drop") setShared(CLOSEUP, null);
    if (r.changed) setShared(LINE, r.line);
    if (r.pending !== pend) setShared(PENDING, r.pending);
    const moves = spaceMoves(r.line, sp);
    const sig = JSON.stringify(r.line.slots.map((s) => [s.letter, s.space]));
    if (moves.length && sig !== this.movedFor) {
      this.movedFor = sig; // once per line change, so a refused move cannot loop
      for (const m of moves) run("space.move", m);
    }
    const cur = currentStop(stops(r.line, sp, panes()), focused());
    if (cur) {
      const list = shared(LINE_BACK) ?? [];
      const next = pushBack(list, stopKey(cur));
      if (next !== list) setShared(LINE_BACK, next);
    }
  }

  render(cx) {
    this.sync();
    const w = this.world();
    const ag = agents();
    setAgentOrder(agentOrder(ag));
    if (this.agendaMode) return this.agendaFrame(w, ag, cx);
    if (hiddenIn(layout(), "right")) return this.slimFrame(w, ag);

    const space = w.sp.find((s) => s.id === focused()?.space) ?? w.sp.find((s) => s.active);
    const tree = Boolean(shared(ROUTE_TREE));
    const rows = routeRows(w.line, w.sp, w.all, space?.id ?? null, tree);
    const next = nextStop(w.all, w.cur);
    const n1 = next1Agent(ag, focused()?.terminal ?? null);
    const n1Stop = n1 ? w.all.find((s) => s.pane === n1.pane) ?? null : null;
    const prev = prevStop(w.all, w.cur);
    const back1 = backStop(shared(LINE_BACK), w.all, w.cur);
    const run1 = n1Stop ? next1Run(rows, stopKey(w.cur), stopKey(n1Stop)) : null;
    // A space with an agent that needs you gets a WAITING tag in reverse video: a mark that
    // shows without motion or color, so it reads in every glow and with motion turned off.
    this.waits = waitingLetters(ag, w.all, focused()?.terminal ?? null);
    this.n1Key = run1 ? stopKey(n1Stop) : null;
    this.freeLetters = (w.line?.slots ?? []).filter((s) => !s.space).length;
    const total = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0;

    // The run goes under the rows, so it never strikes through a stop's name.
    const els = [...this.lines(rows), ...this.nextMark(nextMark(rows, stopKey(w.cur), stopKey(next))), ...this.run(run1), ...rows.map((r, i) => this.row(r, i, w.cur))];
    const picture = div().id("route-picture").relative().w_full().h(total).children(els);
    return this.frame(v_flex().flex_1().min_h(0).gap(8)
      .child(v_flex().id("route-scroll").flex_1().min_h(0).overflow_y_scrollbar().child(picture))
      // While the pointer is on a tab, the readout shows that tab's detail instead.
      .child(((hov) => (hov ? agendaview.detailBlock(hov) : this.readout(next, prev, n1Stop, n1, back1)))(agendaview.hovered(this, w.all, w.sp, Date.now(), 30)))
      .child(v_flex().text_size(11).line_height("14px").text_color(C.dim)
        .child(h_flex().gap(4).items_center()
          .child(this.swatch("square", "fill")).child(div().child("this space ·"))
          .child(this.swatch("square")).child(div().child("space ·"))
          .child(this.swatch("square", "dashed")).child(div().child("free")))
        .child(h_flex().gap(4).items_center()
          .child(this.swatch("ring")).child(div().child("you are here ·"))
          .child(this.swatch("round", "fill")).child(div().child("working ·"))
          .child(this.swatch("round")).child(div().child("idle")))
        .child(h_flex().gap(4).items_center()
          .child(this.swatch("round", "bright")).child(div().child("needs you ·"))
          .child(this.tag("WAITING")).child(div().child("its space")))), "ROUTE", this.routeNote(tree));
  }

  agendaFrame(w, ag, cx) {
    // The opening cascade, once per opening: this render draws the cards hidden, the next
    // fades them in row by row with native transitions (agendaview.js). The next render comes
    // from a timer here, or claim() (every 200 ms) if a render that came first dropped it.
    // Only while the window is active: in the background Herdr draws few frames, so the fade
    // would stall with the cards hidden (seen when a script opened the agenda).
    const y = shared(AGENDA);
    if (y && this.cascadeFor !== y.at && !checking()) {
      this.cascadeFor = y.at;
      this.cascade = appWindow().active ? "hide" : "run";
      if (this.cascade === "hide") cx.timer.after(16, (cx) => this.showCascade(cx));
    }
    const n1 = next1Agent(ag, focused()?.terminal ?? null);
    const yw = {
      columns: letterColumns(w.line, w.sp, w.all),
      line: w.line,
      day: this.day?.events ?? null,
      days: new Map([...(this.past ?? []), [this.day?.key ?? "", this.day?.events ?? []]]),
      cur: w.cur,
      next: nextStop(w.all, w.cur),
      prev: prevStop(w.all, w.cur),
      n1,
      n1Stop: n1 ? w.all.find((s) => s.pane === n1.pane) ?? null : null,
      back1: backStop(shared(LINE_BACK), w.all, w.cur),
    };
    this.columns = yw.columns;
    return div().id("agenda").size_full().track_focus(this.h)
      .on_key_down((e, cx) => { if (agendaview.key(this, e, this.columns ?? [])) { cx.stop_propagation(); cx.notify(); } })
      .on_mouse_down("left", () => this.h.focus())
      .child(this.frame(agendaview.draw(this, yw, this.agendaView === "week" ? agendaweek.body(this, yw) : null), "AGENDA", `${keyText({ cmd: "agenda" })} or Esc closes the agenda`));
  }

  /** Focus mode (FOCUS hides the right column and narrows this block): the line as a column
   *  of lettered space squares, as on the full route. The current space is filled, with its stop number under it; a space
   *  with an agent waiting for you pulses. A click goes to that space. This copy stays
   *  shown, so NEXT, BACK, NEXT1 and the agenda keep working. */
  slimFrame(w, ag) {
    const cur = w.cur;
    const waiting = waitingLetters(ag, w.all, focused()?.terminal ?? null);
    const items = (w.line?.slots ?? []).map((slot) => {
      const space = w.sp.find((sp) => sp.id === slot.space);
      const here = Boolean(cur && space && cur.space === space.id);
      let ring = div().id(`slim-${slot.letter}`).w(32).h(32).flex_none().border_2()
        .flex().items_center().justify_center().text_size(18);
      if (!space) ring = ring.border_dashed().border_color(C.dim).text_color(C.dim);
      else if (here) ring = ring.bg(C.fg).border_color(C.fg).text_color(C.bg);
      else ring = ring.border_color(waiting.has(slot.letter) ? C.bright : C.fg).text_color(C.bright).cursor_pointer().on_click(() => this.goSpace(space));
      if (waiting.has(slot.letter) && !here) ring = ring.loop("opacity", { from: 0.35, to: 1, period: 1100 });
      return v_flex().items_center().gap(2)
        .child(ring.child(slot.letter))
        .when(here, (el) => el.child(div().text_size(12).line_height("14px").text_color(C.bright).child(cur.code.slice(1))))
        .when(!here && waiting.has(slot.letter), (el) => el.child(this.waitTag("WAIT", slot.letter)));
    });
    return v_flex().id("route").size_full().font_family(FONT).text_size(14).bg(C.bg).text_color(C.fg).p(2).child(
      v_flex().flex_1().min_h(0).border_1().border_color(C.fg).items_center().py(8).gap(10).children(items));
  }

  /** The route's title note: TREE (in reverse video while it is on) and AGENDA, with their keys.
   *  A click on either runs its command, as the key does. */
  routeNote(tree) {
    const click = (el, c) => el.cursor_pointer().hover((st) => st.text_color(C.bright)).on_click(() => this.command(c));
    const treeEl = click(div().id("note-tree").px(tree ? 3 : 0).child(`TREE ${keyText({ cmd: "tree" })}`), "tree");
    return h_flex().gap(12).child(tree ? treeEl.bg(C.fg).text_color(C.bg) : treeEl).child(click(div().id("note-agenda").child(`AGENDA ${keyText({ cmd: "agenda" })}`), "agenda"));
  }

  frame(child, title = "ROUTE", note = null) {
    return v_flex().id("route").size_full().font_family(FONT).text_size(14).line_height("19px").bg(C.bg).text_color(C.fg).p(2).child(
      v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
        v_flex().flex_1().min_h(0).border_1().border_color(C.fg).px(6).py(4).gap(4)
          .child(h_flex().gap(12).child(div().text_color(C.dim).child(title)).when(Boolean(note), (el) => el.child(div().text_color(C.dim).child(note))))
          .child(child)));
  }

  /** The main line through every space, and the branch down the current space's stops. */
  lines(rows) {
    const slots = rows.filter((r) => r.type === "slot");
    const out = [];
    if (slots.length > 1) {
      const y1 = slots[0].y + ROW.slot / 2;
      const y2 = slots[slots.length - 1].y + ROW.slot / 2;
      out.push(div().absolute().left(LINE_X - 1).top(y1).w(2).h(y2 - y1).bg(C.fg));
    }
    // A branch down each space's stops (only the current one's, unless TREE is on).
    const bx = ROW.stopX + 4;
    rows.forEach((st, i) => {
      if (st.type !== "slot") return;
      let j = i + 1;
      while (rows[j]?.type === "stop") j++;
      if (j === i + 1) return;
      const y1 = st.y + ROW.slot / 2;
      out.push(div().absolute().left(LINE_X).top(y1 - 1).w(bx - LINE_X).h(2).bg(C.fg));
      // The branch ends at the center of the last marker, so nothing shows below it.
      out.push(div().absolute().left(bx).top(y1).w(2).h(markY(rows[j - 1]) - y1).bg(C.fg));
    });
    return out;
  }

  /** A small ▼ at the end of the line into NEXT's target, its tip on the marker. */
  nextMark(m) {
    if (!m) return [];
    const x = m.on === "branch" ? ROW.stopX + 5 : LINE_X;
    return [div().absolute().left(x - 5).top(m.tip - 10).w(10).h(10).flex().items_end().justify_center()
      .text_size(10).line_height("10px").text_color(C.fg).bg(C.bg).child("▼")];
  }

  row(r, i, cur) {
    const box = div().id(`row-${i}`).absolute().left(0).top(r.y).w_full().h(r.h);
    if (r.type === "slot") return this.slot(box, r);
    if (r.type === "free-hint") {
      return box.pl(TEXT_X).text_size(12).text_color(C.dim).child(`free since ${r.slot.closed ? clock(r.slot.closed) : "?"}`);
    }
    if (r.type === "dots") return box.children(r.stops.map((s, k) => this.dot(s, k)));
    if (r.compact) return this.compactStop(box, r.stop);
    return this.stop(box, r.stop, stopKey(r.stop) === stopKey(cur));
  }

  slot(box, r) {
    const { slot, space } = r;
    const free = !slot.space;
    const current = space && space.id === (focused()?.space ?? null);
    // The space's square holds its letter, like a key cap: the letter is the address you
    // type in the agenda, and it stays whole when a long name is cut.
    const B = ROW.slotBox;
    let mark = div().absolute().left(LINE_X - B / 2).top((ROW.slot - B) / 2).w(B).h(B).border_1()
      .flex().items_center().justify_center().text_size(12).line_height(`${B - 2}px`).child(slot.letter);
    mark = free ? mark.border_dashed().border_color(C.dim).bg(C.bg).text_color(C.dim)
      : current ? mark.border_color(C.fg).bg(C.fg).text_color(C.bg) : mark.border_color(C.fg).bg(C.bg).text_color(C.bright);
    const was = slot.moved_from ? ` · was ${slot.moved_from}` : "";
    const text = free ? "free" : `${space?.name ?? slot.name ?? ""}${was}`;
    const waits = !free && this.waits?.has(slot.letter);
    let label = div().id(`st-${slot.letter}`).min_w(0).px(3).truncate().child(text);
    if (free) label = label.text_color(C.dim);
    else if (current) label = label.bg(C.fg).text_color(C.bg);
    // A background, so a branch under the name (TREE) never strikes through it.
    else label = (was ? label.text_color(C.bright) : label).bg(C.bg).cursor_pointer().hover((s) => s.bg(C.glow));
    if (space && !current) label = label.on_click(() => this.goSpace(space));
    // WAITING follows the name, so it reads as part of it. A long name truncates first.
    const row = h_flex().absolute().left(TEXT_X).top(7).max_w(RUN_X - TEXT_X - 12).gap(6).items_center()
      .child(label).when(waits, (el) => el.child(this.waitTag("WAITING", slot.letter)));
    // A right-click on the square or the name opens the space's menu.
    const items = spaceMenu({ free, freeLetters: this.freeLetters ?? 0 });
    return agendaview.rightClick(this, box.child(mark).child(row), items, { letter: slot.letter });
  }

  /** A legend mark, drawn like the route's own: a space square (filled, hollow or
   *  dashed), a stop lamp (filled or hollow), or the ring of the stop you are at. */
  swatch(shape, kind) {
    if (shape === "ring") {
      const icon = (name) => svg(`mods/plato/${name}.svg`).absolute().left(0).top(0).size(10).text_color(C.fg);
      return div().relative().w(10).h(10).flex_none().child(icon("here-ring")).child(icon("here-lit"));
    }
    let m = div().w(8).h(8).flex_none().border_1().border_color(C.fg);
    if (shape === "round") m = m.rounded_full();
    if (kind === "fill") m = m.bg(C.fg);
    if (kind === "bright") m = m.border_color(C.bright).bg(C.bright);
    if (kind === "dashed") m = m.border_dashed().border_color(C.dim);
    return m;
  }

  /** A small reverse-video tag ("WAITING", "WAIT"), as the agenda's cards use. */
  tag(word) {
    return div().flex_none().px(3).text_size(11).line_height("14px").bg(C.bright).text_color(C.bg).child(word);
  }

  /** A WAITING (or WAIT) tag that goes, on a click, to the agent waiting in that space, the
   *  first in NEXT1 order, by NEXT1's own move. */
  waitTag(word, letter) {
    return this.tag(word).id(`wait-${letter}`).cursor_pointer().on_click((_e, cx) => {
      const a = waitingIn(agents(), this.world().all, letter, focused()?.terminal ?? null);
      this.focusAgent(a?.address);
      cx.stop_propagation();
    });
  }

  goSpace(space) {
    const all = stops(shared(LINE) ?? null, spaces(), panes());
    const tab = space.tabs.find((t) => t.active)?.id;
    this.go(all.find((s) => s.space === space.id && s.tab === tab) ?? all.find((s) => s.space === space.id));
  }

  dot(s, k) {
    const x = ROW.dotX + k * ROW.dotStep;
    const col = stateColor(s.status);
    const filled = lit(s.status);
    // Near the top of the row, so a space's signals sit close under its name and the
    // gap falls before the next space instead.
    let d = div().absolute().left(x - 4).top(ROW.dotY - 4).w(8).h(8).rounded_full().border_1().border_color(col);
    d = filled ? d.bg(col) : d.bg(C.bg);
    if (s.status === "blocked") d = d.loop("opacity", { from: 0.4, to: 1, period: 1100 });
    const hit = div().id(`dot-${stopKey(s)}`).size_full().cursor_pointer().on_click(() => this.go(s));
    const area = div().absolute().left(x - 6).top(0).w(12).h(ROW.dots)
      .child(agendaview.tabTrigger(this, hit, s, false));
    return div().children([d, area]);
  }

  stop(box, s, isCur) {
    const x = ROW.stopX;
    const col = stateColor(s.status);
    const on = lit(s.status);
    // A stop is always a round lamp (squares are spaces). Where you are, a ring
    // around the lamp says so, and the lamp inside still shows the state.
    // The ring and the lamp are two drawings of the same 16 px box, so they stay centered
    // on each other at any zoom (two boxes of different sizes round to different pixels).
    const icon = (name, color) => svg(`mods/plato/${name}.svg`).absolute().left(0).top(0).size(16).text_color(color);
    let mark = isCur
      ? div().absolute().left(x - 4).top(ROW.markY - 8).w(16).h(16).rounded_full().bg(C.bg)
        .child(icon("here-ring", C.fg)).child(icon(on ? "here-lit" : "here-unlit", col))
      : div().absolute().left(x - 1).top(ROW.markY - 5).w(10).h(10).rounded_full().border_1().border_color(col).bg(on ? col : C.bg);
    if (!isCur && s.status === "blocked") mark = mark.loop("opacity", { from: 0.4, to: 1, period: 1100 });
    // Just arrived (until 4 s pass or a prompt is sent): say from where, as the strip does.
    const a = shared(ARRIVAL);
    const arrived = isCur && arrivalShown(a, stopKey(s), labelOf(terminals(), s.terminal, "plato.last_at"), Date.now());
    const sub = arrived ? `◀ arrived from ${a.from.code}` : isCur ? `${s.program} · you are here` : `${s.program} · ${stateWord(s.status)}`;
    let text = v_flex().id(`pl-${stopKey(s)}`).absolute().left(x + 14).top(6).w(RUN_X - x - 24).px(3)
      .child(div().truncate().child(`${s.code.slice(1)} ${s.label}`))
      .child(div().text_size(12).line_height("15px").truncate().text_color(isCur ? C.bright : stateColor(s.status)).child(sub));
    text = isCur ? text.bg(C.glow).border_1().border_color(C.fg) : text.cursor_pointer().hover((st) => st.bg(C.glow)).on_click(() => this.go(s));
    // Hovering the row, its lamp included, shows the tab's detail in the readout.
    return agendaview.hoverable(this, box, s).children([mark, agendaview.rightClick(this, text, tabMenu({ current: isCur, inAgenda: false }), { code: s.code })]);
  }

  /** TREE: another space's stop as one line: lamp, code, program (claude, codex, zsh)
   *  and state. Titles are often too long for one line; the current space shows them. */
  compactStop(box, s) {
    const x = ROW.stopX;
    const col = stateColor(s.status);
    const on = lit(s.status);
    let mark = div().absolute().left(x).top(ROW.compactMarkY - 4).w(8).h(8).rounded_full().border_1().border_color(col).bg(on ? col : C.bg);
    if (s.status === "blocked") mark = mark.loop("opacity", { from: 0.4, to: 1, period: 1100 });
    const text = h_flex().id(`pl-${stopKey(s)}`).size_full().px(3).gap(6).min_w(0)
      .text_size(13).line_height("19px").cursor_pointer().hover((st) => st.bg(C.glow)).on_click(() => this.go(s))
      .child(div().flex_none().child(s.code))
      .child(div().flex_1().min_w(0).truncate().child(s.program || s.label))
      .child(div().flex_none().text_color(col).child(stateWord(s.status)));
    // Hovering the row shows its detail, as on a dot.
    const area = div().absolute().left(x + 14).top(2).w(RUN_X - x - 24).h(ROW.compact - 4)
      .child(agendaview.tabTrigger(this, text, s, false));
    return box.children([mark, area]);
  }

  /** NEXT1 as a dashed right-angled run: out from the current stop, down the right
   *  edge, and in on a line under the target's row, then up into its lamp or dot. It crosses
   *  no dot and no stop's text. */
  run(r) {
    if (!r) return [];
    const top = Math.min(r.y1, r.y2), h = Math.abs(r.y2 - r.y1);
    const dash = (el) => el.border_dashed().border_color(C.bright);
    const arrow = next1Arrow(r, RUN_X);
    return [
      dash(div().absolute().left(RUN_X - 12).top(r.y1).w(12).h(0).border_t(1.5)),
      dash(div().absolute().left(RUN_X).top(top).w(0).h(h).border_l(1.5)),
      dash(div().absolute().left(r.x2).top(r.y2).w(RUN_X - r.x2).h(0).border_t(1.5)),
      div().absolute().left(r.x2 - 1).top(r.rise).w(2).h(r.y2 - r.rise + 1).bg(C.bright),
      // The direction, along the last line. Under a stop row (tight) the ◀ and the label
      // sit on the line in 12 px boxes, clear of the row's text.
      ...(arrow ? [div().absolute().left(arrow.x - 6).top(arrow.y - (r.tight ? 4 : 9)).px(1).text_size(12).when(Boolean(r.tight), (el) => el.line_height("12px")).text_color(C.bright).bg(C.bg).child("◀")] : []),
      // On the last line, so it names the target, not whatever the vertical passes.
      (({ left, top: y }) => div().absolute().left(left).top(r.tight ? y + 5 : y).px(2).text_size(12).when(Boolean(r.tight), (el) => el.line_height("12px")).text_color(C.bright).bg(C.bg).child("NEXT1"))(next1Label(r, RUN_X)),
    ];
  }

  readout(next, prev, n1Stop, n1, back1) {
    const line = (name, target, color) => h_flex().gap(6).min_w(0)
      .child(div().w(50).flex_none().text_color(C.dim).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(color).child(target));
    const where = (s) => (s ? `→ ${s.code} ${s.spaceName} · ${s.label}` : "—");
    return v_flex().gap(1).text_size(13).border_t(1).border_color(C.glow).pt(4)
      .child(line("NEXT", where(next), C.fg))
      .child(line("BACK", where(prev), C.fg))
      .child(line("NEXT1", next1Words(n1Stop, n1), n1Stop ? C.bright : C.dim))
      .child(line("BACK1", where(back1), C.fg));
  }
}
