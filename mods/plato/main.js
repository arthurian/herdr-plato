// plato: every PLATO view, in roles. The layout and overlays give each copy props { role }:
//   keyset   the boxed PLATO keys along the bottom, and the SIGNAL line in FOCUS
//   help     the HELP page (a dialog)
//   files    the project folder tree
//   viewer   a file in a pane (markdown rendered, text plain)
//   nowat    NOW AT: where your keys go, the tab's purpose and the last prompt sent there
//   strip    the bottom pane header: which stop the pane is, its state and purpose
//   banner   the top line: where you are, who needs you, the glow and the clock
//   timetable TODAY: who waited on you today, the train graph and the due list
//   signals  SIGNALS (mode signals) or DUE (mode due), in the right column
//   sign     the SIGN-ON, SIGN-OFF, CLOSE UP and SET PURPOSE pages (a dialog)
//   route    the line of spaces and the route (mode line), or the agenda (mode agenda)
//   menu     a right-click menu (a popup at the pointer)
//   look     LOOK: a tab's details before you go there (a dialog)
//   jump     JUMP: find a tab by its code, name, purpose or folder (a dialog)
//   keys     the ⌘K keys panel: one plain letter runs any PLATO command (a window overlay)
// The roles live in one mod so they share line.js and look.js (a mod cannot import from
// another mod's folder). Herdr sends each plato.* command to every copy; each copy passes it
// on only to the role that owns it in commands.js, through that role's command(c, cx).
// herdr-app check gives no props: then every role is drawn once, so the check covers all.

import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, nextCommand, checking } from "herdr";
import { root } from "./look.js";
import { ownerOf } from "./commands.js";
import Keyset from "./keyset.js";
import Help from "./help.js";
import Viewer from "./viewer.js";
import Files from "./files.js";
import NowAt from "./nowat.js";
import Strip from "./strip.js";
import Banner from "./banner.js";
import Timetable from "./timetable.js";
import Signals from "./signals.js";
import Sign from "./signpage.js";
import Route from "./route.js";
import Menu from "./menu.js";
import Look from "./lookpage.js";
import Jump from "./jumppage.js";
import Keys from "./keyspage.js";

const ROLES = { keyset: Keyset, help: Help, viewer: Viewer, files: Files, nowat: NowAt, strip: Strip, banner: Banner, timetable: Timetable, signals: Signals, sign: Sign, route: Route, menu: Menu, look: Look, jump: Jump, keys: Keys };
/** The roles drawn inside root() from look.js (its font, size and colors). */
const KIT = new Set(["keyset", "help", "viewer", "files", "look", "jump"]);

export default class Plato extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const names = pr.role ? [pr.role] : checking() ? Object.keys(ROLES) : [];
    this.roles = names.filter((n) => ROLES[n]).map((n) => ({ name: n, role: new ROLES[n]() }));
    for (const r of this.roles) r.role.init?.(pr, cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const owner = ownerOf(c);
        for (const { name, role } of this.roles) {
          if (name !== owner || !role.command) continue;
          try {
            role.command(c, cx);
          } catch (e) {
            console.log(`plato ${name}: ${c} failed: ${e}`);
          }
          cx.notify();
        }
      }
    });
  }

  /** Herdr closes this copy (the app quits or the layout changes): each role's quit(), if it
   *  has one. (Not close(): the dialog roles use that name to close their dialog.) */
  close(cx) {
    return Promise.all(this.roles.map(({ role }) => role.quit?.(cx)));
  }

  render(cx) {
    if (!this.roles.length) return div().child(`plato: no role "${props()?.role}"`);
    const drawn = this.roles.map(({ name, role }) => KIT.has(name)
      ? root(div().id("plato-root").size_full().child(role.render(cx)))
      : role.render(cx));
    if (drawn.length === 1) return drawn[0];
    return v_flex().size_full().children(drawn.map((el, i) => div().id(`plato-check-${i}`).h(200).overflow_hidden().child(el)));
  }
}
