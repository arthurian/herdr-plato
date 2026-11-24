// The agenda's WEEK view (the route draws it in place of TODAY's columns, agendaview.js): each letter
// is a row with a cell for each of the four days before today, today, and the four days after.
// A past cell has a bar for the time its agents ran (a full bar is four hours), a thin bar for
// your time, and the time in words; a dot is a day without activity, and an empty cell a day
// before the space opened. Future cells are dashed and show "◆ DUE" on the due date. At the
// right end: the week's times and the last day with activity (QUIET in reverse video when
// nothing ran today or yesterday). Under the rows, the week's totals and what the marks mean.
// The cursor's row has ▶ and a bright border. A click moves the cursor there, a double click
// goes to the space's first tab, and a right-click opens the space's menu.

import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar } from "gpui-base";
import { spaces } from "herdr";
import { C } from "./look.js";
import { span } from "./overview.js";
import { weekDays, weekGrid, weekTotals, totalsLine } from "./agenda.js";
import { spaceMenu } from "./logic.js";
import { tabCount } from "./line.js";

const NAME_W = 190;  // the badge and name
const END_W = 200;   // the week's times and the last day
const GAP = 6;
const ROW_H = 58;
const FULL = 4 * 3600000; // a full bar

const pct = (ms) => `${Math.min(100, Math.round((ms / FULL) * 100))}%`;

/** A theme color with an alpha, as TODAY's marks. */
const tint = (hex, alpha) => `${hex.slice(0, 7)}${alpha}`;

/** A small badge: the letter in a ring, filled for the space you are in, dashed when free. */
function badge(letter, free, here) {
  let el = div().w(34).h(34).flex_none().rounded_full().border_2().border_color(free ? C.dim : C.fg)
    .flex().items_center().justify_center().text_size(18).text_color(free ? C.dim : C.bright).child(letter);
  if (free) el = el.border_dashed();
  if (here) el = el.bg(C.fg).text_color(C.bg);
  return el;
}

/** One day's cell. */
function cell(c, day, row) {
  let el = div().flex_1().flex_basis(0).min_w(0).h(ROW_H - 8).px(4).flex().items_center().text_size(12);
  if (day.today) el = el.border_1().border_color(C.dim);
  if (day.future) el = el.border_1().border_dashed().border_color(C.dim);
  // A due date of today: the cell keeps its day and adds ◆ in reverse video.
  if (c.due) el = el.child(div().flex_none().mr(4).px(2).bg(C.bright).text_color(C.bg).child("◆"));
  if (c.kind === "ran") {
    return el.child(v_flex().w_full().gap(2)
      .child(div().h(10).w(pct(c.ran)).bg(tint(C.fg, "55")))
      .child(div().h(3).w(pct(c.you)).bg(C.bright))
      .child(div().truncate().text_color(C.fg).child(c.ran >= 60000 ? span(c.ran) : c.wait >= 60000 ? `WAIT ${span(c.wait)}` : `you ${span(c.you)}`)));
  }
  if (c.kind === "none") return el.child(div().text_color(C.dim).child("·"));
  if (c.kind === "due") {
    const soon = row.due && row.due.days <= 2;
    const tag = div().flex_none().px(3).child("◆ DUE");
    return el.child(soon ? tag.bg(C.bright).text_color(C.bg) : tag.border_1().border_color(C.bright).text_color(C.bright));
  }
  return el;
}

/** The WEEK view for the route r, with the agenda's world w: the day labels, a row per letter in a
 *  scroll area (the cursor's row kept in view by agendaview.js), and the totals line. */
