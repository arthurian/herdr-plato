// The top line: PLATO · lesson <space> · page 1 2 3, and on the right.
// A click on "lesson <space>" opens the INDEX letter choice, like cmd-i;
// "Press NEXT1 to continue" when an agent needs you, else the clock.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run, theme } from "herdr";
import { C, bar, inv } from "./kit.js";
import { nextGlow } from "./logic.js";

export function toggleGlow() {
  run("app.theme", { name: nextGlow(theme().accent) });
}

const LIGHTS = 76; // room for the macOS window buttons

function clock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default class Banner {
  init(_p, cx) {
    this.tick(cx);
  }

  command(c) {
    if (c === "glow") toggleGlow();
  }

  tick(cx) {
    const ms = 60000 - (Date.now() % 60000) + 50;
    cx.timer.after(ms, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    const space = spaces().find((s) => s.active);
    const tabs = (space?.tabs ?? []).filter((t) => !t.settled);
    const waiting = agents().some((a) => a.status === "blocked");
    const page = (t) => {
      const el = div().id(`page-${t.id}`).px(4).cursor_pointer().on_click(() => run("tab.select", { id: t.id })).child(t.named ? t.name : String(t.index));
      return t.active ? inv(el) : el.hover((s) => s.text_color(C.bright));
    };
    const right = waiting
      ? div().id("prompt").text_color(C.bright).loop("opacity", { from: 0.5, to: 1, period: 1600 }).child("Press NEXT1 to continue")
      : div().text_color(C.dim).child(clock());
    return bar("banner", "bottom",
      h_flex().flex_1().min_w(0).pl(LIGHTS).gap(10).items_center()
        .child(div().id("glow").cursor_pointer().hover((s) => s.text_color(C.bright)).on_click(() => toggleGlow()).child("PLATO"))
        .child(div().text_color(C.dim).child("·"))
        .child(h_flex().id("lesson").gap(10).cursor_pointer()
          .on_click(() => run("plato.index"))
          .child(div().text_color(C.dim).child("lesson"))
          .child(div().text_color(C.bright).child(space?.name ?? ""))
          .hover((s) => s.bg(C.glow)))
        .child(div().text_color(C.dim).child("·  page"))
        .child(h_flex().gap(4).children(tabs.map(page)))
        .child(div().flex_1())
        .child(right));
  }
}
