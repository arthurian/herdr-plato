// FILES: the project's folder tree in the PLATO look. The project folder is the
// git root of the focused pane's folder, else that folder, else the last one
// shown in this space. A click on a folder opens or closes it; a click on a
// file shows it in the viewer pane. props.title names the panel; without it, "files".

import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, shared, exec, watchFolder, home, focused, panes } from "herdr";
import { C, box, inv } from "./look.js";
import { parseListing, folderRows, dirsToRefresh, projectFolder, notesCwd } from "./logic.js";
import { openInViewer } from "./keys.js";
import { viewerKey } from "./shared.js";

export default class Files {
  init(p) {
    this.label = p?.title ?? "files";
    this.root = null;
    this.listings = {};
    this.open = new Set();
    this.gen = 0;
    this.saved = {}; // root -> open folders, so a project keeps its tree
    this.last = {}; // space id -> last project folder shown there
    this.key = undefined;
    this.findGen = 0;
  }

  async list(dir, gen) {
    const abs = dir ? `${this.root}/${dir}` : this.root;
    const r = await exec("ls", ["-1Ap", abs]).catch(() => null);
    if (gen !== this.gen) return;
    this.listings[dir] = r && r.code === 0 ? parseListing(r.stdout) : [];
  }

  follow(cx) {
    const space = spaces().find((s) => s.active)?.id ?? "";
    const cwd = notesCwd(focused(), panes());
    const key = `${space}|${cwd}`;
    if (key === this.key) return;
    this.key = key;
    const gen = ++this.findGen;
    cx.spawn(async (cx) => {
      const r = cwd ? await exec("git", ["rev-parse", "--show-toplevel"], { cwd }).catch(() => null) : null;
      if (gen !== this.findGen) return;
      const root = projectFolder(r && r.code === 0 ? r.stdout.trim() : null, cwd, this.last[space] ?? null);
      if (root) this.last[space] = root;
      this.setRoot(root, cx);
      cx.notify();
    });
  }

  setRoot(root, cx) {
    if (root === this.root) return;
    if (this.root) this.saved[this.root] = this.open;
    this.root = root;
    this.listings = {};
    this.open = new Set(root ? this.saved[root] ?? [] : []);
    const gen = ++this.gen;
    if (!root) return;
    cx.spawn(async (cx) => {
      for (const d of ["", ...this.open]) await this.list(d, gen);
      if (gen !== this.gen) return;
      cx.notify();
      if (root === home()) return; // never watch the whole home folder
      while (gen === this.gen) {
        const changed = await watchFolder(root).catch(() => null);
        if (gen !== this.gen) return;
        const dirs = dirsToRefresh(changed ?? [root], root, new Set(["", ...this.open]));
        if (!dirs.length) continue;
        for (const d of dirs) await this.list(d, gen);
        if (gen !== this.gen) return;
        cx.notify();
      }
    });
  }

  toggle(path, cx) {
    if (this.open.has(path)) {
      for (const p of [...this.open]) if (p === path || p.startsWith(path + "/")) this.open.delete(p);
      cx.notify();
      return;
    }
    this.open.add(path);
    const gen = this.gen;
    cx.spawn(async (cx) => { await this.list(path, gen); if (gen === this.gen) cx.notify(); });
    cx.notify();
  }

  render(cx) {
    this.follow(cx);
    const space = spaces().find((s) => s.active)?.id;
    const shownFile = shared(viewerKey(space));
    const rows = folderRows(this.listings, this.open);
    const row = (r, i) => {
      const abs = `${this.root}/${r.path}`;
      const el = div().id(`f-${i}`).pl(4 + r.depth * 14).truncate().cursor_pointer()
        .on_click((_e, cx) => (r.dir ? this.toggle(r.path, cx) : openInViewer(abs)))
        .child(r.dir ? `${r.open ? "▾" : "▸"} ${r.name}/` : `  ${r.name}`);
      return !r.dir && abs === shownFile ? inv(el) : el.hover((s) => s.text_color(C.bright));
    };
    const body = !this.root
      ? div().text_color(C.dim).child("...")
      : rows.length
        ? v_flex().children(rows.map(row))
        : div().text_color(C.dim).child("empty folder");
    const title = this.root ? `${this.label} · ${this.root.split("/").pop()}` : this.label;
    return box(title, v_flex().id("files-scroll").flex_1().min_h(0).overflow_y_scrollbar().child(body), "files");
  }
}
