// PLATO's look: the theme's colors, read on each use so every GLOW theme recolors every
// panel, the IBM Plex Mono font, boxed panels and bars, and the agent states' colors.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme } from "herdr";

export const C = {
  get bg() { return theme().background ?? "#0d0703"; },
  get fg() { return theme().accent ?? "#ff8a1f"; },
  get bright() { return theme().ansi11 ?? "#ffd08a"; },
  get dim() { return theme().ansi8 ?? "#a8622a"; },
  // Plain text, apart from the accent (results and reports in REVIEW). A one-color glow sets it
  // to the accent, so there it changes nothing.
  get text() { return theme().foreground ?? theme().accent ?? "#ff8a1f"; },
  get glow() { return `${(theme().accent ?? "#ff8a1f").slice(0, 7)}24`; },
};

export const FONT = "IBM Plex Mono";
export const SIZE = 14;

/** The root of the keyset, HELP, FILES and the viewer: font, size, colors. */
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
  return el.bg(C.fg).text_color(C.bg);
}

/** "cmd-shift-enter" -> "⌘⇧↩", for showing a key binding. */
export function shortcut(binding) {
  if (!binding) return "";
  const map = { cmd: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃", enter: "↩", backspace: "⌫", escape: "esc" };
  return binding.split("-").map((p) => map[p] ?? p.toUpperCase()).join("");
}

/** A single-line PLATO bar (the keyset): an orange rule on one edge, no title. */
export function bar(id, edge, child) {
  const el = h_flex().id(id).size_full().items_center().px(8).gap(10).border_color(C.fg);
  return (edge === "bottom" ? el.border_b(1) : el.border_t(1)).child(child);
}

/** The color of an agent state: bright needs you (blocked, or done and not seen yet), the
 *  accent works, dim is idle. */
export function stateColor(status) {
  if (status === "blocked" || status === "done") return C.bright;
  if (status === "working") return C.fg;
  return C.dim;
}

/** Whether a state's lamp is filled: working, or needing you (blocked, done and not seen).
 *  Only blocked also pulses. Idle lamps are hollow. */
export function lit(status) {
  return status === "blocked" || status === "working" || status === "done";
}

const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };

/** A state as words; a stop with only shells is idle. */
export function stateWord(status) {
  return WORDS[status] ?? "idle";
}