export function body(r, w) {
  const now = Date.now();
  const sp = spaces();
  const days = weekDays(now);
  const rows = weekGrid(days, w.days ?? new Map(), w.line, sp, now);
  const totals = weekTotals(rows, days);
  const curLetter = r.cursor ? w.columns[r.cursor.col]?.letter : w.cur?.letter; // before the first draw: where you are
  const hereLetter = w.cur?.letter;
  const freeLetters = rows.filter((x) => x.free).length;

  const labels = h_flex().gap(GAP).text_size(13).text_color(C.dim).pb(4).border_b(1).border_color(C.dim)
    .child(div().w(NAME_W).flex_none().child("space"))
    .children(days.map((d) => div().flex_1().flex_basis(0).min_w(0).child(
      d.today ? div().flex_none().px(3).bg(C.fg).text_color(C.bg).child("today") : div().text_color(C.dim).child(d.label))))
    .child(div().w(END_W).flex_none().child("week · last"));

  const rowEls = rows.map((x) => {
    const col = w.columns.findIndex((t) => t.letter === x.letter);
    const isCursor = x.letter === curLetter;
    const here = !x.free && x.letter === hereLetter;
    const t = w.columns[col];
    const name = x.free ? "free" : x.name;
    const sub = x.free ? (x.was ? `was ${x.was} · ↩ sign on here` : "↩ sign on here")
      : [`${tabCount(t?.stops ?? [])} tab${tabCount(t?.stops ?? []) === 1 ? "" : "s"}`, x.dueNote].filter(Boolean).join(" · ");
    const end = x.free ? div() : v_flex().gap(2).text_size(13)
      .child(div().truncate().child(`${span(x.ran)} · you ${span(x.you)}`))
      .child(h_flex().child(x.quiet ? div().flex_none().px(3).bg(C.dim).text_color(C.bg).child(`QUIET ${x.last}`)
        : div().flex_none().text_color(here ? C.fg : C.dim).child(here ? "you are here" : x.last)));
    let row = h_flex().id(`agenda-week-${x.letter}`).gap(GAP).items_center().h(ROW_H).px(4).border_1()
      .border_color(isCursor ? C.bright : C.bg).cursor_pointer()
      .on_click((e, cx) => {
        r.cursor = { col: Math.max(0, col), row: 0 };
        if (e.click_count >= 2) {
          if (x.free) r.agendaSignOn(x.letter);
          else if (t?.stops[0]) r.agendaGo(t.stops[0]);
        }
        cx.stop_propagation();
        cx.notify();
      })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); r.openMenu(spaceMenu({ free: x.free, freeLetters }), { letter: x.letter, col, row: 0 }); })
      .child(h_flex().w(NAME_W).flex_none().gap(8).items_center().min_w(0)
        .child(div().w(10).flex_none().text_color(C.bright).child(isCursor ? "▶" : ""))
        .child(badge(x.letter, x.free, here))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().min_w(0).child(div().min_w(0).truncate().px(here ? 4 : 0)
            .when(here, (el) => el.bg(C.fg).text_color(C.bg))
            .when(!here, (el) => el.text_color(x.free ? C.dim : C.bright)).child(name)))
          .child(div().truncate().text_size(12).text_color(x.late || x.due?.days === 0 ? C.bright : C.dim).child(sub))))
      .children(x.free ? days.map(() => div().flex_1().flex_basis(0).min_w(0)) : x.cells.map((c, k) => cell(c, days[k], x)))
      .child(div().w(END_W).flex_none().min_w(0).child(end));
    if (!isCursor) row = row.hover((st) => st.bg(C.glow));
    return row;
  });

  const swatch = (el, word) => h_flex().flex_none().gap(5).items_center().child(el).child(div().child(word));
  const footer = h_flex().gap(16).min_w(0).text_size(13).text_color(C.dim).flex_wrap()
    .child(div().flex_1().min_w(0).truncate().text_color(C.fg).child(totalsLine("week", totals)))
    .child(swatch(div().w(14).h(10).bg(tint(C.fg, "55")), "agents ran (full: 4h)"))
    .child(swatch(div().w(14).h(3).bg(C.bright), "your time"))
    .child(swatch(div().child("◆"), "due"))
    .child(swatch(div().px(3).bg(C.dim).text_color(C.bg).child("QUIET"), "nothing today or yesterday"));

  return v_flex().flex_1().min_h(0).gap(6)
    .child(labels)
    .child(div().flex_1().min_h(0).relative()
      .child(div().id("agenda-week-scroll").absolute().inset_0().overflow_y_scroll().track_scroll(r.agendaScroll).children(rowEls))
      .child(Scrollbar.vertical("agenda-week-scroll").absolute().inset_0()))
    .child(footer);
}
