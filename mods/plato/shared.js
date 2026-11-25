// Every shared-state key PLATO uses, named once. Roles talk to each other only through
// these keys and plato.* commands (commands.js); they never import each other.
// ACCESS lists, for each key, the files that write it (setShared) and the files that read
// it (shared). test/shared.test.mjs checks every call in the mod against this list, and
// fails on a key typed out anywhere else. No "herdr" import, so Node can test it.

/** The letters: slots { letter, space, name, folder, opened, due }. Only the route writes it. */
export const LINE = "plato.line";
/** Where BACK1 returns to: the places you were before. */
export const LINE_BACK = "plato.line.back";
/** { name, letter, due } of the space SIGN-ON is opening; the route gives it the letter. */
export const PENDING = "plato.pending";
/** { id, page, space, letter, at } while a SIGN-ON, SIGN-OFF or CLOSE UP page is open. */
export const SIGN_DIALOG = "plato.dialog.sign";
/** { key, at }: NEXT, BACK, NEXT1 or U, from the route to the open sign page. */
export const SIGN_KEY = "plato.sign.key";
/** { space, at }: close up the line once this space has closed (no space: at once). */
export const CLOSEUP = "plato.closeup";
/** { at } while REVIEW is open; { at, day, page } when a script named the day. */
export const REVIEW = "plato.review";
/** true while TREE shows every space's stops on the route. */
export const ROUTE_TREE = "plato.route.tree";
/** { from, to, at, lastAt } after a move, until 4 s pass or a prompt is sent there. */
export const ARRIVAL = "plato.arrival";
/** { terminal, at } while LOOK is open: the tab it shows, for ⌘E (refreshed each second). */
export const LOOK = "plato.look";
/** { text, at }: a word for the banner to show for two seconds ("⌘K q is undefined"). */
export const NOTICE = "plato.notice";
/** { at }: the keys panel closed and ran nothing, so REVIEW may take the keyboard back. */
export const KEYS_BACK = "plato.keys.back";
/** Which of TODAY's spans the graph shows (0: the last 2h). */
export const TODAY_SPAN = "plato.today.span";

/** A PLATO dialog's overlay id while it is open ("help"). */
export const dialogKey = (name) => `plato.dialog.${name}`;
/** When an open dialog last said it is still open. */
export const aliveKey = (name) => `plato.dialog.${name}.alive`;
/** The file a space's viewer pane shows. */
export const viewerKey = (space) => `plato.viewer.${space}`;

/** Who may write and read each key, by file name without ".js". */
export const ACCESS = {
  LINE: { writers: ["route"], readers: ["banner", "jumppage", "keyset", "lookpage", "nowat", "recorder", "review", "route", "signals", "signpage", "strip", "timetable"] },
  LINE_BACK: { writers: ["route"], readers: ["route"] },
  PENDING: { writers: ["route", "signpage"], readers: ["route"] },
  SIGN_DIALOG: { writers: ["route", "signpage"], readers: ["nowat", "route", "signpage"] },
  SIGN_KEY: { writers: ["route", "signpage"], readers: ["route", "signpage"] },
  CLOSEUP: { writers: ["route", "signpage"], readers: ["route"] },
  REVIEW: { writers: ["route"], readers: ["review", "route"] },
  ROUTE_TREE: { writers: ["route"], readers: ["route"] },
  ARRIVAL: { writers: ["banner", "nowat"], readers: ["banner", "nowat", "route", "strip"] },
  NOTICE: { writers: ["banner", "keyspage", "review"], readers: ["banner"] },
  KEYS_BACK: { writers: ["keyspage"], readers: ["review"] },
  TODAY_SPAN: { writers: ["timetable"], readers: ["timetable"] },
  LOOK: { writers: ["lookpage"], readers: ["route"] },
  dialogKey: { writers: ["keys"], readers: ["keys"] },
  aliveKey: { writers: ["keys"], readers: ["keys"] },
  viewerKey: { writers: ["keys"], readers: ["files", "viewer"] },
};
