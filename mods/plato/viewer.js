// A markdown file in a pane. NOTES sets shared "plato.viewer.<space id>" to
// change the file; props.file is only the first one.

import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { props, shared, setShared, spaces, panes, run, readTextFile } from "herdr";
import { C, box } from "./kit.js";
import { viewerKind } from "./logic.js";

const MAX = 200000;

/** Show a file in this space's viewer pane, opening one beside the terminal if needed. */
export function openInViewer(file) {
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs.find((t) => t.active);
  if (!space) return;
  setShared(`plato.viewer.${space.id}`, file);
  if (panes().some((p) => p.mod === "plato" && p.tab === tab?.id)) return;
  run("pane.split", { direction: "right", mod: "plato", props: { role: "viewer", file, space: space.id } });
}

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
    const file = shared(`plato.viewer.${pr.space}`) ?? pr.file;
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
