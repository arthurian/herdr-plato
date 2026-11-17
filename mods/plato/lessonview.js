// The PLATO lesson: one page at a time, like a PLATO lesson or a Notes screen.
// Enter or → for the next page, ← for the one before, Esc to return.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C } from "./kit.js";
import { LESSON, lessonStep } from "./lesson.js";
import { dialogClosed } from "./keys.js";

export default class LessonView {
  init(_p, cx) {
    this.page = 0;
    this.h = cx.focus_handle();
    this.h.focus();
  }

  close() {
    dialogClosed("lesson");
    closeOverlay(props().overlay);
  }

  key(e, cx) {
    if (e.key === "escape") this.close();
    else {
      const next = lessonStep(this.page, e.key, LESSON.length);
      if (next === null) return;
      this.page = next;
    }
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const p = LESSON[this.page];
    const last = this.page === LESSON.length - 1;
    return v_flex().id("lesson").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(20).gap(12).bg(C.bg).border_1().border_color(C.fg)
      .child(h_flex().w_full()
        .child(div().flex_1().text_color(C.bright).child(`LESSON · PLATO · ${p.title}`))
        .child(div().text_color(C.dim).child(`page ${this.page + 1} of ${LESSON.length}`)))
      .child(v_flex().w_full().items_start().children(p.lines.map((l) => div().whitespace_nowrap().child(l || " "))))
      .child(div().flex_1())
      .child(div().text_color(C.dim).child(`Source: ${p.source}`))
      .child(div().text_color(C.bright).child(last
        ? "This is the end of the lesson. Press Esc to return."
        : this.page === 0 ? "Press NEXT (Enter or →) to continue. Esc to return." : "Press NEXT (Enter or →) or BACK (←). Esc to return."));
  }
}
