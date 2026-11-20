// plato-nowat: NOW AT, under SIGNALS in the right column. Two lines: where your keys go
// now (badge, stop code, space, tab and state), and the last prompt you sent there
// (labels plato.last and plato.last_at on its terminal, written by each agent's hook).
// When the current stop changes it sets shared "plato.arrival" = {from, to, at},
// which the arrival banner and the yellow strip show; the border turns yellow too.
// While SIGN-ON is open it says that keys go to SIGN-ON only.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, terminals, shared, setShared, checking } from "herdr";
import { C, FONT, stateColor, stateWord } from "./look.js";
import { stops, currentStop, stopKey, labelOf, lastSent, arrivalFor, arrivalShown, duration } from "./line.js";

const ARRIVAL = "plato.arrival";

export default class NowAt extends View {
  init(_p, cx) {
    this.prev = null;
    this.tick(cx);
  }

  /** Redraw on the minute, for "you last sent here · 12m ago". */
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    const now = Date.now();
    const all = stops(shared("plato.line") ?? null, spaces(), panes());
    const cur = currentStop(all, focused());
    const terms = terminals();
    const lastAt = labelOf(terms, cur?.terminal, "plato.last_at");
    if (cur && !checking()) {
      const a = arrivalFor(this.prev, cur, now, lastAt);
      if (a) setShared(ARRIVAL, a);
      this.prev = cur;
    }
    const arrived = arrivalShown(shared(ARRIVAL), stopKey(cur), lastAt, now);
    const sign = shared("plato.dialog.sign");
    let body;
    if (sign?.page === "on") body = this.signing(sign);
    else if (!cur) body = div().text_color(C.dim).child("No tab has the keyboard.");
    else body = this.stop(cur, lastSent(terms, cur.terminal), now);
    const edge = arrived || sign ? C.bright : C.fg;
    return v_flex().id("nowat").size_full().font_family(FONT).text_size(14).line_height("19px").bg(C.bg).text_color(C.fg).p(2).child(
      v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
        v_flex().flex_1().min_h(0).border_1().border_color(edge).px(6).py(3).gap(4).overflow_hidden()
          .child(h_flex().justify_between()
            .child(div().text_color(C.dim).child("NOW AT"))
            .child(div().text_size(12).text_color(arrived ? C.bright : C.dim).child(arrived ? "sending to · changed" : sign ? "signing on" : "sending to")))
          .child(body)));
  }

  badge(letter, dashed) {
    const r = div().w(20).h(20).flex_none().rounded_full().border_1().border_color(C.fg)
      .flex().items_center().justify_center().text_size(12).text_color(C.bright).child(letter ?? "?");
    return dashed ? r.border_dashed() : r;
  }

  stop(cur, last, now) {
    const head = h_flex().gap(8).items_center().min_w(0)
      .child(this.badge(cur.letter, false))
      .child(div().flex_none().font_weight(700).text_color(C.bright).child(cur.code))
      .child(div().flex_1().min_w(0).truncate().child(`${cur.spaceName} · ${cur.label}`))
      .child(div().flex_none().text_size(12).text_color(stateColor(cur.status)).child(stateWord(cur.status)));
    const ago = last?.at ? duration(last.at, now) : "";
    const when = ago ? (ago === "now" ? "sent just now" : `sent ${ago} ago`) : "sent";
    const sent = last
      ? h_flex().gap(6).min_w(0).text_size(12).child(div().flex_none().text_color(C.dim).child(`${when}:`)).child(div().flex_1().min_w(0).truncate().child(last.text || "—"))
      : div().text_size(12).text_color(C.dim).child("no prompt sent here yet");
    return v_flex().gap(3).min_w(0).child(head).child(sent);
  }

  signing(sign) {
    return v_flex().gap(3)
      .child(h_flex().gap(8).items_center()
        .child(this.badge(sign.letter, true))
        .child(div().flex_1().min_w(0).truncate().text_color(C.bright).child(sign.letter ? `signing on at ${sign.letter}` : "signing on · no letter free")))
      .child(div().text_size(12).text_color(C.dim).child("keys go to SIGN-ON only"));
  }
}
