// The PLATO index page: each space as a lettered lesson. Click a line, or
// press INDEX (plato.index) and then a letter. Escape goes back unchanged.
// EDIT (plato.edit) renames a lesson in place: the current one, or, while
// choosing, EDIT then a letter (or Enter for the highlighted lesson).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, run, focused, panes, props, closeOverlay, shared } from "herdr";
import { C, box, inv, shortcut, lineInput } from "./kit.js";
import { spaceLetter, letterIndex, letterCommands, spaceCommands, indexNav, editLine, editStart, renameCommand } from "./logic.js";
import { setPlace, bindingFor, dialogClosed } from "./keys.js";

const MARK = { blocked: "!", done: "*", working: "~" };

export default class Index {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    this.h = cx.focus_handle();
    this.choosing = false;
    this.armed = false; // EDIT pressed while choosing: the next letter or Enter picks the lesson
    this.editing = null; // { i, line } while a lesson name is being edited
    this.back = null;
    this.dialog = Boolean(pr.dialog); // opened by FOCUS mode as a dialog
    this.hi = 0;
    this.token = 0;
    this.editToken = 0;
    this.seenEdit = shared("plato.edit")?.at ?? null;
    if (this.dialog && pr.edit) this.startEdit(this.activeIndex(), cx);
    else if (this.dialog) this.start(cx);
  }

  activeIndex() {
    return Math.max(0, spaces().findIndex((s) => s.active));
  }

  /** Start choosing: highlight the active space, take the keyboard. */
  start(cx) {
    this.choosing = true;
    this.armed = false;
    this.hi = this.activeIndex();
    this.h.focus();
    setPlace("index");
    this.expire(cx);
  }

  /** Choosing ends by itself after 10 s without an index key (a safety net for
   *  leaving the index in a way that its focus check does not see). */
  expire(cx) {
    if (this.dialog) return; // a dialog is visible and Esc closes it
    const token = ++this.token;
    cx.timer.after(10000, (cx) => {
      if (token !== this.token || !this.choosing) return;
      this.stop();
      cx.notify();
    });
  }

  stop() {
    this.choosing = false;
    this.armed = false;
    setPlace(null);
  }

  go(i) {
    const cmds = spaceCommands(spaces()[i], panes());
    if (!cmds.length) return;
    this.stop();
    for (const [name, args] of cmds) run(name, args);
    this.done();
  }

  done() {
    if (!this.dialog) return;
    dialogClosed("index");
    closeOverlay(props().overlay);
  }

  command(c, cx) {
    if (c !== "index") return;
    this.back = focused()?.pane ?? null;
    this.start(cx);
  }

  leave() {
    this.stop();
    const pane = focused()?.pane ?? this.back;
    if (pane) run("pane.focus", { pane });
  }

  /** EDIT: turn lesson i into an editable name. */
  startEdit(i, cx) {
    if (!spaces()[i]) return;
    if (!this.dialog && !this.choosing) this.back = focused()?.pane ?? null;
    this.choosing = false;
    this.armed = false;
    this.editing = { i, line: editStart(spaces()[i]) };
    this.h.focus();
    setPlace("edit");
    this.editExpire(cx);
  }

  /** In the column, an edit line ends unsaved after 60 s without a key. */
  editExpire(cx) {
    if (this.dialog || !cx) return;
    const token = ++this.editToken;
    cx.timer.after(60000, (cx) => {
      if (token !== this.editToken || !this.editing) return;
      this.editing = null;
      setPlace(null);
      cx.notify();
    });
  }

  endEdit(save) {
    const s = this.editing && spaces()[this.editing.i];
    if (save && s) {
      const [name, args] = renameCommand("space", s.id, this.editing.line.text);
      run(name, args);
    }
    this.editing = null;
    setPlace(null);
    if (this.dialog) this.done();
    else this.leave();
  }

  /** The EDIT key reaches dialogs through shared state ("plato.edit"). */
  takeEditRequest(cx) {
    const req = shared("plato.edit");
    if (!req || req.at === this.seenEdit) return;
    this.seenEdit = req.at;
    if (this.editing || req.tab) return; // EDIT TAB belongs to TALKOMATIC
    if (req.arm) {
      if (this.choosing) this.armed = true;
    } else if (!this.dialog) {
      // focus() cannot run during render: start the edit right after it.
      cx.timer.after(0, (cx) => { this.startEdit(this.activeIndex(), cx); cx.notify(); });
    }
  }

  key(e, cx) {
    const mods = e.modifiers ?? {};
    if (this.editing) {
      if (e.key === "escape") this.endEdit(false);
      else if (e.key === "enter") this.endEdit(true);
      else {
        const clip = mods.platform && e.key === "v" ? cx.read_from_clipboard() : undefined;
        const next = editLine(this.editing.line, { key: e.key, mods, char: e.key_char, clip });
        if (!next) return;
        this.editing.line = next;
        this.editExpire(cx);
      }
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (!this.choosing) return;
    const nav = indexNav({ key: e.key, mods }, this.hi, spaces().length);
    if (e.key === "escape") {
      if (this.armed) this.armed = false;
      else {
        this.stop();
        if (this.dialog) this.done();
        else this.leave();
      }
    } else if (this.armed && e.key === "enter") {
      this.startEdit(this.hi, cx);
    } else if (this.armed && letterIndex(e.key) >= 0) {
      this.startEdit(letterIndex(e.key), cx);
    } else if (nav && "hi" in nav) {
      this.hi = nav.hi;
      this.expire(cx);
    } else if (nav && "go" in nav) {
      this.go(nav.go);
    } else {
      const cmds = letterCommands(e.key, spaces(), panes());
      if (!cmds.length) return;
      this.stop();
      for (const [name, args] of cmds) run(name, args);
      this.done();
    }
    cx.stop_propagation();
    cx.notify();
  }

  render(cx) {
    if (!this.dialog && this.choosing && !this.h.is_focused()) this.stop();
    this.takeEditRequest(cx);
    const row = (s, i) => {
      const letter = spaceLetter(i);
      if (this.editing && this.editing.i === i) {
        return h_flex().id(`sp-${s.id}`).gap(6).border_b(1).border_color(C.bright).text_color(C.bright)
          .child(div().w(18).flex_none().child(letter ? `${letter}.` : ""))
          .child(div().flex_1().min_w(0).overflow_hidden().child(lineInput(this.editing.line, s.name)));
      }
      const el = h_flex().id(`sp-${s.id}`).gap(6).cursor_pointer().on_click(() => { run("space.select", { id: s.id }); this.done(); })
        .on_mouse_down("right", (_e, cx) => { this.startEdit(i, cx); cx.stop_propagation(); cx.notify(); })
        .child(div().w(18).flex_none().child(letter ? `${letter}.` : ""))
        .child(div().flex_1().min_w(0).truncate().child(s.name))
        .child(div().flex_none().text_color(C.bright).child(MARK[s.status] ?? ""));
      const lit = this.choosing && i === this.hi;
      const shown = lit ? el.bg(C.glow).text_color(C.bright) : el;
      return s.active && !lit ? inv(el) : shown.hover((x) => x.text_color(C.bright));
    };
    const list = v_flex().id("index-scroll").flex_initial().min_h(0).overflow_y_scrollbar()
      .child(v_flex().gap(2).children(spaces().map(row)));
    const newLesson = div().id("new-lesson").mt(6).text_color(C.dim).cursor_pointer().hover((x) => x.text_color(C.fg))
      .on_click(() => run("space.new")).child("+ new lesson");
    const prompt = this.editing ? "EDIT · Enter saves · Esc · empty = automatic name"
      : this.armed ? "EDIT · letter, or Enter for the highlighted one · Esc"
      : this.choosing ? "letter, or ctrl-n/p and Enter · EDIT · Esc" : null;
    const body = v_flex().id("index-keys").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx)).flex_1().min_h(0)
      .child(list)
      .child(newLesson)
      .when(Boolean(prompt), (el) => el.child(div().mt(8).text_color(C.bright).loop("opacity", { from: 0.5, to: 1, period: 1200 }).child(prompt)));
    const key = shortcut(bindingFor("index"));
    const edit = shortcut(bindingFor("edit"));
    const title = this.dialog ? "index · choose a lesson" : key ? `index  ${key}${edit ? `  · edit ${edit}` : ""}` : "index";
    return box(title, body, "index");
  }
}
