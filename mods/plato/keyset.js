// The PLATO keyset: NEXT BACK HELP TERM LAB DATA as boxed keys along the bottom.

import { div } from "gpui-kit";
import { agents, focused, run } from "herdr";
import { v_flex } from "gpui-base";
import { C, bar, shortcut } from "./kit.js";
import { KEYS, bindingFor, perform, focusOn } from "./keys.js";
import { pageFor } from "./logic.js";

const KEYS_PX = 32;
const PAGE_PX = 58;

const OWN = new Set(["next", "back", "next1", "back1", "help", "lab", "data", "focus", "index", "monitor", "lesson", "edit", "edittab", "notesfile", "calendar", "close"]);

export default class Keyset {
  init() {}

  command(c) {
    if (OWN.has(c)) perform(c);
  }

  render() {
    const page = pageFor(agents(), focused()?.terminal ?? null, focusOn());
    const px = page ? PAGE_PX : KEYS_PX;
    if (px !== this.px) { this.px = px; run("layout.resize", { id: "keyset", px }); }
    const key = (k) =>
      div().id(`key-${k.cmd}`).flex().items_center().gap(6).px(8).border_1().border_color(C.fg).cursor_pointer()
        .hover((s) => s.bg(C.fg).text_color(C.bg))
        .on_click(() => perform(k.cmd))
        .child(div().child(k.name))
        .child(div().text_color(C.dim).child(shortcut(bindingFor(k.cmd))));
    const keys = div().flex().gap(14).children(KEYS.map(key));
    const pageLine = page && div().id("page").flex().gap(10).px(10).cursor_pointer().text_color(C.bright)
      .loop("opacity", { from: 0.45, to: 1, period: 1100 })
      .on_click(() => run("agent.focus", { terminal: page.address }))
      .child(div().child("PAGE"))
      .child(div().child(page.text + (page.more ? `  (+${page.more} more)` : "")))
      .child(div().text_color(C.dim).child(`press NEXT1 ${shortcut(bindingFor("next1"))}`));
    return bar("keyset", "top", v_flex().flex_1().items_center().justify_center().gap(4)
      .when(Boolean(page), (el) => el.child(pageLine))
      .child(keys));
  }
}
