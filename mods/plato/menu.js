// The menu role: a right-click menu, opened by the route role as a popup at the pointer, as
// Herdr's own tab menu is. props { role: "menu", items: [{ id, name, key }], target }.
// Each row shows its key (keyText). ↑/↓ move, Enter or a click picks, Esc closes. A pick
// closes the menu and sends plato.pick:<json> to the route role, which runs the same code
// as the item's key (menuPick in route.js).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run } from "herdr";
import { C, FONT } from "./look.js";
import { keyText, alive } from "./keys.js";
import { ownEnter } from "./logic.js";

export default class Menu {
  init(_p, cx) {
    this.at = 0;
    this.h = cx.focus_handle();
    this.h.focus();
    alive("menu", cx); // so the route holds its moves while the menu is open
  }

  pick(i) {
    const p = props() ?? {};
    const it = (p.items ?? [])[i];
    if (!it) return;
    closeOverlay(p.overlay);
    run(`plato.pick:${JSON.stringify({ id: it.id, target: p.target ?? {} })}`);
  }

  render() {
    const items = props()?.items ?? [];
    const n = Math.max(items.length, 1);
    return v_flex().id("menu").track_focus(this.h).w_full().font_family(FONT).text_size(13).line_height("22px")
      .bg(C.bg).text_color(C.fg).border_1().border_color(C.fg).py(2)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % n;
        else if (e.key === "up") this.at = (this.at + n - 1) % n;
        else if (e.key === "enter" && ownEnter(e.modifiers)) this.pick(this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .children(items.map((it, i) => {
        const row = h_flex().id(`menu-${it.id}`).justify_between().gap(16).px(8).cursor_pointer()
          .on_mouse_move((_e, cx) => { if (this.at !== i) { this.at = i; cx.notify(); } })
          .on_click(() => this.pick(i))
          .child(div().child(it.name))
          .child(div().text_color(i === this.at ? C.bg : C.dim).child(keyText(it.key)));
        return i === this.at ? row.bg(C.fg).text_color(C.bg) : row;
      }));
  }
}
