// PLATO drawing kit: orange plasma colors, the IBM Plex Mono font and boxed panels,
// shared by every role of the plato mod.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme } from "herdr";

/** Colors, read from the theme on each use so the theme file stays the truth. */
export const C = {
  get bg() { return theme().background ?? "#0d0703"; },
  get fg() { return theme().accent ?? "#ff8a1f"; },
  get bright() { return theme().ansi11 ?? "#ffd08a"; },
  get dim() { return theme().ansi8 ?? "#a8622a"; },
  get glow() { return `${(theme().accent ?? "#ff8a1f").slice(0, 7)}33`; },
  get inv() { return theme().background ?? "#0d0703"; },
};

export const FONT = "IBM Plex Mono";
export const SIZE = 14;

/** The root of every role: font, size, colors. */
export function root(el) {
  return el.font_family(FONT).text_size(SIZE).line_height(`${SIZE + 5}px`).text_color(C.fg).bg(C.bg);
}

/** A boxed PLATO panel: a 1 px orange line inside a faint orange line (the glow). */
export function box(title, child, id = "box") {
  const inner = v_flex().id(`${id}-in`).flex_1().min_h(0).border_1().border_color(C.fg).px(6).py(3).gap(1);
  return v_flex().id(id).size_full().min_h(0).p(2).child(
    v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
      (title ? inner.child(div().text_color(C.dim).child(String(title).toUpperCase())) : inner).child(child),
    ),
  );
}

/** Reverse video: black on orange. */
export function inv(el) {
  return el.bg(C.fg).text_color(C.inv);
}

export function label(text, o = {}) {
  let el = div().child(String(text ?? ""));
  if (o.color) el = el.text_color(o.color);
  if (o.truncate) el = el.truncate();
  return el;
}

/** "cmd-shift-enter" -> "⌘⇧↩", for showing a key binding. */
export function shortcut(binding) {
  if (!binding) return "";
  const map = { cmd: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃", enter: "↩", backspace: "⌫", escape: "esc" };
  return binding.split("-").map((p) => map[p] ?? p.toUpperCase()).join("");
}

/** A single-line PLATO bar (banner, keyset): an orange rule on one edge, no title. */
export function bar(id, edge, child) {
  const el = h_flex().id(id).size_full().items_center().px(8).gap(10).border_color(C.fg);
  return (edge === "bottom" ? el.border_b(1) : el.border_t(1)).child(child);
}

/** A one-line input: the text with a PLATO cursor (reverse video on a character,
 *  a blinking block at the end). line is {text, cursor}. */
export function lineInput(line, placeholder = "") {
  const t = line.text, c = line.cursor;
  const el = h_flex().min_w(0).child(div().whitespace_nowrap().child(t.slice(0, c)));
  const cursor = c < t.length
    ? inv(div().whitespace_nowrap().child(t[c]))
    : div().w(8).h(16).bg(C.fg).loop("opacity", { from: 0, to: 1, period: 1060 });
  const rest = div().whitespace_nowrap().child(t.slice(c + 1));
  const hint = !t && placeholder ? div().text_color(C.dim).whitespace_nowrap().child(placeholder) : null;
  return el.child(cursor).child(rest).when(Boolean(hint), (x) => x.child(hint));
}
