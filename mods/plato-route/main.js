// plato-route: PLATO. Each space has a fixed letter (a slot in shared
// "plato.line"); each tab, or each pane of a split tab, is a stop. The current space shows its stops;
// the others show a dot per stop. NEXT1 is drawn before you press it, as a dashed
// yellow run; NEXT and BACK are named in the readout.
// Owns the letters (only this mod writes plato.line) and the moves.
//   props { mode: "line" | "map" }: the narrow line, or the map (mapview.js). The
//   layout keeps both in stacks; "map" (cmd-i) swaps them with layout.select: the line
//   copy opens the map, the map copy folds it back. While open, shared "plato.map" is
//   { at } and the map copy takes the keyboard.
//   commands: next, next1, back; map; jump; type:<keys> (into the open map or JUMP; <down>, <space>: named keys); sign-on, sign-off (open plato-sign as a dialog, or close
//   it), close-up (drop free slots and reletter); lab (plato.lab sends it while the map is
//   open: a terminal on the space under the cursor). In the map, sign-off is for the
//   space under the cursor, and the Space bar peeks at the stop under it (terminal.peek). While a sign page is open, NEXT, BACK,
//   NEXT1 and close-up (its U) go to it through shared "plato.sign.key" (dialogs get no
//   key commands).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, focused, machines, shared, setShared, run, setAgentOrder, nextCommand, checking, props, openOverlay, closeOverlay, terminals, appHome, readTextFile, watchFolder, window as appWindow, layout } from "herdr";
import { mapColumns, cursorAt, startCursor, jumpKey, codeCandidates } from "./map.js";
import { dayKey, parseDay } from "./day.js";
import * as mapview from "./mapview.js";
import { C, FONT, stateColor, stateWord, lit } from "./look.js";
import {
  ROW, markY, reconcile, spaceMoves, stops, stopKey, currentStop, nextStop, next1Agent,
  agentOrder, pushBack, backStop, prevStop, routeRows, next1Run, closeUp, closeUpStep, arrivalShown, labelOf,
  waitingLetters, next1Words, next1Label, next1Arrow, nextMark,
} from "./line.js";

const LINE = "plato.line";
const PENDING = "plato.pending";
const BACK = "plato.line.back";
const DIALOG = "plato.dialog.sign"; // { id, page, space, letter, at } while a sign page is open
const SIGN_KEY = "plato.sign.key";  // { key, at }: NEXT, BACK or NEXT1 for the sign page
const CLOSEUP = "plato.closeup";    // { space, at }: close up once this space has closed
const MAP = "plato.map";          // { at } while the map is open
const DATA = "plato-data";          // the timetable's day files, under the app home
const LINE_X = 14;   // the main line
const RUN_X = 236;    // the NEXT1 run's vertical
const TEXT_X = 30;    // space names
const JUMP_MS = 4000; // JUMP ends after this long without a key
const ALL = "plato.route.all"; // true while ALL shows every space's stops

/** Whether the layout node with this id is hidden (FOCUS hides the right column). */
function hiddenIn(tree, id) {
  if (!tree || typeof tree !== "object") return false;
  if (tree.id === id) return Boolean(tree.hidden);
  return (tree.children ?? []).some((c) => hiddenIn(c, id));
}

