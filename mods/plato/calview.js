// CAL as a dialog: three months side by side, like `cal -3`. ← and → step a
// month, T returns to today, Esc returns. Opened by a click on CAL.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C } from "./kit.js";
import { calMonth, monthsAround } from "./logic.js";
import { monthGrid } from "./cal.js";
import { dialogClosed } from "./keys.js";

export default class CalView {
  init(_p, cx) {
    this.offset = 0;
    this.h = cx.focus_handle();
    this.h.focus();
  }

  close() {
    dialogClosed("calendar");
    closeOverlay(props().overlay);
  }

  key(e, cx) {
    if (e.key === "escape") return this.close();
    if (e.key === "left") this.offset -= 1;
    else if (e.key === "right") this.offset += 1;
    else if (e.key === "t") this.offset = 0;
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const now = new Date();
    const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    const months = monthsAround(today.y, today.m, this.offset).map(({ y, m }) => calMonth(y, m, today));
    const col = (m, i) => v_flex().id(`cv-${i}`).items_center().gap(2)
      .child(div().text_color(i === 1 ? C.bright : C.fg).child(m.title))
      .child(monthGrid(m, `cv${i}`));
    return v_flex().id("calview").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(20).gap(14).bg(C.bg).border_1().border_color(C.fg)
      .child(h_flex().w_full()
        .child(div().flex_1().text_color(C.bright).child("CAL"))
        .child(div().text_color(C.dim).child(this.offset ? "T returns to today" : "")))
      .child(h_flex().w_full().justify_center().items_start().gap(28).children(months.map(col)))
      .child(div().flex_1())
      .child(div().text_color(C.dim).child("← → step a month · T today · Esc returns"));
  }
}
