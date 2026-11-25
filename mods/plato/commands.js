// Which role takes each plato.* command. Herdr sends every command to every copy of the
// mod; main.js passes a command only to the role that owns it, so two roles never act on
// the same command. A command's name is the part before ":" or " " (plato.sign-on:<path>,
// plato.help:words). No "herdr" import, so Node can test it.

export const COMMANDS = {
  route: ["next", "back", "next1", "back1", "go", "goto", "review", "jump", "tree", "lab", "sign-on", "sign-off", "close-up", "purpose", "due", "pick", "rename-tab", "folder"],
  keyset: ["help", "keys", "focus", "close"],
  banner: ["glow"],
  timetable: ["span"],
};

/** A command's name, without its text: "sign-on:<path>" → "sign-on". */
export function commandName(c) {
  return String(c ?? "").split(/[: ]/)[0];
}

/** The role that takes a command, or null for a command no role takes. */
export function ownerOf(c) {
  const name = commandName(c);
  return Object.keys(COMMANDS).find((role) => COMMANDS[role].includes(name)) ?? null;
}

/** The PLATO keys whose plato.* command has another name. */
const NAMES = { signon: "sign-on", signoff: "sign-off", closeup: "close-up", renametab: "rename-tab" };

/** The command a PLATO key runs: TERM is Herdr's palette, the rest are plato.* commands. */
export function commandFor(cmd) {
  return cmd === "term" ? "app.palette" : `plato.${NAMES[cmd] ?? cmd}`;
}
