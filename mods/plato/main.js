// PLATO: the whole PLATO layout is this one mod, in roles.
// The layout and overlays give each copy props { role }:
//   banner      the top line: lesson (space), pages (tabs), prompt or clock
//   index       the spaces as a PLATO index page, a letter each
//   talkomatic  the agents of the current space, one line each
//   cal         the month, like Unix cal
//   notes       markdown files of the current project
//   keyset      NEXT BACK HELP TERM LAB DATA
//   help        the HELP page (a dialog)
//   data        the DATA quick note (a dialog)
//   lesson      the PLATO lesson (a dialog, opened from HELP with L)
//   notesfile   the lesson's full notesfile (a dialog, a click on NOTES)
//   calendar    three months (a dialog, a click on CAL)
//   peekbar     the title bar of a MONITOR peek (a dialog with a terminal)
//   files       the project folder tree
//   viewer      a file in a pane (markdown rendered, text plain)

import { View, div } from "gpui-kit";
import { props, nextCommand } from "herdr";
import { root } from "./kit.js";
import Banner from "./banner.js";
import Keyset from "./keyset.js";
import Help from "./help.js";
import Index from "./index.js";
import Talkomatic from "./talkomatic.js";
import Cal from "./cal.js";
import Notes from "./notes.js";
import Viewer from "./viewer.js";
import Files from "./files.js";
import Data from "./data.js";
import LessonView from "./lessonview.js";
import NotesFile from "./notesfile.js";
import CalView from "./calview.js";
import PeekBar from "./peekbar.js";

const ROLES = { banner: Banner, keyset: Keyset, help: Help, index: Index, talkomatic: Talkomatic, cal: Cal, notes: Notes, viewer: Viewer, files: Files, data: Data, lesson: LessonView, notesfile: NotesFile, calendar: CalView, peekbar: PeekBar };

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
