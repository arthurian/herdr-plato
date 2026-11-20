// PLATO's colors and font, read from the theme on each use (as mods/plato/kit.js
// does), so every GLOW theme recolors every PLATO panel. The other plato-* mods keep an
// identical copy, because a mod cannot import from another mod's folder.

import { theme } from "herdr";

export const C = {
  get bg() { return theme().background ?? "#0d0703"; },
  get fg() { return theme().accent ?? "#ff8a1f"; },
  get bright() { return theme().ansi11 ?? "#ffd08a"; },
  get dim() { return theme().ansi8 ?? "#a8622a"; },
  get glow() { return `${(theme().accent ?? "#ff8a1f").slice(0, 7)}24`; },
};

export const FONT = "IBM Plex Mono";

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
