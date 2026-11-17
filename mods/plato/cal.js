// CAL: the month in the layout of Unix cal. < and > step months; the title
// returns to this month. A click anywhere else opens three months in a dialog
// (calview.js). A timer redraws at the next midnight.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run } from "herdr";
import { C, box, inv } from "./kit.js";
import { perform } from "./keys.js";
import { calMonth, calHeight } from "./logic.js";

const pad = (d) => (d === null ? "  " : String(d).padStart(2, " "));

/** One month as a cal grid: the day names, then the weeks, today in reverse video. */
export function monthGrid(m, id) {
  const week = (w, i) =>
    h_flex().id(`${id}-wk-${i}`).children(w.map((d) => {
      const cell = div().w(26).flex_none().text_right().child(pad(d));
      return d !== null && d === m.today ? inv(cell) : cell;
    }));
  return v_flex().items_start()
    .child(h_flex().children(m.header.split(" ").map((d) => div().w(26).flex_none().text_right().text_color(C.dim).child(d))))
    .children(m.weeks.map(week));
}

export default class Cal {
  init(_p, cx) {
    this.offset = 0;
    this.midnight(cx);
  }

  midnight(cx) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    cx.timer.after(next - now, (cx) => { cx.notify(); this.midnight(cx); });
  }

  render() {
    const now = new Date();
    const at = new Date(now.getFullYear(), now.getMonth() + this.offset, 1);
    const m = calMonth(at.getFullYear(), at.getMonth(), { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() });
    const px = calHeight(m.weeks.length);
    if (px !== this.px) { this.px = px; run("layout.resize", { id: "cal", px }); }
    const step = (id, text, delta) =>
      div().id(id).px(4).cursor_pointer().text_color(C.dim).hover((s) => s.text_color(C.fg))
        .on_click((_e, cx) => { this.offset += delta; cx.stop_propagation(); cx.notify(); }).child(text);
    const head = h_flex().w(182).items_center()
      .child(step("cal-prev", "<", -1))
      .child(div().id("cal-title").flex_1().text_center().cursor_pointer().text_color(this.offset ? C.bright : C.fg)
        .on_click((_e, cx) => { this.offset = 0; cx.stop_propagation(); cx.notify(); }).child(m.title))
      .child(step("cal-next", ">", 1));
    const grid = v_flex().items_start().child(head).child(monthGrid(m, "cal"));
    const panel = v_flex().id("cal-open").flex_1().items_center().cursor_pointer()
      .on_click(() => perform("calendar"))
      .child(grid);
    return box("cal", panel, "cal");
  }
}
