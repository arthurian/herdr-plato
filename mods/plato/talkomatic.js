// TALKOMATIC: every shell and agent of the current space, in the NEXT order,
// with the agent's status (or "shell") and its title. Other spaces with
// agents that need you get one line each at the bottom.
// MONITOR: "monitor" on each row but yours peeks at that terminal over the tab
// (PLATO term-talk's monitor mode); a right-click on a row does the same, and
// MONITOR (plato.monitor) then a row number does it from the keyboard.
// EDIT: while choosing, EDIT then a row number renames that row's tab (page).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, panes, run, setAgentOrder, focused, props, closeOverlay, shared } from "herdr";
import { C, box, inv, shortcut, lineInput } from "./kit.js";
import { talkRows, monitorTarget, editLine, editStart, renameCommand, currentTabRow } from "./logic.js";
import { setPlace, bindingFor, dialogClosed, openPeek } from "./keys.js";

export default class Talkomatic {
  init(p, cx) {
    this.h = cx.focus_handle();
    this.choosing = false;
    this.armed = false; // EDIT pressed while choosing: the next number picks the row
    this.editing = null; // { row, line } while a tab name is being edited
    this.token = 0;
    this.editToken = 0;
    this.rows = [];
    const pr = props() ?? p ?? {};
    this.dialog = Boolean(pr.dialog); // opened by MONITOR in focus mode
    this.editTab = Boolean(pr.editTab); // opened by EDIT TAB in focus mode
    this.seenEdit = shared("plato.edit")?.at ?? null;
    if (this.dialog) this.start(cx);
  }

  command(c, cx) {
    if (c !== "monitor" || this.dialog) return;
    // The same key closes an open peek; do not start choosing then.
    if (shared("plato.dialog.peek") || Date.now() - (shared("plato.peekClosed") ?? 0) < 1500) return;
    this.back = focused()?.pane ?? null;
    this.start(cx);
  }

  start(cx) {
    this.choosing = true;
    this.armed = false;
    this.h.focus();
    setPlace("monitor");
    if (this.dialog) return; // a dialog is visible and Esc closes it
    const token = ++this.token;
    cx.timer.after(10000, (cx) => {
      if (token === this.token && this.choosing) { this.stop(); cx.notify(); }
    });
  }

  stop() {
    this.choosing = false;
    this.armed = false;
    setPlace(null);
  }

  /** Leave choose mode and give the keyboard back (the column) or close (the dialog). */
  leave() {
    this.stop();
    if (this.dialog) { dialogClosed("monitor"); return closeOverlay(props().overlay); }
    const pane = focused()?.pane ?? this.back;
    if (pane) run("pane.focus", { pane });
  }

  /** EDIT on row n (1-9): edit the name of that row's tab. */
  startEdit(key, cx) {
    if (!/^[1-9]$/.test(key)) return false;
    return this.editRow(this.rows[Number(key) - 1], cx);
  }

  /** EDIT TAB: edit the name of the tab you are in, from its row. */
  editCurrentTab(cx) {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((t) => t.active)?.id;
    const r = currentTabRow(this.rows, tab);
    if (!r) return;
    if (!this.dialog) this.back = focused()?.pane ?? null;
    this.h.focus();
    this.editRow(r, cx);
  }

  editRow(r, cx) {
    if (!r) return false;
    this.choosing = false;
    this.armed = false;
    this.editing = { row: r, line: editStart({ named: Boolean(r.tabName), name: r.tabName }) };
    setPlace("edit");
    this.editExpire(cx);
    return true;
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
    if (save && this.editing) {
      const [name, args] = renameCommand("tab", this.editing.row.tab, this.editing.line.text);
      run(name, args);
    }
    this.editing = null;
    this.leave();
  }

  /** The EDIT key reaches this copy through shared state ("plato.edit"). */
  takeEditRequest(cx) {
    const req = shared("plato.edit");
    if (!req || req.at === this.seenEdit) return;
    this.seenEdit = req.at;
    if (this.editing) return;
    if (req.arm && this.choosing) this.armed = true;
    // focus() cannot run during render: start the edit right after it.
    else if (req.tab && !this.dialog) cx.timer.after(0, (cx) => { this.editCurrentTab(cx); cx.notify(); });
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
    if (e.key === "escape") {
      if (this.armed) this.armed = false;
      else this.leave();
    } else if (this.armed) {
      if (!this.startEdit(e.key, cx)) return;
    } else {
      const t = monitorTarget(e.key, this.rows);
      if (!t) return;
      this.leave();
      openPeek(t);
    }
    cx.stop_propagation();
    cx.notify();
  }