function ready(m) {
  const e = machines().find((x) => (x.name ?? null) === (m ?? null));
  return (e?.layout ?? (m == null ? "ready" : "unavailable")) === "ready";
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default class Route extends View {
  init(_p, cx) {
    this.movedFor = null;
    this.mapMode = (props()?.mode ?? "line") === "map";
    this.code = "";     // the map: the stop code typed so far
    this.cursor = null; // the map: { col, row }
    this.jump = null;   // JUMP (cmd-j) on the line: { buf, from, at } while typing a code
    this.h = cx.focus_handle();
    this.mapScroll = ScrollHandle.new(); // the map's rows, so the arrows can scroll it
    if (this.mapMode) {
      // Take the keyboard when the map opens. layout.select shows this copy a moment
      // after the line copy asks, so keep trying for a short while; a click also takes it.
      if (!checking()) cx.timer.every(200, (cx) => this.claim(cx));
      // The spaces' day words: today's day file (plato-timetable writes it), read when the map
      // opens and again only when the folder changes while it is open; never on a render.
      this.day = { key: null, events: null, dirty: true };
      if (!checking()) cx.spawn(async (cx) => {
        for (;;) {
          try { await watchFolder(`${appHome()}/${DATA}`); } catch { return; } // no folder yet: no day words
          this.day.dirty = true;
          if (shared(MAP)) { await this.readDay(); cx.notify(); }
        }
      });
    }
    // A sign page does not outlive a layout switch or a reload; forget a stale one, or
    // NEXT would keep going to it.
    if (!checking() && shared(DIALOG)) setShared(DIALOG, null);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          this.command(c, cx);
        } catch (e) {
          console.log(`plato-route: ${c} failed: ${e}`);
        }
        cx.notify();
      }
    });
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
    if (shared(DIALOG) && (c === "next" || c === "back" || c === "next1" || c === "close-up")) {
      // The page takes each key within a moment. One still waiting means the page is gone
      // (closed by something it could not see): forget it and do the move.
      const waiting = shared(SIGN_KEY);
      if (!waiting || Date.now() - waiting.at < 1000) return setShared(SIGN_KEY, { key: c === "close-up" ? "up" : c, at: Date.now() });
      setShared(DIALOG, null);
      setShared(SIGN_KEY, null);
    }
    if (c === "map") return this.mapMode ? this.fold() : this.open();
    // JUMP: the map's codes without the map (the map itself already takes codes).
    if (c === "jump") return this.mapMode ? null : this.jump ? this.endJump(null) : this.startJump(cx);
    // ALL: every space's stops on the route, or only the current space's again.
    if (c === "all") return this.mapMode ? null : setShared(ALL, !shared(ALL));
    // "type:c3" types into the open map as keys would (for scripts and checks); a key name in
    // angle brackets is that key: "type:<down><space>".
    const typed = c.match(/^type:(.*)$/);
    if (typed) {
      if (this.mapMode) for (const [, name, ch] of typed[1].matchAll(/<(\w+)>|(.)/gu)) {
        mapview.key(this, name ? { key: name, key_char: name === "space" ? " " : null } : { key: ch, key_char: ch }, this.columns ?? []);
      }
      // ... and into an open JUMP on the line the same way.
      else if (this.jump) for (const [, name, ch] of typed[1].matchAll(/<(\w+)>|(.)/gu)) {
        if (this.jump) this.jumpTyped({ key: name ?? ch }, cx);
      }
      return;
    }
    if (c === "lab") return this.lab();
    // In the map, SIGN-OFF is for the space under the cursor (none on a free letter).
    const under = this.mapMode && c === "sign-off" ? cursorAt(this.columns ?? [], this.mapCursor()).column : null;
    if (under && !under.space && !shared(DIALOG)) return;
    // In the map, a move or a sign page folds it back first, so you see where you went.
    if (this.mapMode && (["next", "back", "next1", "back1", "close-up"].includes(c) || /^sign-/.test(c))) this.fold();
    const sign = c.match(/^sign-(on|off)(?:[: ](.*))?$/);
    if (sign) return this.sign(sign[1], sign[2] ?? "", null, under?.space?.id ?? null);
    // CLOSE UP (cmd-u) opens a page that lists the moves; only its NEXT closes up the line.
    if (c === "close-up") return this.sign("up");
    const { all, cur } = this.world();
    if (c === "next") return this.go(nextStop(all, cur));
    // BACK walks the line backward (NEXT's mirror); BACK1 returns to where you were before.
    if (c === "back") return this.go(prevStop(all, cur));
    if (c === "back1") return this.go(backStop(shared(BACK), all, cur));
    if (c === "next1") {
      const a = next1Agent(agents(), focused()?.terminal ?? null);
      if (a) run("agent.focus", { terminal: a.address });
    }
  }

  /** Open the sign-on or sign-off page, or close the one open (PLATO dialogs toggle).
   *  "sign-on <text>" starts the name line with text. at: the space for sign-off (default:
   *  the one you are at). */
  sign(page, text, letter = null, at = null) {
    const open = shared(DIALOG);
    if (open) {
      setShared(DIALOG, null);
      return closeOverlay(open.id);
    }
    const space = at ?? focused()?.space ?? spaces().find((s) => s.active)?.id ?? null;
    if (page === "off" && !space) return;
    const id = openOverlay({ mod: "plato-sign", props: { page, space, text, letter }, kind: "dialog", modal: true, width: 640, height: 430 });
    setShared(DIALOG, { id, page, space, letter, at: Date.now() });
  }

  /** LAB. In the map: fold back and start a terminal in a new tab on the space under the
   *  cursor. On the line (the map was closed and plato.map is stale): the LAB menu. */
  lab() {
    if (!this.mapMode) {
      if (shared(MAP)) setShared(MAP, null);
      return openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
    }
    const t = cursorAt(this.columns ?? [], this.mapCursor()).column;
    if (!t?.space) return;
    this.fold();
    run("space.select", { id: t.space.id });
    run("tab.new", { space: t.space.id, folder: t.space.folder });
  }

  // ---- the map ----

  /** Line ⇄ map: show the map in both stacks (appendix F). */
  open() {
    run("layout.select", { stack: "plato-main", child: "map-view" });
    run("layout.select", { stack: "box", child: "box-map" });
    setShared(MAP, { at: Date.now() });
  }

  /** JUMP: take the keyboard for a code. Focus moves a moment later (not while drawing). */
  startJump(cx) {
    this.jump = { buf: "", from: focused()?.pane ?? null, at: Date.now() };
    cx.timer.after(0, () => this.h.focus());
    this.armJump(cx);
  }

  /** A few seconds without a key ends JUMP, as if Esc was pressed. */
  armJump(cx) {
    const at = this.jump.at;
    cx.timer.after(JUMP_MS + 50, (cx) => { if (this.jump && this.jump.at === at) { this.endJump(null); cx.notify(); } });
  }

  /** End JUMP: go to the stop, or (null) give the keyboard back to where it was. */
  endJump(stop) {
    const from = this.jump?.from ?? null;
    this.jump = null;
    if (stop) return this.go(stop);
    if (from) run("pane.focus", { pane: from });
  }

  /** The line and FOCUS views take JUMP's keys while it is on. */
  jumpable(el) {
    return el.track_focus(this.h).on_key_down((e, cx) => {
      if (!this.jump) return;
      this.jumpTyped(e, cx);
      cx.stop_propagation();
      cx.notify();
    });
  }

  /** One key during JUMP: go, cancel, or keep typing. */
  jumpTyped(e, cx) {
    const w = this.world();
    const r = jumpKey(this.jump.buf, e, mapColumns(w.line, w.sp, w.all));
    if (r.go) this.endJump(r.go);
    else if (r.cancel) this.endJump(null);
    else { this.jump = { ...this.jump, buf: r.buf, at: Date.now() }; this.armJump(cx); }
  }

  /** JUMP's line above the readout: what you typed, and where it goes. */
  jumpLine(w) {
    const buf = this.jump.buf;
    const columns = mapColumns(w.line, w.sp, w.all);
    const slot = buf.length === 1 ? columns.find((t) => t.letter === buf) : null;
    const first = buf.length > 1 ? codeCandidates(buf, columns)[0] : null;
    const match = slot ? `${slot.letter} ${slot.name} · Enter goes`
      : first ? `${first.code} ${first.spaceName} · ${first.label}`
      : buf ? "no such tab" : "type a code: c3";
    return h_flex().gap(6).min_w(0).text_size(13)
      .child(this.tag("JUMP"))
      .child(div().flex_none().text_color(C.bright).child(`${buf}_`))
      .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(match));
  }

  /** Fold the map back to the line, and give the keyboard back to the current stop. */
  fold() {
    if (!this.mapMode) return;
    run("layout.select", { stack: "plato-main", child: "line-view" });
    run("layout.select", { stack: "box", child: "box-line" });
    if (shared(MAP)) setShared(MAP, null);
    this.code = "";
    this.cursor = null;
    this.peek = null;
    const p = focused()?.pane;
    if (p) run("pane.focus", { pane: p });
  }

  /** The map's cursor. Before the map has drawn since it opened, it is where it will
   *  start (the stop you are at), on lines made now, never a stale a1. */
  mapCursor() {
    if (!this.cursor) {
      const w = this.world();
      this.columns = mapColumns(w.line, w.sp, w.all);
      this.cursor = startCursor(this.columns, w.cur);
    }
    return this.cursor;
  }

  /** The Space bar in the map: peek at the stop under the cursor over the map. */
  mapPeek(stop) {
    if (!stop?.terminal) return;
    this.peek = { terminal: stop.terminal, at: Date.now(), seen: false, from: focused()?.pane ?? null };
    run("terminal.peek", { terminal: stop.terminal });
  }

  /** While a peek from the map is open, its terminal has the keyboard (focused() reports it
   *  with pane null). When it goes: if its "go to" focused that terminal's pane, fold back so
   *  you see it there; else (closed) take the keyboard back for the map. A peek at the
   *  stop you are at gives the keyboard back to the same pane either way: the map stays. */
  watchPeek(y) {
    const p = this.peek, f = focused();
    if (!y || this.h.is_focused()) { this.peek = null; return; }
    if (f && f.pane == null && f.terminal === p.terminal) { p.seen = true; return; }
    if (!p.seen && Date.now() - p.at < 1500) return;
    this.peek = null;
    if (p.seen && f?.pane && f.pane !== p.from && f.terminal === p.terminal) return this.fold();
    this.h.focus();
  }

  showCascade(cx) {
    if (this.cascade !== "hide") return;
    this.cascade = "run";
    cx.notify();
  }

  /** Today's day file, for the spaces' "ran … today" words. */
  async readDay() {
    const key = dayKey(Date.now());
    this.day.dirty = false;
    const text = await readTextFile(`${appHome()}/${DATA}/${key}.json`).catch(() => null);
    this.day = { key, events: parseDay(text), dirty: this.day.dirty };
  }

  /** The map copy takes the keyboard for a moment after the map opens, and back after a peek.
   *  It also reads the day file when the map opens, if it changed or the day turned. */
  claim(cx) {
    this.showCascade(cx);
    const y = shared(MAP);
    if (y && this.dayFor !== y.at) {
      this.dayFor = y.at;
      if (this.day.dirty || this.day.key !== dayKey(Date.now())) cx.spawn(async (cx) => { await this.readDay(); cx.notify(); });
    }
    if (this.peek) return this.watchPeek(y);
    if (!y || this.h.is_focused() || Date.now() - y.at > 1500) return;
    if (this.claimed !== y.at) { this.claimed = y.at; this.code = ""; this.cursor = null; cx.notify(); }
    this.h.focus();
  }

  mapGo(stop) {
    this.fold();
    this.go(stop);
  }

  /** A free letter in the map: fold back and open sign-on for that letter. */
  mapSignOn(letter) {
    this.fold();
    if (shared(DIALOG)) return;
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
      const list = shared(BACK) ?? [];
      const next = pushBack(list, stopKey(cur));
      if (next !== list) setShared(BACK, next);
    }
  }

  render(cx) {
    this.sync();
    const w = this.world();
    const ag = agents();
    setAgentOrder(agentOrder(ag));
    if (this.mapMode) return this.mapFrame(w, ag, cx);
    if (hiddenIn(layout(), "right")) return this.jumpable(this.slimFrame(w, ag));

    const space = w.sp.find((s) => s.id === focused()?.space) ?? w.sp.find((s) => s.active);
    const all = Boolean(shared(ALL));
    const rows = routeRows(w.line, w.sp, w.all, space?.id ?? null, all);
    const next = nextStop(w.all, w.cur);
    const n1 = next1Agent(ag, focused()?.terminal ?? null);
    const n1Stop = n1 ? w.all.find((s) => s.pane === n1.pane) ?? null : null;
    const prev = prevStop(w.all, w.cur);
    const back1 = backStop(shared(BACK), w.all, w.cur);
    const run1 = n1Stop ? next1Run(rows, stopKey(w.cur), stopKey(n1Stop)) : null;
    // A space with an agent that needs you gets a WAITING tag in reverse video: a mark that
    // shows without motion or color, so it reads in every glow and with motion turned off.
    this.waits = waitingLetters(ag, w.all, focused()?.terminal ?? null);
    this.n1Key = run1 ? stopKey(n1Stop) : null;
    const total = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0;

    // The run goes under the rows, so it never strikes through a stop's name.
    const els = [...this.lines(rows), ...this.nextMark(nextMark(rows, stopKey(w.cur), stopKey(next))), ...this.run(run1), ...rows.map((r, i) => this.row(r, i, w.cur))];
    const map = div().id("route-map").relative().w_full().h(total).children(els);
    return this.jumpable(this.frame(v_flex().flex_1().min_h(0).gap(8)
      .child(v_flex().id("route-scroll").flex_1().min_h(0).overflow_y_scrollbar().child(map))
      .when(Boolean(this.jump), (el) => el.child(this.jumpLine(w)))
      .child(this.readout(next, prev, n1Stop, n1, back1))
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
          .child(this.tag("WAITING")).child(div().child("its space")))), "ROUTE", this.routeNote(all)));
  }

  mapFrame(w, ag, cx) {
    // The opening cascade, once per opening: this render draws the cards hidden, the next
    // fades them in row by row with native transitions (mapview.js). The next render comes
    // from a timer here, or claim() (every 200 ms) if a render that came first dropped it.
    // Only while the window is active: in the background Herdr draws few frames, so the fade
    // would stall with the cards hidden (seen when a script opened the map).
    const y = shared(MAP);
    if (y && this.cascadeFor !== y.at && !checking()) {
      this.cascadeFor = y.at;
      this.cascade = appWindow().active ? "hide" : "run";
      if (this.cascade === "hide") cx.timer.after(16, (cx) => this.showCascade(cx));
    }
    const n1 = next1Agent(ag, focused()?.terminal ?? null);
    const yw = {
      columns: mapColumns(w.line, w.sp, w.all),
      line: w.line,
      day: this.day?.events ?? null,
      cur: w.cur,
      next: nextStop(w.all, w.cur),
      prev: prevStop(w.all, w.cur),
      n1,
      n1Stop: n1 ? w.all.find((s) => s.pane === n1.pane) ?? null : null,
      back1: backStop(shared(BACK), w.all, w.cur),
    };
    this.columns = yw.columns;
    return div().id("map").size_full().track_focus(this.h)
      .on_key_down((e, cx) => { if (mapview.key(this, e, this.columns ?? [])) { cx.stop_propagation(); cx.notify(); } })
      .on_mouse_down("left", () => this.h.focus())
      .child(this.frame(mapview.draw(this, yw), "MAP", "⌘I or Esc closes the map"));
  }

  /** Focus mode (FOCUS hides the right column and narrows this block): the line as a column
   *  of lettered space squares, as on the full route. The current space is filled, with its stop number under it; a space
   *  with an agent waiting for you pulses. A click goes to that space. This copy stays
   *  shown, so NEXT, BACK, NEXT1 and the map keep working. */
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
        .when(!here && waiting.has(slot.letter), (el) => el.child(this.tag("WAIT")));
    });
    if (this.jump) items.push(v_flex().items_center().gap(2).child(this.tag("JUMP")).child(div().text_size(14).text_color(C.bright).child(`${this.jump.buf}_`)));
    return v_flex().id("route").size_full().font_family(FONT).text_size(14).bg(C.bg).text_color(C.fg).p(2).child(
      v_flex().flex_1().min_h(0).border_1().border_color(C.fg).items_center().py(8).gap(10).children(items));
  }

  /** The route's title note: ALL (in reverse video while it is on) and MAP, with their keys. */
  routeNote(all) {
    const allEl = div().px(all ? 3 : 0).child("ALL ⌘⇧I");
    return h_flex().gap(12).child(all ? allEl.bg(C.fg).text_color(C.bg) : allEl).child(div().child("MAP ⌘I"));
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
    // A branch down each space's stops (only the current one's, unless ALL is on).
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
    // type in the map, and it stays whole when a long name is cut.
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
    // A background, so a branch under the name (ALL) never strikes through it.
    else label = (was ? label.text_color(C.bright) : label).bg(C.bg).cursor_pointer().hover((s) => s.bg(C.glow));
    if (space && !current) label = label.on_click(() => this.goSpace(space));
    // WAITING follows the name, so it reads as part of it. A long name truncates first.
    const row = h_flex().absolute().left(TEXT_X).top(7).max_w(RUN_X - TEXT_X - 12).gap(6).items_center()
      .child(label).when(waits, (el) => el.child(this.tag("WAITING")));
    return box.child(mark).child(row);
  }

  /** A legend mark, drawn like the route's own: a space square (filled, hollow or
   *  dashed), a stop lamp (filled or hollow), or the ring of the stop you are at. */
  swatch(shape, kind) {
    if (shape === "ring") {
      const icon = (name) => svg(`mods/plato-route/${name}.svg`).absolute().left(0).top(0).size(10).text_color(C.fg);
      return div().relative().w(10).h(10).flex_none().child(icon("here-ring")).child(icon("here-lit"));
    }
    let m = div().w(8).h(8).flex_none().border_1().border_color(C.fg);
    if (shape === "round") m = m.rounded_full();
    if (kind === "fill") m = m.bg(C.fg);
    if (kind === "bright") m = m.border_color(C.bright).bg(C.bright);
    if (kind === "dashed") m = m.border_dashed().border_color(C.dim);
    return m;
  }

  /** A small reverse-video tag ("WAITING", "WAIT"), as the map's cards use. */
  tag(word) {
    return div().flex_none().px(3).text_size(11).line_height("14px").bg(C.bright).text_color(C.bg).child(word);
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
    const hit = div().id(`dot-${stopKey(s)}`).absolute().left(x - 6).top(0).w(12).h(ROW.dots).cursor_pointer().on_click(() => this.go(s));
    return div().children([d, hit]);
  }

  stop(box, s, isCur) {
    const x = ROW.stopX;
    const col = stateColor(s.status);
    const on = lit(s.status);
    // A stop is always a round lamp (squares are spaces). Where you are, a ring
    // around the lamp says so, and the lamp inside still shows the state.
    // The ring and the lamp are two drawings of the same 16 px box, so they stay centered
    // on each other at any zoom (two boxes of different sizes round to different pixels).
    const icon = (name, color) => svg(`mods/plato-route/${name}.svg`).absolute().left(0).top(0).size(16).text_color(color);
    let mark = isCur
      ? div().absolute().left(x - 4).top(ROW.markY - 8).w(16).h(16).rounded_full().bg(C.bg)
        .child(icon("here-ring", C.fg)).child(icon(on ? "here-lit" : "here-unlit", col))
      : div().absolute().left(x - 1).top(ROW.markY - 5).w(10).h(10).rounded_full().border_1().border_color(col).bg(on ? col : C.bg);
    if (!isCur && s.status === "blocked") mark = mark.loop("opacity", { from: 0.4, to: 1, period: 1100 });
    // Just arrived (until 4 s pass or a prompt is sent): say from where, as the strip does.
    const a = shared("plato.arrival");
    const arrived = isCur && arrivalShown(a, stopKey(s), labelOf(terminals(), s.terminal, "plato.last_at"), Date.now());
    const sub = arrived ? `◀ arrived from ${a.from.code}` : isCur ? `${s.program} · you are here` : `${s.program} · ${stateWord(s.status)}`;
    let text = v_flex().id(`pl-${stopKey(s)}`).absolute().left(x + 14).top(6).w(RUN_X - x - 24).px(3)
      .child(div().truncate().child(`${s.code.slice(1)} ${s.label}`))
      .child(div().text_size(12).line_height("15px").truncate().text_color(isCur ? C.bright : stateColor(s.status)).child(sub));
    text = isCur ? text.bg(C.glow).border_1().border_color(C.fg) : text.cursor_pointer().hover((st) => st.bg(C.glow)).on_click(() => this.go(s));
    return box.children([mark, text]);
  }

  /** ALL: another space's stop as one line: lamp, code, program (claude, codex, zsh)
   *  and state. Titles are often too long for one line; the current space shows them. */
  compactStop(box, s) {
    const x = ROW.stopX;
    const col = stateColor(s.status);
    const on = lit(s.status);
    let mark = div().absolute().left(x).top(ROW.compactMarkY - 4).w(8).h(8).rounded_full().border_1().border_color(col).bg(on ? col : C.bg);
    if (s.status === "blocked") mark = mark.loop("opacity", { from: 0.4, to: 1, period: 1100 });
    let text = h_flex().id(`pl-${stopKey(s)}`).absolute().left(x + 14).top(2).w(RUN_X - x - 24).px(3).gap(6).min_w(0)
      .text_size(13).line_height("19px").cursor_pointer().hover((st) => st.bg(C.glow)).on_click(() => this.go(s))
      .child(div().flex_none().child(s.code))
      .child(div().flex_1().min_w(0).truncate().child(s.program || s.label))
      .child(div().flex_none().text_color(col).child(stateWord(s.status)));
    return box.children([mark, text]);
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
