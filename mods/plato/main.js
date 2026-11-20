// plato: the keyset, HELP, FILES and the file viewer of the PLATO, in roles.
// The layout and overlays give each copy props { role }:
//   keyset   the boxed PLATO keys along the bottom, and the SIGNAL line in FOCUS
//   help     the HELP page (a dialog)
//   files    the project folder tree
//   viewer   a file in a pane (markdown rendered, text plain)

import { View, div } from "gpui-kit";
import { props, nextCommand } from "herdr";
import { root } from "./kit.js";
import Keyset from "./keyset.js";
import Help from "./help.js";
import Viewer from "./viewer.js";
import Files from "./files.js";

const ROLES = { keyset: Keyset, help: Help, viewer: Viewer, files: Files };

export default class Plato extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    this.roleName = pr.role;
    const R = ROLES[pr.role];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          this.role?.command?.(c, cx);
        } catch (e) {
          console.log(`plato ${this.roleName}: ${c} failed: ${e}`);
        }
        cx.notify();
      }
    });
  }

  render(cx) {
    if (!this.role) return div().child(`plato: no role "${props()?.role}"`);
    return root(div().id("plato-root").size_full().child(this.role.render(cx)));
  }
}
