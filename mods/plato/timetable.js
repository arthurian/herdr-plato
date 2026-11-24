// The timetable role: TODAY, the middle of the right column. Who waited on you today, and for
// how long. The train graph shows the last 2, 6, 12 or 24 hours of recorded time (a click on
// "last 2h" steps it; the command plato.span too), ending now (one row
// per space letter: ran, idle, waited on you; a break where the app was closed; the path
// you took between spaces). At the right end of each row: how long it ran and waited today.
// Under it, the response line (waits answered, typical, longest), then the due list from
// plato.line when there is one. A click on a row's letter or figures goes to that space; a
// click on a wait box goes to the stop that waited.
// The banner records the day (recorder.js) to plato-data/YYYY-MM-DD.json under the app home;
// this panel reads today's file as it starts, after each change in that folder, and when the
// day turns. Another layout, or a closed app, is a gap.

import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar } from "gpui-base";
import { spaces, panes, shared, setShared, appHome, readTextFile, watchFolder, checking, run } from "herdr";
import { C, FONT } from "./look.js";
import { stops } from "./line.js";
import {
  dayKey, dayStart, parseDay, freshDay, SPANS, daysBefore,
  build, dueList, daysWords, waits, responseWords, rowTotals, short, windowAxis, xAt, windowTicks, waitCode,
} from "./day.js";
import { LINE, TODAY_SPAN } from "./shared.js";

const DIR = "plato-data";
const LX = 16;   // the letter column
const RH = 20;   // one space row
const TOP = 12;  // room for "now" above the rows
const PATH_DY = 6; // your path runs just under each row's line, clear of the bars
const WORDS = 68;  // the ran and waited figures at the right end of each row
const U = 1000;       // the graph area's width in per-mille; drawn as percentages
const U_BREAK = 25;   // a closed stretch, in per-mille (about 6 px)
const U_TICK = 140;   // the least room between hour labels, in per-mille

