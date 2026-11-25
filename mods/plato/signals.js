// The signals role: two panels of the right column.
//   props { role: "signals", mode: "signals" | "due" }
//   "signals" (the top of the right column, always shown): SIGNALS lists the agents that
//   need you in NEXT1 order (blocked, longest waiting first; then done but not seen, oldest
//   first), without the one you are at. The first row is where NEXT1 goes.
//   "due" (in place of TODAY and FILES while REVIEW is open): DUE lists the spaces with
//   a due date, soonest first (a late one in reverse video, two days or fewer bright). Under
//   it, RUNNING lists the agents working now, longest first, with your purpose, the time and
//   the progress, and one line for the idle ones. Like SIGNALS, both show now, whatever day
//   REVIEW shows.
// Reads only; writes nothing. A click on a SIGNALS row goes to that agent (plato.go).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, shared, focused, props, run, openOverlay, terminals } from "herdr";
import { C, FONT } from "./look.js";
import { stops, duration, currentStop } from "./line.js";
import { signalRows, stateSince, runningRows } from "./overview.js";
import { tabMenu } from "./logic.js";
import { keyText } from "./keys.js";
import { dueList, dueWords } from "./day.js";
import { LINE } from "./shared.js";

export default class Signals {
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
    const line = shared(LINE) ?? null;
    const all = stops(line, sp, panes());
    const base = v_flex().id("signals").size_full().font_family(FONT).text_size(14).line_height("19px").bg(C.bg).text_color(C.fg);
    if ((props()?.mode ?? "signals") === "due") {
      const labels = new Map(terminals().map((t) => [t.address, t.labels ?? {}]));
      const run = runningRows(all, sp, labels, now);
      return base
        .child(this.panel("DUE", "soonest first", this.due(dueList(line, sp, now))).flex_none())
        .child(this.panel("RUNNING", run.rows.length ? `${run.rows.length} working · longest first` : "", this.running(run)).flex_1().min_h(0));
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
        .when(!first, (el) => el.hover((st) => st.bg(C.glow)))
        // A click goes to this agent by NEXT1's own move (the route's go command).
        .cursor_pointer().on_click(() => run(`plato.go:${agent.address}`))
        // A right-click opens the tab's menu, as on the route; its LOOK steps in NEXT1 order.
        .when(Boolean(stop), (el) => el.on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          const current = currentStop(stops(shared(LINE) ?? null, sp, panes()), focused())?.code === stop.code;
          openOverlay({ mod: "plato", kind: "popup", width: 240, props: { role: "menu", items: tabMenu({ current }), target: { code: stop.code, from: "signals" } } });
        }))
        .child(this.badge(stop?.letter ?? null, first))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().child(`${stop?.code ?? "?"} ${stop?.label ?? agent.tab_name}`))
          .child(div().text_size(12).line_height("15px").truncate().text_color(first ? C.bg : agent.status === "blocked" ? C.bright : C.fg)
            .child(`${first ? "NEXT1 · " : ""}${word}${wait ? ` · ${wait}` : ""}`)));
    });
    return v_flex().id("sig-list").flex_1().min_h(0).gap(4).overflow_y_scrollbar().children(list);
  }

  /** The DUE list: ◆, the letter and name, and the due words. The words say late or today,
   *  so the tone is not color alone. */
  due(list) {
    if (!list.length) return div().text_color(C.dim).child(`No due dates. SET DUE ${keyText({ cmd: "due" })} adds one.`);
    return v_flex().gap(2).children(list.map((d) => {
      const words = div().flex_none().child(dueWords(d));
      return h_flex().gap(8).min_w(0)
        .child(div().flex_none().text_color(d.days <= 2 ? C.bright : C.dim).child("◆"))
        .child(div().flex_1().min_w(0).truncate().child(`${d.letter} ${d.name}`))
        .child(d.days < 0 ? words.px(3).bg(C.fg).text_color(C.bg) : words.text_color(d.days <= 2 ? C.bright : C.fg));
    }));
  }

  /** RUNNING: the working agents now, longest first (runningRows: the code, your purpose or the
   *  tab's name, the time running and the progress), in a list that scrolls, and the idle line. */
  running(r) {
    const rows = r.rows.map((x, i) => v_flex().id(`run-${i}`).min_w(0)
      .child(h_flex().gap(6).min_w(0)
        .child(div().flex_none().text_color(C.bright).child(x.code))
        .child(div().flex_1().min_w(0).truncate().text_color(C.text).child(x.words)))
      .child(h_flex().gap(8).text_size(12).line_height("15px").text_color(C.dim)
        .child(div().child(`running ${x.time}`))
        .when(Boolean(x.tasks), (el) => el.child(div().child(x.tasks)))));
    return v_flex().flex_1().min_h(0).gap(6)
      .child(v_flex().id("run-list").flex_1().min_h(0).gap(8).overflow_y_scrollbar()
        .children(rows.length ? rows : [div().text_color(C.dim).child("No agent is working.")]))
      .child(div().flex_none().pt(4).border_t(1).border_color(C.glow).text_size(12).line_height("15px").text_color(C.dim).truncate().child(r.idle));
  }

}
