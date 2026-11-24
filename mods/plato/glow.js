// The glow cycle: tokyo, kanagawa, mocha, nord, orange, amber, green, white, then tokyo.
// The first four are modern glows, from Tokyo Night (folke/tokyonight.nvim, Apache-2.0),
// Kanagawa (rebelot/kanagawa.nvim, MIT), Catppuccin Mocha (catppuccin.com, MIT) and the Nord
// palette (nordtheme.com, MIT); tokyo is the default (layouts/plato.json). The last four are
// the classic screens of the 1970s and 80s; orange keeps the theme name "plato". The themes
// are in themes/ (plato-tokyo, plato-kanagawa, plato-mocha, plato-nord, plato, plato-amber,
// plato-green, plato-white).

export const GLOWS = [
  ["#7aa2f7", "plato-tokyo"],
  ["#dcd7ba", "plato-kanagawa"],
  ["#cba6f7", "plato-mocha"],
  ["#88c0d0", "plato-nord"],
  ["#ff8a1f", "plato"],
  ["#ffb000", "plato-amber"],
  ["#4fd06a", "plato-green"],
  ["#dcdcd2", "plato-white"],
];

/** Each glow's word, as HELP and the banner say it. */
const WORDS = { plato: "orange", "plato-amber": "amber", "plato-green": "green", "plato-white": "white", "plato-nord": "nord", "plato-mocha": "mocha", "plato-tokyo": "tokyo", "plato-kanagawa": "kanagawa" };

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
