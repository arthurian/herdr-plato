// The full notesfile of the current lesson, as a dialog (a click on NOTES).
// The GOAL on top, every response below with nothing cut short; it scrolls.
// D or DATA adds a checkpoint, E edits the goal (both open DATA), Esc returns.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, spaces, shared } from "herdr";
import { C } from "./kit.js";
import { NOTES_KEY } from "./data.js";
import { dialogClosed, perform } from "./keys.js";

const stamp = (at) => {
  const d = new Date(at);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export default class NotesFile {
  init(_p, cx) {
    this.h = cx.focus_handle();
    this.h.focus();
  }

  close() {
    dialogClosed("notesfile");
    closeOverlay(props().overlay);
  }

  key(e, cx) {
    if (e.key === "escape") this.close();
    else if (e.key === "d" || e.key === "e") { this.close(); perform("data"); }
    else return;
    cx.stop_propagation();
  }

  render() {
    const space = spaces().find((s) => s.active);
    const file = (shared(NOTES_KEY) ?? {})[space?.id] ?? { goal: null, responses: [] };
    const line = (label, text, color) => h_flex().gap(10).pl(18)
      .child(div().w(70).flex_none().text_color(C.dim).child(label))
      .child(div().flex_1().min_w(0).text_color(color).child(text));
    const response = (r) => v_flex().id(`nf-${r.n}`).gap(1)
      .child(div().text_color(C.dim).child(`#${r.n}  ·  ${stamp(r.at)}`))
      .when(Boolean(r.worked), (el) => el.child(line("WORKED", r.worked, C.fg)))
      .when(Boolean(r.noticed), (el) => el.child(line("NOTICED", r.noticed, C.fg)))
      .when(Boolean(r.next), (el) => el.child(line("NEXT", r.next, C.bright)));
    const responses = [...file.responses].reverse();
    const n = file.responses.length;
    return v_flex().id("notesfile").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(20).gap(10).bg(C.bg).border_1().border_color(C.fg)
      .child(h_flex().w_full()
        .child(div().flex_1().text_color(C.bright).child(`NOTES · ${space?.name ?? ""} · notesfile`))
        .child(div().text_color(C.dim).child(`${n} response${n === 1 ? "" : "s"}`)))
      .child(v_flex()
        .child(div().text_color(C.dim).child(file.goal ? `GOAL  ·  set ${stamp(file.goal.at)}` : "GOAL"))
        .child(div().text_color(file.goal ? C.bright : C.dim).child(file.goal ? file.goal.text : "No goal yet. Press E to set one.")))
      .child(div().h(1).w_full().bg(C.dim))
      .child(v_flex().id("notesfile-scroll").flex_1().min_h(0).overflow_y_scrollbar()
        .child(responses.length
          ? v_flex().gap(12).children(responses.map(response))
          : div().text_color(C.dim).child("No responses yet. Press D after a chunk of work.")))
      .child(div().text_color(C.dim).child("D adds a checkpoint · E edits the goal · Esc returns"));
  }
}
