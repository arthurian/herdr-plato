// NOTES: the lesson's notesfile, in the star shape of PLATO Notes. The base
// note is the lesson's GOAL; each DATA checkpoint is a numbered response with
// Worked, Noticed and Next. Newest first, for the current space only.
// A click opens the full notesfile as a dialog (DATA when it is still empty).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, shared } from "herdr";
import { C, box } from "./kit.js";
import { NOTES_KEY } from "./data.js";
import { perform } from "./keys.js";

const when = (at) => {
  const d = new Date(at);
  const p2 = (n) => String(n).padStart(2, "0");
  return d.toDateString() === new Date().toDateString()
    ? `${p2(d.getHours())}:${p2(d.getMinutes())}`
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default class Notes {
  init() {}

  render() {
    const space = spaces().find((s) => s.active);
    const file = (shared(NOTES_KEY) ?? {})[space?.id] ?? { goal: null, responses: [] };
    const goal = file.goal
      ? v_flex().child(div().text_color(C.dim).child("GOAL")).child(div().text_color(C.bright).child(file.goal.text))
      : div().id("notes-goal").text_color(C.dim).cursor_pointer().hover((s) => s.text_color(C.fg)).on_click(() => perform("data")).child("no goal yet · press DATA");
    const line = (label, text, color) => h_flex().gap(6).pl(14)
      .child(div().w(16).flex_none().text_color(C.dim).child(label))
      .child(div().flex_1().min_w(0).text_color(color).child(text));
    const response = (r) => v_flex().id(`nr-${r.n}`)
      .child(h_flex().gap(8)
        .child(div().flex_none().text_color(C.dim).child(`#${r.n}`))
        .child(div().text_color(C.dim).child(when(r.at))))
      .when(Boolean(r.worked), (el) => el.child(line("w", r.worked, C.fg)))
      .when(Boolean(r.noticed), (el) => el.child(line("n", r.noticed, C.fg)))
      .when(Boolean(r.next), (el) => el.child(line(">", r.next, C.bright)));
    const responses = [...file.responses].reverse();
    const body = v_flex().flex_1().min_h(0).gap(8)
      .child(goal)
      .child(responses.length
        ? v_flex().id("notes-scroll").flex_1().min_h(0).overflow_y_scrollbar().child(v_flex().gap(8).children(responses.map(response)))
        : div().text_color(C.dim).child("No checkpoints yet. Press DATA after a chunk of work: w worked, n noticed, > next."));
    const n = file.responses.length;
    const panel = v_flex().id("notes-open").flex_1().min_h(0).cursor_pointer()
      .on_click(() => perform(file.goal || n ? "notesfile" : "data"))
      .child(body);
    return box(n ? `notes · ${n} response${n === 1 ? "" : "s"}` : "notes", panel, "notes");
  }
}
