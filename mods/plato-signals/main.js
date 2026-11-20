// plato-signals: two panels of the right column.
//   props { mode: "signals" | "totals" }
//   "signals" (the top of the right column, always shown): SIGNALS lists the agents that
//   need you in NEXT1 order (blocked, longest waiting first; then done but not seen, oldest
//   first), without the one you are at. The first row is where NEXT1 goes.
//   "totals" (in place of TODAY and FILES while the map is open): MAP TOTALS counts
//   spaces, free letters, stops and how many are waiting, working and idle.
// Reads only; writes nothing.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, shared, focused, props } from "herdr";
import { C, FONT } from "./look.js";
import { stops, duration } from "./line.js";
import { signalRows, mapTotals, stateSince } from "./map.js";

export default class Signals extends View {
  init(_p, cx) {
    this.tick(cx);
  }

  /** Redraw on the minute, for the waiting times. */
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    const now = Date.now();
    const sp = spaces();
    const line = shared("plato.line") ?? null;
    const all = stops(line, sp, panes());
    const base = v_flex().id("signals").size_full().font_family(FONT).text_size(14).line_height("19px").bg(C.bg).text_color(C.fg);
    if ((props()?.mode ?? "signals") === "totals") {
      return base.child(this.panel("MAP TOTALS", "right now", this.totals(mapTotals(line, all, sp), now)).flex_1().min_h(0));
    }
    const here = focused()?.terminal ?? null;
    const rows = signalRows(agents(), all).filter((r) => r.agent.address !== here);
    return base.child(this.panel("SIGNALS", rows.length ? `${rows.length} need${rows.length === 1 ? "s" : ""} you` : "NEXT1 order", this.signals(rows, sp, now)).flex_1().min_h(0));
  }

  panel(title, note, body) {
    return v_flex().p(2).child(
      v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
        v_flex().flex_1().min_h(0).border_1().border_color(C.fg).px(6).py(3).gap(4).overflow_hidden()
          .child(h_flex().justify_between()
            .child(div().text_color(C.dim).child(title))
            .child(div().text_size(12).text_color(C.dim).child(note)))
          .child(body)));
  }

  badge(letter, inverse) {
    return div().w(20).h(20).flex_none().rounded_full().border_1().border_color(inverse ? C.bg : C.fg)
      .flex().items_center().justify_center().text_size(12).text_color(inverse ? C.bg : C.bright).child(letter ?? "?");
  }

  signals(rows, sp, now) {
    if (!rows.length) return div().text_color(C.dim).child("Nothing waiting. No agent needs you now.");
    const list = rows.map(({ agent, stop }, i) => {
      const since = stop ? stateSince(stop, sp) : null;
      const wait = since != null ? duration(since, now) : "";
      const word = agent.status === "blocked" ? "needs you" : "done · unseen";
      const first = i === 0;
      // The first is where NEXT1 goes: reverse video, so it shows in every glow.
      return h_flex().id(`sig-${agent.address}`).gap(8).items_center().px(3).min_w(0)
        .when(first, (el) => el.bg(C.bright).text_color(C.bg))
        .child(this.badge(stop?.letter ?? null, first))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().child(`${stop?.code ?? "?"} ${stop?.label ?? agent.tab_name}`))
          .child(div().text_size(12).line_height("15px").truncate().text_color(first ? C.bg : agent.status === "blocked" ? C.bright : C.fg)
            .child(`${first ? "NEXT1 · " : ""}${word}${wait ? ` · ${wait}` : ""}`)));
    });
    return v_flex().id("sig-list").flex_1().min_h(0).gap(4).overflow_y_scrollbar().children(list);
  }

  totals(t, now) {
    const row = (mark, name, n, strong) => h_flex().gap(8)
      .child(div().w(16).flex_none().text_color(strong ? C.bright : C.dim).child(mark))
      .child(div().flex_1().min_w(0).truncate().child(name))
      .child(div().flex_none().text_color(strong ? C.bright : C.fg).child(String(n)));
    const since = (x) => (x ? `${x.stop.code} ${x.stop.label} · ${duration(x.since, now)}` : "—");
    return v_flex().gap(1)
      .child(row("■", "spaces", t.spaces))
      .child(row("□", "free letters", t.free))
      .child(row("·", "tabs", t.tabs))
      .child(row("◉", "waiting on you", t.waiting, t.waiting > 0))
      .child(row("●", "working", t.working))
      .child(row("○", "idle", t.idle))
      .child(v_flex().pt(4).text_size(12).line_height("15px").text_color(C.dim)
        .child(div().truncate().child(`longest running: ${since(t.longest)}`))
        .child(div().truncate().child(`oldest idle: ${since(t.oldestIdle)}`)));
  }
}
