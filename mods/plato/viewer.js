// A markdown file in a pane. openInViewer (keys.js) sets shared viewerKey(space) to
// change the file; props.file is only the first one.

import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { props, shared, panes, run, readTextFile } from "herdr";
import { C, box } from "./look.js";
import { viewerKind } from "./logic.js";
import { viewerKey } from "./shared.js";

const MAX = 200000;

export default class Viewer {
  init(p) {
    this.p = p ?? {};
    this.file = null;
    this.text = "";
    this.kind = "text";
  }

  load(cx, file) {
    this.file = file;
    this.text = "";
    cx.spawn(async (cx) => {
      const t = await readTextFile(file).catch(() => null);
      if (this.file !== file) return;
      this.kind = viewerKind(file, t);
      const body = this.kind === "binary" ? "" : t.length > MAX ? t.slice(0, MAX) + "\n\n(cut at 200 KB)" : t;
      this.text = this.kind === "markdown" ? body : this.kind === "text" ? `~~~~~~\n${body}\n~~~~~~` : "*This file is not text.*";
      cx.notify();
    });
  }

  render(cx) {
    const pr = props() ?? this.p;
    const file = shared(viewerKey(pr.space)) ?? pr.file;
    if (file && file !== this.file) this.load(cx, file);
    const close = () => {
      const pane = pr.pane ?? panes().find((p) => p.mod === "plato" && p.focused)?.pane ?? panes().find((p) => p.mod === "plato")?.pane;
      if (pane) run("pane.close", { pane });
    };
    const head = h_flex().gap(8)
      .child(div().flex_1().min_w(0).truncate().text_color(C.bright).child((file ?? "").split("/").pop()))
      .child(div().id("viewer-close").cursor_pointer().text_color(C.dim).hover((s) => s.text_color(C.fg)).on_click(close).child("close"));
    const doc = div().id("viewer-doc").flex_1().min_h(0).overflow_y_scrollbar().text_color(C.fg)
      .child(TextView.markdown(`md-${file}`, this.text).selectable(true));
    return box("viewer", v_flex().flex_1().min_h(0).gap(6).child(head).child(doc), "viewer");
  }
}
