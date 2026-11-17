// The title bar of a MONITOR peek: a PLATO dialog that shows another terminal
// live (term-talk's monitor mode). Props: { terminal, overlay }.
// MONITOR (cmd-shift-m), CLOSE (cmd-w) or the CLOSE button close it;
// GO TO THIS AGENT / SHELL, or NEXT (cmd-enter), switches to that terminal.
// Keys typed below the bar go to that terminal, Esc too.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, agents, panes, spaces, closeOverlay } from "herdr";
import { C, shortcut } from "./kit.js";
import { statusWord, rowTitle } from "./logic.js";
import { bindingFor, dialogClosed, goToPeek } from "./keys.js";

export default class PeekBar {
  init() {}

  close() {
    dialogClosed("peek");
    closeOverlay(props().overlay);
  }

  render() {
    const t = props()?.terminal;
    const a = agents().find((x) => x.address === t);
    const p = panes().find((x) => x.terminal === t);
    const space = a ? a.space_name : spaces().find((s) => s.tabs.some((tb) => tb.id === p?.tab))?.name;
    const folder = (p?.cwd ?? "").replace(/\/+$/, "").split("/").pop();
    const what = a ? `${rowTitle(a)} · ${statusWord(a.status)}` : p ? `${p.program?.name ?? "shell"}${folder ? ` · ${folder}` : ""}` : t;
    const key = (id, label, onClick) => div().id(id).flex_none().px(8).border_1().border_color(C.fg).cursor_pointer()
      .hover((x) => x.bg(C.fg).text_color(C.bg))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { onClick(); cx.stop_propagation(); })
      .child(label);
    const go = () => goToPeek();
    return h_flex().id("peekbar").size_full().items_center().gap(10).px(10).bg(C.bg).border_b(1).border_color(C.fg)
      .child(div().flex_none().text_color(C.bright).child("MONITOR"))
      .child(div().flex_1().min_w(0).truncate().child(`${space ?? ""} · ${what}`))
      .child(div().flex_none().text_color(C.dim).child(`Esc goes to the terminal · ${shortcut(bindingFor("monitor"))} or ${shortcut(bindingFor("close"))} closes`))
      .child(div().flex_none().w(1).h(16).bg(C.dim))
      .child(key("peek-go", `${a ? "GO TO THIS AGENT" : "GO TO THIS SHELL"}  ${shortcut(bindingFor("next"))}`, go))
      .child(key("peek-close", "CLOSE", () => this.close()));
  }
}
