// The jump role: JUMP (cmd-j), a dialog that finds a tab by its code, space, name, purpose
// or folder, the way consult narrows a list as you type. The route role opens it.
//   props { role: "jump", query }: query is text already typed (plato.jump:<text>), or "".
// Every tab is listed, grouped as SIGNALS groups them: the agents that need you in NEXT1
// order, then the working ones, then the idle tabs in line order. Each word you type must
// match, in any order, and the matched letters light up. A code (c3) or a space's letter
// comes first, so a code and Enter still go at once. Beside the list is the selected tab's
// LOOK card. Enter goes there (plato.goto), the arrows or ctrl-n and ctrl-p move, Tab and
// shift-Tab change the group, Esc or ctrl-g closes. A click selects a row, a double click
// goes there.

import { div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { props, closeOverlay, spaces, panes, agents, terminals, focused, shared, run, home, appHome, readTextFile, checking } from "herdr";
import { C } from "./look.js";
import { stops, currentStop, purposeOf, duration } from "./line.js";
import { letterColumns, signalRows, jumpList, jumpGroupStep, jumpWords, matchSegs, tabState, stateSince, lookStep, JUMP_GROUPS } from "./overview.js";
import { editLine } from "./sign.js";
import { ownEnter } from "./logic.js";
import { dayKey, parseDay } from "./day.js";
import { lookCardFor } from "./lookdata.js";
import { dialogClosed, alive } from "./keys.js";
import { LINE } from "./shared.js";

const DATA = "plato-data"; // the day files (recorder.js), under the app home
const PER_LINE = 28;       // characters per line in the preview's value column
const GROUP_WORDS = { all: "ALL", waiting: "NEEDS YOU", working: "WORKING", idle: "IDLE" };
const GROUP_NOTE = { waiting: "NEXT1 order", working: "", idle: "line order" };
const STATE_WORDS = { waiting: "needs you", working: "working", idle: "idle" };

export default class Jump {
  init(_p, cx) {
    const q = String(props()?.query ?? "");
    this.field = { text: q, cursor: q.length };
    this.group = "all";
    this.sel = 0;
    this.day = null;
    this.done = false;
    this.rowAt = [];   // the list's child index of each row shown, for scrolling to it
    this.h = cx.focus_handle();
    this.h.focus();
    this.scroll = ScrollHandle.new();
    if (checking()) return;
    alive("jump", cx); // so the route's toggle and CLOSE know this dialog is still open
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${appHome()}/${DATA}/${dayKey(Date.now())}.json`).catch(() => null);
      this.day = parseDay(text);
      cx.notify();
    });
  }

  /** The stops now, each with its purpose and folder, and the list for what is typed. */
  world() {
    const line = shared(LINE) ?? null;
    const sp = spaces();
    const ps = panes();
    const all = stops(line, sp, ps);
    const terms = terminals();
    const h = home();
    const tilde = (f) => (f && h && f.startsWith(h) ? `~${f.slice(h.length)}` : f ?? "");
    const entries = all.map((stop) => {
      const term = terms.find((t) => t.address === stop.terminal);
      const pane = ps.find((p) => p.pane === stop.pane);
      return { stop, purpose: purposeOf(term?.labels)?.text ?? "", folder: tilde(pane?.cwd ?? term?.cwd ?? null) };
    });
    const waiting = signalRows(agents(), all).map((r) => r.stop?.code).filter(Boolean);
    const list = jumpList(entries, waiting, this.field.text, this.group, letterColumns(line, sp, all));
    return { line, sp, all, list, here: currentStop(all, focused()) };
  }

  close() {
    this.done = true;
    dialogClosed("jump");
    closeOverlay(props().overlay);
  }

  go(stop) {
    this.close();
    if (stop) run(`plato.goto:${stop.code}`);
  }

  move(n, key) {
    this.sel = lookStep(n, this.sel, key);
    const at = this.rowAt[this.sel];
    if (at != null) this.scroll.scroll_to_item(at);
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    const ctrl = m.control && !m.alt && !m.platform;
    const { list } = this.world();
    const n = list.picks.length;
    if (e.key === "escape" || (ctrl && e.key === "g")) this.close();
    else if (e.key === "enter") { if (!ownEnter(m)) return; this.go(list.picks[Math.min(this.sel, n - 1)]?.stop); } // with cmd: a layout key
    else if (e.key === "down" || (ctrl && e.key === "n")) this.move(n, "down");
    else if (e.key === "up" || (ctrl && e.key === "p")) this.move(n, "up");
    else if (e.key === "tab") { this.group = jumpGroupStep(this.group, m.shift); this.sel = 0; this.scroll.scroll_to_item(0); }
    else {
      const clip = m.platform && e.key === "v" ? cx.read_from_clipboard() : undefined;
      const next = editLine(this.field, { key: e.key, mods: m, char: e.key_char, clip });
      if (!next) return;
      if (next.text !== this.field.text) { this.sel = 0; this.scroll.scroll_to_item(0); }
      this.field = next;
    }
    cx.stop_propagation();
    cx.notify();
  }

  /** A key cap and what it does, as on the keyset; a click acts as the key does. */
  cap(id, key, word, act) {
    const el = h_flex().id(id).flex_none().gap(6).items_center()
      .child(div().px(5).border_1().border_color(C.dim).text_color(C.fg).child(key))
      .child(div().text_color(C.dim).child(word));
    return act ? el.cursor_pointer().on_click((_e, cx) => { act(); cx.notify(); }) : el;
  }

  /** The search field, with its cursor, as the sign pages draw theirs. */
  input() {
    const f = this.field;
    const cursor = f.cursor < f.text.length
      ? div().whitespace_nowrap().bg(C.fg).text_color(C.bg).child(f.text[f.cursor])
      : div().w(8).h(17).bg(C.bright).loop("opacity", { from: 0, to: 1, period: 1060 });
    return h_flex().flex_1().min_w(0).gap(8).px(10).py(4).border_1().border_color(C.fg)
      .child(div().flex_none().text_color(C.bright).child("▶"))
      .child(h_flex().flex_1().min_w(0).overflow_hidden()
        .child(div().whitespace_nowrap().text_color(C.fg).child(f.text.slice(0, f.cursor)))
        .child(cursor)
        .child(div().whitespace_nowrap().text_color(C.fg).child(f.text.slice(f.cursor + 1)))
        .when(!f.text, (x) => x.child(div().pl(6).text_color(C.dim).whitespace_nowrap().child("a name, a purpose, a folder, or a code like c3"))));
  }

  /** Text with the query's words lit. */
  lit(id, text, words, color, sel) {
    return h_flex().id(id).min_w(0).overflow_hidden().children(matchSegs(text, words).map((s) => div().whitespace_nowrap()
      .text_color(s.hit && !sel ? C.bright : color).when(s.hit && sel, (el) => el.underline())
      .child(s.text)));
  }

  row(e, i, words, here, now, sp) {
    const s = e.stop;
    const sel = i === this.sel;
    const state = tabState(s.status);
    const since = stateSince(s, sp);
    const time = since != null ? duration(since, now) : "";
    const stateText = `${s.program || "—"} · ${STATE_WORDS[state]}${time ? ` ${time === "now" ? "<1m" : time}` : ""}${here?.code === s.code ? " · here" : ""}`;
    const tone = state === "waiting" ? C.bright : state === "working" ? C.fg : C.dim;
    const ink = sel ? C.bg : C.fg;
    return h_flex().id(`jump-row-${s.code}`).w_full().gap(12).px(6).items_center().cursor_pointer()
      .when(sel, (el) => el.bg(C.fg))
      .on_click((ev, cx) => {
        if (ev.click_count >= 2) return this.go(s);
        this.sel = i;
        cx.notify();
      })
      .child(div().w(48).flex_none().font_weight(700).text_color(ink).child(s.code))
      .child(div().w(180).flex_none().overflow_hidden().child(this.lit(`jump-name-${s.code}`, `${s.spaceName} · ${s.label || "—"}`, words, ink, sel)))
      .child(div().w(230).flex_none().truncate().text_size(13).text_color(sel ? C.bg : tone).child(stateText))
      .child(div().flex_1().min_w(0).overflow_hidden().text_size(13)
        .child(this.lit(`jump-note-${s.code}`, e.purpose || e.folder, words, sel ? C.bg : e.purpose ? C.fg : C.dim, sel)));
  }

  /** The list: the code first, then each group with its heading. */
  listView(w, words, now) {
    const { list } = w;
    const kids = [];
    this.rowAt = [];
    const head = (label, note) => h_flex().gap(10).px(6).pt(6).text_size(12).text_color(C.dim)
      .child(div().child(label)).when(Boolean(note), (el) => el.child(div().child(note)));
    const add = (e) => { this.rowAt.push(kids.length); kids.push(this.row(e, this.rowAt.length - 1, words, w.here, now, w.sp)); };
    if (list.code) { kids.push(head("CODE", "↩ goes at once")); add(list.code); }
    for (const g of list.groups) { kids.push(head(`${GROUP_WORDS[g.key]} ${g.entries.length}`, GROUP_NOTE[g.key])); g.entries.forEach(add); }
    if (!kids.length) kids.push(div().px(6).py(24).text_color(C.dim).child("No tab matches. Backspace widens the list, and Esc closes JUMP."));
    return v_flex().id("jump-list").flex_1().min_w(0).overflow_y_scroll().track_scroll(this.scroll).children(kids);
  }

  /** The selected tab's LOOK card, smaller. */
  preview(w, stop, now) {
    const c = lookCardFor(stop, w.all, w.line, this.day, PER_LINE, now);
    const box = v_flex().id("jump-preview").w(420).flex_none().min_h(0).pl(20).border_l_1().border_color(C.glow).gap(10).text_size(13);
    if (!c) return box;
    const tone = { bright: C.bright, fg: C.fg, dim: C.dim, text: C.fg };
    return box
      .child(h_flex().gap(10).items_center()
        .child(div().text_size(12).text_color(C.dim).child("LOOK"))
        .child(div().w(22).h(22).flex_none().rounded_full().border_1().border_color(tone[c.tone]).text_color(tone[c.tone])
          .flex().items_center().justify_center().child(c.letter))
        .child(div().text_size(15).font_weight(700).child(c.code))
        .child(div().flex_1().min_w(0).truncate().text_size(15).child(c.where)))
      .child(div().text_color(c.tone === "dim" ? C.dim : tone[c.tone]).child(c.sub))
      .child(div().h(1).w_full().bg(C.glow))
      .child(v_flex().id("jump-preview-rows").flex_1().min_h(0).overflow_y_scroll().gap(8).children(c.rows.map((r) =>
        h_flex().w_full().gap(10).items_start()
          .child(div().w(100).flex_none().text_color(C.dim).child(r.k))
          .child(v_flex().flex_1().min_w(0)
            .children(r.lines.map((l) => div().text_color(tone[r.tone]).child(l)))
            .when(Boolean(r.note), (el) => el.child(div().text_size(12).text_color(C.dim).child(r.note)))))));
  }

  render() {
    const now = Date.now();
    const w = this.world();
    const { list } = w;
    const n = list.picks.length;
    if (this.sel >= n) this.sel = Math.max(n - 1, 0);
    const pick = list.picks[this.sel] ?? null;
    const words = jumpWords(this.field.text);
    const chips = JUMP_GROUPS.map((g) => {
      const on = g === this.group;
      return div().id(`jump-group-${g}`).px(8).border_1().cursor_pointer().text_size(13)
        .border_color(on ? C.fg : C.glow).bg(on ? C.fg : C.bg).text_color(on ? C.bg : g === "waiting" ? C.bright : C.fg)
        .on_click((_e, cx) => { this.group = g; this.sel = 0; cx.notify(); })
        .child(`${GROUP_WORDS[g]} ${list.counts[g]}`);
    });
    return v_flex().id("jump").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(12).bg(C.bg).text_color(C.fg).border_1().border_color(C.fg)
      .child(h_flex().gap(14).items_center()
        .child(div().flex_none().child("JUMP"))
        .child(this.input())
        .child(div().flex_none().text_color(C.dim).child(`${n} of ${w.all.length}`)))
      .child(h_flex().gap(8).items_center().children(chips)
        .child(div().pl(6).text_size(13).text_color(C.dim).child("⇥ next group")))
      .child(div().h(1).w_full().bg(C.glow))
      .child(h_flex().flex_1().min_h(0).gap(20).items_start()
        .child(this.listView(w, words, now))
        .child(this.preview(w, pick?.stop ?? null, now)))
      .child(div().h(1).w_full().bg(C.glow))
      .child(h_flex().gap(18).text_size(13).items_center()
        .child(this.cap("jump-go", "↩", pick ? `go ${pick.stop.code}` : "go", pick ? () => this.go(pick.stop) : null))
        .child(this.cap("jump-move", "↑↓ ⌃N ⌃P", "move", null))
        .child(this.cap("jump-tab", "⇥", "group", () => { this.group = jumpGroupStep(this.group, false); this.sel = 0; }))
        .child(this.cap("jump-close", "esc ⌃G", "close", () => this.close()))
        .child(div().flex_1())
        .child(div().text_color(C.dim).child("a double click goes too")));
  }
}
