// The PLATO keyset: NEXT BACK NEXT1 BACK1 HELP TERM LAB MAP JUMP FOCUS as boxed keys along the
// bottom. In FOCUS, a flashing SIGNAL line above them names an agent that needs you.

import { div } from "gpui-kit";
import { agents, focused, run, shared, spaces, panes, layout } from "herdr";
import { v_flex, h_flex } from "gpui-base";
import { C, bar, shortcut } from "./kit.js";
import { KEYS, bindingFor, perform, focusOn } from "./keys.js";
import { pageFor, keysetPad } from "./logic.js";
import { stops } from "./line.js";

const KEYS_PX = 32;
const PAGE_PX = 58;

/** The commands in keys.json that this mod runs (NEXT, BACK and NEXT1 go to plato-route). */
const OWN = new Set(["help", "lab", "focus", "close"]);

export default class Keyset {
  init() {}

  command(c) {
    // "help:words" opens HELP on that screen (for scripts and checks).
    if (OWN.has(c.split(":")[0])) perform(c);
  }

  render() {
    const all = stops(shared("plato.line") ?? null, spaces(), panes());
    const page = pageFor(agents(), focused()?.terminal ?? null, focusOn(), all);
    const px = page ? PAGE_PX : KEYS_PX;
    if (px !== this.px) { this.px = px; run("layout.resize", { id: "keyset", px }); }
    const key = (k) =>
      div().id(`key-${k.cmd}`).flex().items_center().gap(6).px(8).border_1().border_color(C.fg).cursor_pointer()
        .hover((s) => s.bg(C.fg).text_color(C.bg))
        .on_click(() => perform(k.cmd))
        .child(div().child(k.name))
        .child(div().text_color(C.dim).child(shortcut(bindingFor(k.cmd))));
    const keys = div().flex().gap(10).children(KEYS.map(key));
    const pageLine = page && div().id("page").flex().gap(10).px(10).cursor_pointer().text_color(C.bright)
      .loop("opacity", { from: 0.45, to: 1, period: 1100 })
      .on_click(() => run("agent.focus", { terminal: page.address }))
      .child(div().child("SIGNAL"))
      .child(div().child(page.text + (page.more ? `  (+${page.more} more)` : "")))
      .child(div().text_color(C.dim).child(`press NEXT1 ${shortcut(bindingFor("next1"))}`));
    // Center under the terminal, not the whole window: pad by the route and the right column.
    const pad = keysetPad(layout());
    return bar("keyset", "top", h_flex().flex_1().min_w(0)
      // The pads give way before the keys do, when the keys are wider than the terminal.
      .child(div().flex_shrink(1).min_w(0).w(pad.left))
      .child(v_flex().flex_1().flex_shrink(0).items_center().justify_center().gap(4)
        .when(Boolean(page), (el) => el.child(pageLine))
        .child(keys))
      .child(div().flex_shrink(1).min_w(0).w(pad.right)));
  }
}
