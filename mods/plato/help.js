// HELP: PLATO's keys and words, in two screens shown one at a time (KEYS, WORDS).
// → or Enter goes on, ← back, 1 or 2 straight there, a click on a name too; Esc returns.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, keys } from "herdr";
import { C, shortcut } from "./kit.js";
import { bindingFor, dialogClosed, alive } from "./keys.js";
import { helpScreens, helpKey } from "./logic.js";

/** The binding of a Herdr command, from any section of keys.json. */
function bindingOfAction(action) {
  return keys().find((k) => k.action === action)?.keys ?? "";
}

export default class Help {
  init(_p, cx) {
    this.h = cx.focus_handle();
    this.h.focus();
    // props.screen ("words") opens HELP on that screen; else the first.
    const at = helpScreens().findIndex((s) => s.name.toLowerCase() === String(props()?.screen ?? "").toLowerCase());
    this.i = Math.max(at, 0);
    alive("help", cx); // so HELP and CLOSE know this dialog is still open
  }

  close() {
    dialogClosed("help"); // HELP is closed: the key opens it again
    closeOverlay(props().overlay);
  }

  render() {
    const screens = helpScreens();
    const n = screens.length;
    const screen = screens[this.i];
    const keyText = (k) => (k?.cmd ? shortcut(bindingFor(k.cmd)) : k?.action ? shortcut(bindingOfAction(k.action)) : "");
    const name = (s, j) => {
      const el = div().id(`help-${s.name}`).px(4).cursor_pointer().on_click((_e, cx) => { this.i = j; cx.notify(); }).child(s.name);
      return j === this.i ? el.bg(C.fg).text_color(C.bg) : el.text_color(C.dim).hover((st) => st.text_color(C.bright));
    };
    const next = this.i < n - 1 ? `→ ${screens[this.i + 1].name.toLowerCase()} · ` : "";
    const back = this.i > 0 ? `← ${screens[this.i - 1].name.toLowerCase()} · ` : "";
    return v_flex().id("help").track_focus(this.h)
      .on_key_down((e, cx) => {
        const r = helpKey(this.i, e.key, n);
        if (!r) return;
        if (r.close) this.close();
        else this.i = r.i;
        cx.stop_propagation();
        cx.notify();
      })
      .size_full().p(18).gap(12).bg(C.bg).border_1().border_color(C.fg)
      .child(h_flex().gap(8)
        .child(div().text_color(C.bright).child("HELP ·"))
        .children(screens.map(name))
        .child(div().text_color(C.dim).child(`· ${this.i + 1} of ${n}`)))
      .child(v_flex().id("help-rows").w_full().flex_1().min_h(0).overflow_y_scrollbar().items_start().gap(6).children(screen.rows.map(([label, k, text]) =>
        h_flex().w_full().gap(12).items_start()
          .child(div().w(110).flex_none().child(label))
          .when(screen.name === "KEYS", (el) => el.child(div().w(70).flex_none().text_color(C.dim).child(keyText(k))))
          .child(div().flex_1().min_w(0).text_left().child(text)))))
      .child(div().text_color(C.dim).child(`${next}${back}Esc or HELP returns`));
  }
}