export default class Timetable {
  init(_p, cx) {
    this.today = null;    // today's file, once read: { key, events }
    this.events = null;   // today's events, once read
    this.reading = false;
    this.before = new Map(); // earlier days' events, read when the window reaches past midnight: day -> events
    this.loading = new Set();
    this.tick(cx);
    if (checking()) { this.events = []; return; }
    this.readToday(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        // No folder yet (the banner has not written): look again in a few seconds.
        try { await watchFolder(`${appHome()}/${DIR}`); } catch { await cx.sleep(5000); continue; }
        await this.readToday(cx);
      }
    });
  }

  /** Read today's file. A read caught in the middle of a write is shorter than the last one,
   *  and freshDay keeps the last one then. */
  async readToday(cx) {
    this.reading = true;
    const key = dayKey(Date.now());
    const text = await readTextFile(this.file(key)).catch(() => null);
    this.today = freshDay(this.today, { key, events: parseDay(text) });
    this.events = this.today.events;
    this.reading = false;
    cx.notify();
  }

  /** "span" steps the window, as a click on "last 2h" does (for scripts and checks). */
  command(c) {
    if (c === "span") setShared(TODAY_SPAN, ((shared(TODAY_SPAN) ?? 0) + 1) % SPANS.length);
  }

  file(day) {
    return `${appHome()}/${DIR}/${day}.json`;
  }

  /** The clock: redraw at each minute. */
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => { cx.notify(); this.tick(cx); });
  }

  render(cx) {
    const now = Date.now();
    if (this.today && this.today.key !== dayKey(now) && !this.reading && !checking()) cx.spawn(async (cx) => this.readToday(cx)); // the day turned
    const line = shared(LINE) ?? null;
    const sp = spaces();
    const spells = this.events ? waits(this.events, now) : [];
    const body = v_flex().gap(6).pr(8)
      .child(this.graph(line, now, spells, cx))
      .child(div().text_size(12).line_height("15px").child(responseWords(spells)))
      .when(dueList(line, sp, now).length > 0, (el) => el.child(this.due(line, sp, now)));
    return v_flex().id("timetable").size_full().font_family(FONT).text_size(14).line_height("19px").bg(C.bg).text_color(C.fg).p(2)
      .child(v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
        v_flex().flex_1().min_h(0).border_1().border_color(C.fg).px(6).py(3).gap(4)
          .child(h_flex().justify_between()
            .child(div().text_color(C.dim).child("TODAY"))
            .child(this.spanNote()))
          // The panel keeps its height (the layout's block). When the graph, the response line and
          // the due list need more, they scroll: a box takes the space, the scroll area fills it,
          // and the bar lies on top (Herdr's overflow_*_scrollbar would swallow the flex size).
          .child(div().flex_1().min_h(0).relative()
            .child(div().id("tt-scroll").absolute().inset_0().overflow_y_scroll().child(body))
            .child(Scrollbar.vertical("tt-scroll").absolute().inset_0()))));
  }

  /** "last 2h · totals today": a click steps the window through 2, 6, 12 and 24 hours. */
  spanNote() {
    const i = shared(TODAY_SPAN) ?? 0;
    const hours = (SPANS[i] ?? SPANS[0]) / 3600000;
    const label = `last ${hours}h`;
    return h_flex().gap(4).text_size(12).text_color(C.dim)
      .child(div().id("tt-span").px(2).cursor_pointer().text_color(C.fg).hover((st) => st.bg(C.glow))
        .on_click(() => setShared(TODAY_SPAN, (i + 1) % SPANS.length)).child(label))
      .child(div().child("· totals today"));
  }

  /** Go to a stop by code, or to a space's active tab (as a click on the route does). */
  go(code, letter) {
    const line = shared(LINE) ?? null;
    const all = stops(line, spaces(), panes());
    let stop = code ? all.find((s) => s.code === code) : null;
    if (!stop && letter) {
      const space = spaces().find((sp) => sp.id === (line?.slots ?? []).find((s) => s.letter === letter)?.space);
      const tab = space?.tabs.find((t) => t.active)?.id;
      stop = all.find((s) => s.space === space?.id && s.tab === tab) ?? all.find((s) => s.space === space?.id);
    }
    if (!stop) return;
    run("space.select", { id: stop.space });
    run("tab.select", { id: stop.tab });
    if (stop.pane) run("pane.focus", { pane: stop.pane });
  }

  /** The chosen window, and the earlier days' files it reaches into, each read once. */
  window(now, cx) {
    const span = SPANS[shared(TODAY_SPAN) ?? 0] ?? SPANS[0];
    const days = checking() ? [] : daysBefore(now, span);
    if (!days.length) return { span, since: dayStart(now), events: this.events };
    for (const day of days) {
      if (this.before.has(day) || this.loading.has(day)) continue;
      this.loading.add(day);
      cx.spawn(async (cx) => {
        const text = await readTextFile(this.file(day)).catch(() => null);
        this.before.set(day, parseDay(text));
        this.loading.delete(day);
        cx.notify();
      });
    }
    const before = days.flatMap((d) => this.before.get(d) ?? []);
    return { span, since: now - span, events: before.length ? [...before, ...this.events] : this.events };
  }

  graph(line, now, spells, cx) {
    if (!this.events) return div().text_color(C.dim).child("…");
    // The window may reach into yesterday; the totals are today's alone.
    const win = this.window(now, cx);
    const g = build(win.events, now, true);
    const today = win.events === this.events ? g : build(this.events, now, true);
    if (win.events !== this.events) spells = waits(win.events, now);
    const onLine = new Set((line?.slots ?? []).filter((s) => s.space).map((s) => s.letter));
    const letters = [...new Set([...(line?.slots ?? []).map((s) => s.letter), ...Object.keys(today.rows)])].sort();
    if (!letters.length) return div().text_color(C.dim).child("No spaces yet.");
    // Times are placed in per-mille of the graph area and drawn as percentages, so the graph
    // fits its area exactly at any width or zoom. "now" is always the right edge.
    const wax = windowAxis(g.sessions, now, win.span, win.since);
    const start = wax.pieces[0]?.from ?? now;
    const brk = U_BREAK;
    const X = (t) => xAt(wax, U, t, brk);
    const pc = (v) => `${v / 10}%`;
    const y = (i) => TOP + i * RH + RH / 2;
    const bottom = TOP + letters.length * RH;
    const els = [];
    const at = (x, top, h) => div().absolute().left(pc(x)).top(top).h(h);
    const span = (x1, x2, top, h) => at(x1, top, h).w(pc(Math.max(0, x2 - x1)));
    const inWin = (to) => to > start; // ends inside the window (earlier parts clamp to its start)

    for (const k of windowTicks(wax, U, U_TICK, brk)) {
      els.push(at(k.x, TOP - 2, bottom - TOP + 4).w(1).bg(C.glow));
      els.push(at(k.x, bottom + 5, 12).pl(2).text_size(11).line_height("12px").text_color(C.dim).child(k.label));
    }
    // The axis: solid under each piece of recorded time, with a gap and a dim line where the app was closed.
    wax.pieces.forEach((p, i) => {
      els.push(span(X(p.from), X(p.to), bottom + 2, 1).bg(C.fg));
      if (i > 0) els.push(at(X(p.from) - brk / 2, TOP - 2, bottom - TOP + 6).w(1).bg(C.dim));
    });
    letters.forEach((l, i) => {
      for (const s of g.rows[l]?.segs ?? []) {
        if (!inWin(s.to)) continue;
        const x1 = X(s.from), x2 = X(s.to);
        if (s.kind === "idle") els.push(span(x1, x2, y(i), 1).min_w(1).bg(C.dim));
        else if (s.kind === "ran") els.push(span(x1, x2, y(i) - 3, 6).min_w(1).bg(C.fg));
        // Waited on you: a taller hollow box, so it differs by shape as well as color. A click
        // goes to the stop that waited.
        else {
          const code = waitCode(spells, l, s.from, s.to);
          els.push(span(x1, x2, y(i) - 5, 10).min_w(4).id(`tt-w-${l}-${s.from}`).border_1().border_color(C.bright).bg(C.bg)
            .when(Boolean(code), (el) => el.cursor_pointer().on_click(() => this.go(code, l))));
        }
      }
      for (const t of g.rows[l]?.ends ?? []) if (t > start) els.push(at(X(t), y(i) - 6, 12).w(2).bg(C.fg)); // terminus
    });
    // Your path: along the space you were at, and a step at each move between spaces.
    let prev = null;
    for (const p of g.path) {
      if (!inWin(p.to)) { prev = p; continue; }
      const i = letters.indexOf(p.letter);
      const x1 = X(p.from);
      els.push(span(x1, X(p.to), y(i) + PATH_DY, 2).min_w(1).bg(C.bright));
      if (prev && prev.to === p.from && p.from > start) {
        const j = letters.indexOf(prev.letter);
        const ya = Math.min(y(i), y(j)) + PATH_DY, yb = Math.max(y(i), y(j)) + PATH_DY;
        els.push(at(x1, ya, yb - ya + 2).w(2).bg(C.bright));
      }
      prev = p;
    }
    const last = g.path[g.path.length - 1];
    if (last && last.to >= now - 1000) {
      const i = letters.indexOf(last.letter);
      els.push(div().absolute().right(0).top(y(i) + PATH_DY - 2).w(6).h(6).rounded_full().bg(C.bright));
    }
    els.push(div().absolute().right(0).top(0).w(1).h(bottom + 2).bg(C.fg));
    els.push(div().absolute().right(4).top(0).text_size(10).line_height("12px").text_color(C.fg).child("now"));

    // The letters, and today's figures, in their own columns so they are never cut. A click on
    // either goes to that space. Waited time is in a hollow box, like the graph's.
    const rowsOf = (cell) => v_flex().flex_none().child(div().h(TOP)).children(letters.map(cell));
    const lettersCol = rowsOf((l) => div().id(`tt-l-${l}`).h(RH).w(LX).text_size(12).line_height(`${RH}px`)
      .text_color(onLine.has(l) ? C.fg : C.dim)
      .when(onLine.has(l), (el) => el.cursor_pointer().on_click(() => this.go(null, l))).child(l));
    const figures = v_flex().w(WORDS).flex_none().text_size(11).line_height("14px")
      .child(h_flex().h(TOP).justify_end().gap(8).text_size(10).line_height("12px").text_color(C.dim).child(div().child("ran")).child(div().child("waited")))
      .children(letters.map((l) => {
        const tot = rowTotals(today.rows[l]);
        return h_flex().id(`tt-n-${l}`).h(RH).gap(4).items_center().justify_end()
          .when(onLine.has(l), (el) => el.cursor_pointer().on_click(() => this.go(null, l)))
          .child(div().text_color(tot.ran ? C.fg : C.dim).child(tot.ran ? short(tot.ran) : "—"))
          .child(tot.wait
            ? div().px(2).border_1().border_color(C.bright).text_color(C.bright).child(short(tot.wait))
            : div().px(3).text_color(C.dim).child("—"));
      }));
    const legend = h_flex().gap(8).text_size(11).line_height("14px").flex_wrap()
      .child(h_flex().gap(3).items_center().child(div().w(12).h(6).bg(C.fg)).child(div().text_color(C.dim).child("ran")))
      .child(h_flex().gap(3).items_center().child(div().w(12).h(1).bg(C.dim)).child(div().text_color(C.dim).child("idle")))
      .child(h_flex().gap(3).items_center().child(div().w(12).h(9).border_1().border_color(C.bright)).child(div().text_color(C.dim).child("waited")))
      .child(h_flex().gap(3).items_center().child(div().w(12).h(2).bg(C.bright)).child(div().text_color(C.dim).child("you")))
      .child(h_flex().gap(3).items_center().child(div().w(1).h(10).bg(C.dim)).child(div().text_color(C.dim).child("not recorded")));
    const area = div().id("tt-graph").relative().flex_1().min_w(0).h(bottom + 20).overflow_hidden().children(els);
    return v_flex().gap(2).flex_none()
      .child(h_flex().w_full().gap(4).items_start().child(lettersCol).child(area).child(figures))
      .child(legend);
  }

  due(line, sp, now) {
    const list = dueList(line, sp, now);
    const head = h_flex().text_size(12).text_color(C.dim).child(div().flex_1().child("due")).child(div().child("days"));
    const badge = (l) => div().w(18).h(18).flex_none().rounded_full().border_1().border_color(C.fg)
      .flex().items_center().justify_center().text_size(11).line_height("12px").text_color(C.bright).child(l);
    return v_flex().gap(2).min_h(0).child(head).children(list.map((d) =>
      h_flex().gap(6).items_center().text_size(13).line_height("18px")
        .child(div().w(52).flex_none().child(d.label))
        .child(badge(d.letter))
        .child(div().flex_1().min_w(0).truncate().child(d.name))
        .child(d.days < 0
          ? div().px(3).bg(C.fg).text_color(C.bg).child(daysWords(d.days)) // late: reverse video
          : div().text_color(d.days <= 1 ? C.bright : C.fg).child(daysWords(d.days)))));
  }
}
