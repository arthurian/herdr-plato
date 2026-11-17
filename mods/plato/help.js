// The HELP page: every PLATO key, its binding and what it does, in the PLATO voice.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, shortcut } from "./kit.js";
import { bindingFor, dialogClosed, perform } from "./keys.js";
import { helpPage } from "./logic.js";

export default class Help {
  init(_p, cx) {
    this.h = cx.focus_handle();
    this.h.focus();
  }

  render() {
    const page = helpPage(props()?.place);
    const keyText = (k) => (k && k.cmd ? shortcut(bindingFor(k.cmd)) : k || "");
    return v_flex().id("help").track_focus(this.h)
      .on_key_down((e, cx) => {
        if (e.key !== "escape" && e.key !== "l") return;
        dialogClosed("help"); // HELP is closed: the key opens it again
        closeOverlay(props().overlay);
        if (e.key === "l") perform("lesson");
        cx.stop_propagation();
      })
      .size_full().p(18).gap(10).bg(C.bg).border_1().border_color(C.fg)
      .child(div().text_color(C.bright).child(page.title))
      .child(v_flex().id("help-rows").w_full().flex_1().min_h(0).overflow_y_scrollbar().items_start().gap(6).children(page.rows.map(([name, k, text]) =>
        h_flex().w_full().gap(12)
          .child(div().w(130).flex_none().child(name))
          .child(div().w(70).flex_none().text_color(C.dim).child(keyText(k)))
          .child(div().flex_1().min_w(0).text_left().child(text)))))
      .child(div().text_color(C.dim).child("Press L for a lesson about PLATO. Press Esc to return."));
  }
}
