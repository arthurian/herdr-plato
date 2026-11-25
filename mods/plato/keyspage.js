// The keys role: the ⌘K keys panel. After ⌘K, one plain key runs a PLATO command, as C-x
// does in Emacs (the letters are in leader.js). The keyset opens it as a window overlay the
// size of the whole window, with no frame and no dimming. It takes the keyboard at once but
// draws nothing for PANEL_MS, so a fast letter never flashes it; then it draws the panel at
// the bottom. A letter closes the panel, then runs its command. ctrl-g or Esc closes it. A key
// with no command closes it, and the banner says "⌘K q is undefined" (shared plato.notice).
// A click on a row runs it; a left or right click beside the panel, or a lost keyboard, closes it.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, keys, setShared, checking } from "herdr";
import { C, FONT, SIZE, shortcut } from "./look.js";
import { PANEL_MS, leaderKey, leaderGroups, chordOf } from "./leader.js";
import { BEAT_MS } from "./logic.js";
import { keyText, perform, dialogClosed, alive } from "./keys.js";
import { NOTICE, KEYS_BACK } from "./shared.js";

/** Room below the panel for the keyset, so the panel never covers the keys. */
const KEYSET_ROOM = 40;

/** A Herdr command's binding, from the PLATO layout first (ZOOM is ⌘⇧Z there). */
function actionText(action) {
  const k = keys();
  const b = k.find((x) => x.section === "layout:plato" && x.action === action) ?? k.find((x) => x.action === action);
  return shortcut(b?.keys ?? "");
}

export default class Keys {
  init(_p, cx) {
    this.shown = false;
    this.done = false;
    this.had = false; // the panel has had the keyboard: losing it now closes the panel
    this.h = cx.focus_handle();
    this.h.focus();
    if (checking()) { this.shown = true; return; }
    alive("keys", cx); // so ⌘K again and CLOSE know the panel is open
    cx.timer.after(0, () => this.h.focus());
    cx.timer.after(PANEL_MS, (cx) => { this.shown = true; cx.notify(); });
    cx.timer.every(BEAT_MS, () => {
      if (this.done) return;
      if (this.h.is_focused()) this.had = true;
      else if (this.had) this.close();
    });
  }

  close() {
    if (this.done) return;
    this.done = true;
    dialogClosed("keys");
    closeOverlay(props().overlay);
  }

  /** Run a row: the panel closes first, so no move happens behind an open panel. */
  runRow(row) {
    if (row.cancel) return this.giveBack();
    this.close();
    if (row.cmd) perform(row.cmd);
    else run(row.action);
  }

  /** Close having run nothing: REVIEW, if open, takes the keyboard back. */
  giveBack() {
    setShared(KEYS_BACK, { at: Date.now() });
    this.close();
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    const bound = new Set(keys().map((k) => chordOf(k.keys)));
    const r = leaderKey(e.key, m, (c) => bound.has(c));
    if (!r) return;
    if (r.pass) {
      // A chord Herdr binds: Herdr runs it. ⌘K again is the toggle, which closes the panel itself.
      if (keys().some((k) => k.action === "plato.keys" && chordOf(k.keys) === chordOf(e.key, m))) return;
      return this.close();
    }
    cx.stop_propagation();
    if (r.run) this.runRow(r.run);
    else if (r.cancel) this.giveBack();
    else {
      setShared(NOTICE, { text: `${keyText({ cmd: "keys" }) || "⌘K"} ${r.undefined} is undefined`, at: Date.now() });
      this.giveBack();
    }
  }

  /** One row: the letter (and HELP's "?"), the name, and the direct key. */
  row(r) {
    const cap = (t) => div().min_w(26).flex_none().px(4).border_1().border_color(C.fg).text_color(C.bright).text_center().child(t);
    const direct = r.cancel ? "esc" : r.action ? actionText(r.action) : keyText({ cmd: r.cmd }); // RENAME TAB: F2
    return h_flex().id(`keys-${r.name}`).w_full().gap(10).items_center().cursor_pointer()
      .hover((s) => s.bg(C.glow))
      .on_click(() => this.runRow(r))
      .child(cap(r.key))
      .when(Boolean(r.also), (el) => el.child(cap(r.also)))
      .child(div().text_color(r.cancel ? C.dim : C.fg).child(r.name))
      .child(div().ml_auto().text_color(C.dim).child(direct));
  }

  panel() {
    const head = h_flex().gap(12).items_center()
      .child(div().px(6).bg(C.fg).text_color(C.bg).child(keyText({ cmd: "keys" }) || "⌘K"))
      .child(div().text_color(C.bright).child("▸ KEYS"))
      .child(div().ml_auto().text_color(C.dim).child("one plain key · ⌃G or esc cancels · or click a row"));
    const cols = h_flex().w_full().gap(28).items_start().children(leaderGroups().map((g) =>
      v_flex().flex_1().min_w(0).pl(10).gap(1).border_l(1).border_color(C.glow)
        .child(div().text_color(C.bright).child(g.title))
        .children(g.rows.map((r) => this.row(r)))));
    return v_flex().id("keys-panel").w_full().gap(10).px(20).py(10).bg(C.bg).border_1().border_color(C.fg)
      .font_family(FONT).text_size(SIZE).line_height(`${SIZE + 7}px`).text_color(C.fg)
      // A press on the panel never drags it, and a right-click on it does nothing.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (_e, cx) => cx.stop_propagation())
      .child(head).child(cols);
  }

  render() {
    // The whole window, see-through: the panel sits at the bottom, above the keyset.
    return v_flex().id("keys").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().justify_end().px(8).pb(KEYSET_ROOM)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.giveBack(); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.giveBack(); })
      .when(this.shown, (el) => el.child(this.panel()));
  }
}