  render(cx) {
    const space = spaces().find((s) => s.active);
    const all = agents();
    if (!this.dialog && this.choosing && !this.h.is_focused()) this.stop();
    this.takeEditRequest(cx);
    const rows = talkRows(space, panes(), all);
    this.rows = rows;
    if (this.editTab && !this.editing && rows.length) { this.editTab = false; cx.timer.after(0, (cx) => { this.editCurrentTab(cx); cx.notify(); }); }
    setAgentOrder(rows.filter((r) => r.agent).map((r) => r.terminal));
    const row = (r, i) => {
      const on = r.focused;
      const blocked = r.status === "blocked";
      const editingThis = this.editing && this.editing.row.pane === r.pane;
      const word = r.word + (r.tabName ? ` · ${r.tabName}` : "");
      const second = editingThis
        ? div().pl(24).border_b(1).border_color(C.bright).text_color(C.bright).overflow_hidden().child(lineInput(this.editing.line, "tab name"))
        : div().pl(24).text_color(on ? C.inv : C.dim).truncate().child(r.title);
      let el = v_flex().id(`tk-${r.pane}`).cursor_pointer().on_click(() => run("pane.focus", { pane: r.pane }))
        .on_mouse_down("right", (_e, cx) => { if (r.peek) { openPeek(r.terminal); cx.stop_propagation(); } })
        .child(h_flex().gap(6)
          .child(div().w(18).flex_none().child(String(i + 1)))
          .child(div().flex_1().min_w(0).truncate().text_color(on && !editingThis ? C.inv : blocked ? C.bright : r.agent ? C.fg : C.dim).child(word))
          .when(r.peek && !editingThis, (el) => el.child(div().id(`mon-${r.pane}`).flex_none().text_color(C.dim).cursor_pointer()
            .hover((x) => x.text_color(C.bright))
            .on_click((_e, cx) => { openPeek(r.terminal); cx.stop_propagation(); })
            .child("monitor"))))
        .child(second);
      if (blocked && !editingThis) el = el.loop("opacity", { from: 0.55, to: 1, period: 1400 });
      return on && !editingThis ? inv(el) : el.hover((x) => x.text_color(C.bright));
    };
    const others = spaces().filter((s) => s.id !== space?.id)
      .map((s) => ({ s, n: all.filter((a) => a.space === s.id && a.status === "blocked").length }))
      .filter((x) => x.n > 0);
    const body = v_flex().flex_1().min_h(0).gap(4)
      .child(rows.length
        ? v_flex().id("talk-scroll").flex_initial().min_h(0).overflow_y_scrollbar().child(v_flex().gap(4).children(rows.map(row)))
        : div().text_color(C.dim).child("no terminals in this lesson"))
      .child(div().flex_1())
      .children(others.map(({ s, n }) =>
        div().id(`need-${s.id}`).text_color(C.bright).cursor_pointer().on_click(() => run("space.select", { id: s.id }))
          .child(`${n} in ${s.name} need${n === 1 ? "s" : ""} you`)));
    const key = shortcut(bindingFor("monitor"));
    const title = this.dialog ? "talkomatic · monitor" : key ? `talkomatic  ${key}` : "talkomatic";
    const prompt = this.editing ? "EDIT · tab name · Enter saves · Esc"
      : this.armed ? "EDIT · row number · Esc"
      : this.choosing ? "row number · EDIT · Esc" : null;
    const keyed = v_flex().id("talk-keys").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx)).flex_1().min_h(0)
      .child(body)
      .when(Boolean(prompt), (el) => el.child(div().mt(6).text_color(C.bright).loop("opacity", { from: 0.5, to: 1, period: 1200 }).child(prompt)));
    return box(title, keyed, "talkomatic");
  }
}
