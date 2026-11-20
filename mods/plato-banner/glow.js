// The glow cycle: orange, amber, green, white, nord, mocha, then orange. The first four are
// the screens of the 1970s and 80s; nord and mocha are the two modern glows, from the Nord
// palette (nordtheme.com, MIT) and Catppuccin Mocha (catppuccin.com, MIT). The themes are
// in themes/ (plato, plato-amber, plato-green, plato-white, plato-nord, plato-mocha).

export const GLOWS = [
  ["#ff8a1f", "plato"],
  ["#ffb000", "plato-amber"],
  ["#4fd06a", "plato-green"],
  ["#dcdcd2", "plato-white"],
  ["#88c0d0", "plato-nord"],
  ["#cba6f7", "plato-mocha"],
];

/** Each glow's word, as HELP and the banner say it. */
const WORDS = { plato: "orange", "plato-amber": "amber", "plato-green": "green", "plato-white": "white", "plato-nord": "nord", "plato-mocha": "mocha" };

/** The theme the glow steps to, from the current accent color. */
export function nextGlow(accent) {
  const i = GLOWS.findIndex(([c]) => c === String(accent ?? "").toLowerCase());
  return GLOWS[(Math.max(i, 0) + 1) % GLOWS.length][1];
}

/** The glow's word for the banner, from the current accent color: "amber". */
export function glowWord(accent) {
  const g = GLOWS.find(([c]) => c === String(accent ?? "").toLowerCase());
  return g ? WORDS[g[1]] : "";
}
