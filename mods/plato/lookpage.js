// The look role: LOOK, a tab's details before you go there, as a modal dialog that the
// route role opens (the agenda's Space bar, or LOOK in a tab's right-click menu).
//   props { role: "look", codes: ["c1", "c2", ...], at, from }
// codes is the order the arrow keys step through (the line's NEXT order, or the waiting
// agents in NEXT1 order from SIGNALS); at is the card shown first. The card is drawn live
// from the world, so a tab that changes state while you look shows it. Enter goes there
// (plato.goto), Space or Esc closes, ⌘E sets the purpose (the route reads shared
// "plato.look" for which tab). A mod cannot read a terminal's text, so the card shows what
// was sent and the labels PLATO keeps. An agent's reply or question could come the same
// way, from a hook that sets a plato.* label, as the purpose hook does.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, spaces, panes, shared, setShared, run, appHome, readTextFile, checking } from "herdr";
import { C } from "./look.js";
import { stops } from "./line.js";
import { lookStep } from "./overview.js";
import { BEAT_MS, ownEnter } from "./logic.js";
import { dayKey, parseDay } from "./day.js";
import { lookCardFor } from "./lookdata.js";
import { dialogClosed, alive } from "./keys.js";
import { LINE, LOOK } from "./shared.js";

const DATA = "plato-data"; // the day files (recorder.js), under the app home
const PER_LINE = 64;       // characters per line in the card's value column at 760 px

export default class Look {
  init(_p, cx) {
    const p = props() ?? {};
    this.codes = Array.isArray(p.codes) ? p.codes : [];
    this.i = Math.min(Math.max(Number(p.at) || 0, 0), Math.max(this.codes.length - 1, 0));
    this.day = null;
    this.done = false;
    this.h = cx.focus_handle();
    this.h.focus();
    if (checking()) return;
    alive("look", cx); // so the route's toggle and CLOSE know this dialog is still open
    this.tell(cx);
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${appHome()}/${DATA}/${dayKey(Date.now())}.json`).catch(() => null);
      this.day = parseDay(text);
      cx.notify();
    });
  }

  /** The stop the card shows, live, or null when it has gone. */
  stop(all) {
    return all.find((s) => s.code === this.codes[this.i]) ?? null;
  }

  /** Tell the route which terminal LOOK shows, each BEAT_MS while open (⌘E sets its purpose). */
  tell(cx) {
    if (this.done) return;
    const all = stops(shared(LINE) ?? null, spaces(), panes());
    setShared(LOOK, { terminal: this.stop(all)?.terminal ?? null, at: Date.now() });
    cx.timer.after(BEAT_MS, (cx) => this.tell(cx));
  }

  close() {
    this.done = true;
    setShared(LOOK, null);
    dialogClosed("look");
    closeOverlay(props().overlay);
  }

  go() {
    const code = this.codes[this.i];
    this.close();
    if (code) run(`plato.goto:${code}`);
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    if (m.platform || m.control || m.alt) return;
    if (e.key === "escape" || e.key === "space" || e.key_char === " ") this.close();
    else if (e.key === "enter" && ownEnter(m)) this.go();
    else if (["left", "right", "up", "down"].includes(e.key)) {
      this.i = lookStep(this.codes.length, this.i, e.key);
      const all = stops(shared(LINE) ?? null, spaces(), panes());
      setShared(LOOK, { terminal: this.stop(all)?.terminal ?? null, at: Date.now() });
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  card(all, now) {
    return lookCardFor(this.stop(all), all, shared(LINE) ?? null, this.day, PER_LINE, now);
  }

  /** A key cap and what it does, as on the keyset; a click acts as the key does. */
  cap(id, key, word, act) {
    return h_flex().id(id).flex_none().gap(6).items_center().cursor_pointer()
      .on_click((_e, cx) => { act(); cx.notify(); })
      .child(div().px(5).border_1().border_color(C.dim).text_color(C.fg).child(key))
      .child(div().text_color(C.dim).child(word));
  }

  render() {
    const now = Date.now();
    const all = stops(shared(LINE) ?? null, spaces(), panes());
    const c = this.card(all, now);
    const tone = { bright: C.bright, fg: C.fg, dim: C.dim, text: C.fg };
    const base = v_flex().id("look").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(12).bg(C.bg).text_color(C.fg).border_1().border_color(C.fg);
    if (!c) {
      return base.child(div().text_color(C.dim).child("LOOK"))
        .child(div().child(`${this.codes[this.i] ?? "This tab"} has closed.`))
        .child(div().flex_1())
        .child(h_flex().gap(18).child(this.cap("look-close", "esc", "close", () => this.close())));
    }
    const n = this.codes.length;
    return base
      .child(h_flex().gap(12).items_center()
        .child(div().text_color(C.dim).child("LOOK"))
        .child(div().w(26).h(26).flex_none().rounded_full().border_1().border_color(tone[c.tone]).text_color(tone[c.tone])
          .flex().items_center().justify_center().child(c.letter))
        .child(div().text_size(18).font_weight(700).child(c.code))
        .child(div().flex_1().min_w(0).truncate().text_size(18).child(c.where))
        .child(div().flex_none().text_size(12).px(6).bg(tone[c.tone]).text_color(C.bg).child(c.badge)))
      .child(div().truncate().text_color(c.tone === "dim" ? C.dim : tone[c.tone]).child(c.sub))
      .child(div().h(1).w_full().bg(C.glow))
      .child(v_flex().id("look-rows").w_full().flex_1().min_h(0).overflow_y_scrollbar().gap(10).children(c.rows.map((r) =>
        h_flex().w_full().gap(16).items_start()
          .child(div().w(128).flex_none().text_color(C.dim).child(r.k))
          .child(v_flex().flex_1().min_w(0)
            .children(r.lines.map((l) => div().text_color(tone[r.tone]).child(l)))
            .when(Boolean(r.note), (el) => el.child(div().text_size(12).text_color(C.dim).child(r.note)))))))
      .child(div().h(1).w_full().bg(C.glow))
      .child(h_flex().gap(18).text_size(13).items_center()
        .child(this.cap("look-go", "↩", `go ${c.code}`, () => this.go()))
        .when(n > 1, (el) => el.child(div().text_color(C.dim).child(`←→↑↓ ${this.i + 1} of ${n}`)))
        .child(this.cap("look-close", "space", "close", () => this.close()))
        .child(div().text_color(C.dim).child("⌘E set purpose")));
  }
}
