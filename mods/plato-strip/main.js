// plato-strip: the bottom pane header. One copy per pane says which stop it is:
// the space's badge, the stop code (e1, c3.2 in a split tab),
// space › tab › program, "sent 12m ago" (its plato.last_at label), and the state with
// how long it has been in it. In reverse video with "◀ arrived from e1" after an arrival,
// until 4 s pass or a prompt is sent there. (Reverse video, not the bright color: in the
// paper-white glow, bright and normal text are almost the same.)
// Reads the letters from shared "plato.line" (plato-route writes them) and the arrival
// from shared "plato.arrival" (plato-nowat writes it); writes nothing.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, shared, props, terminals } from "herdr";
import { C, FONT, stateColor, stateWord } from "./look.js";
import { letterOf, stopCode, tabLabel, programWord, duration, labelOf, lastSent, arrivalShown } from "./line.js";

export default class Strip extends View {
  init(_p, cx) {
    this.tick(cx);
  }

  /** Redraw on the minute, for the time in the state. */
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    const id = props()?.pane;
    const all = panes();
    const p = all.find((x) => x.pane === id);
    const space = p && spaces().find((s) => s.tabs.some((t) => t.id === p.tab));
    const tab = space?.tabs.find((t) => t.id === p.tab);
    const base = h_flex().id("strip").size_full().font_family(FONT).text_size(12).bg(C.bg).border_t(1).px(8).gap(8).items_center();
    if (!p || !tab) return base.border_color(C.glow);
    const letter = letterOf(shared("plato.line") ?? null, space.id);
    const mine = all.filter((x) => x.tab === p.tab);
    const code = stopCode(letter, tab.index, mine.length > 1 ? mine.indexOf(p) + 1 : null);
    const on = p.focused;
    const now = Date.now();
    const terms = terminals();
    const arrival = shared("plato.arrival");
    const arrived = arrivalShown(arrival, p.pane, labelOf(terms, p.terminal, "plato.last_at"), now); // a stop's key is its pane
    const fg = arrived ? C.bg : on ? C.fg : C.dim;
    const since = p.status === "working" ? tab.working_since : tab.changed_at;
    const time = duration(since, now);
    const sent = lastSent(terms, p.terminal)?.at;
    const badge = div().w(18).h(18).flex_none().rounded_full().border_1().border_color(fg)
      .flex().items_center().justify_center().text_size(11).text_color(fg).child(letter ?? "?");
    const sep = () => div().text_color(arrived ? C.bg : C.dim).child("›");
    return base.border_color(arrived ? C.fg : on ? C.fg : C.glow).text_color(fg)
      .when(arrived, (el) => el.bg(C.fg))
      .child(badge)
      .child(div().flex_none().font_weight(700).text_color(arrived ? C.bg : on ? C.bright : C.dim).child(code))
      .child(h_flex().flex_1().min_w(0).gap(6).overflow_hidden()
        .child(div().flex_none().child(space.name))
        .child(sep())
        .child(div().min_w(0).truncate().child(`${tab.index} ${tabLabel(tab, p)}`))
        .child(sep())
        .child(div().flex_none().child(programWord(p.program))))
      .when(arrived, (el) => el.child(div().flex_none().font_weight(700).text_color(C.bg).child(`◀ arrived from ${arrival.from.code}`)))
      .when(!arrived && sent != null, (el) => el.child(div().flex_none().text_color(C.dim).child(`sent ${duration(sent, now) === "now" ? "just now" : `${duration(sent, now)} ago`}`)))
      .child(div().flex_none().text_color(arrived ? C.bg : on ? stateColor(p.status) : C.dim).child(time ? `${stateWord(p.status)} ${time}` : stateWord(p.status)));
  }
}
