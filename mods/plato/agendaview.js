// The agenda: PLATO stood up over the terminal (the route role with mode "agenda"). It shows the
// spaces over time in two views, and Tab (or a click on TODAY or WEEK) switches them.
// TODAY: each letter is a column. Its head has the badge, the space name, and only the lines
// it has: its due date, the time its agents ran and you were there today, and its last activity
// (QUIET alone when none). Under
// it, a box of today's hours marks when an agent ran, waited on you (WAIT), and when you were
// there; a dashed line is now. Its tabs hang under the box: lamp, code and name, the one you
// are at in reverse video, → for NEXT and ▲ for NEXT1. A free letter keeps a dashed column.
// WEEK (agendaweek.js; the route passes it to draw()): each letter is a row of nine days.
// Keys (the agenda has the keyboard while it shows): arrows move the cursor (▶) and Enter goes
// to the tab under it, or starts a sign-on on a free letter; the Space bar opens LOOK for that
// tab; Escape folds back. LAB, SIGN-OFF, SET DUE and SET PURPOSE (keys.json chords) act on
// the cursor's space or tab (route.js). Letters do nothing: JUMP (cmd-j) finds a tab by code. The route calls
// draw() and key().

import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar } from "gpui-base";
import { terminals, spaces, layout } from "herdr";
import { C, stateColor, stateWord, lit } from "./look.js";
import { stopKey, purposeOf, tabCount } from "./line.js";
import { hoverDetail, stateSince } from "./overview.js";
import { startCursor, moveCursor, cursorAt, fitColumns, columnWindow, dayBlocks, columnWords, totalsLine, letterEntry, slotSince } from "./agenda.js";
import { dueList, dayKey, daySegsCached, sessions, dayAxis, yAt, segTotals } from "./day.js";
import { spaceMenu, tabMenu } from "./logic.js";

// The columns share the agenda's width (beside SIGNALS, NOW AT and the DUE list). They never get
// narrower than COLUMN_MIN: when not all fit, the agenda shows the ones that do, always with the
// cursor's column, so the arrows reach every space without scrolling sideways.
const COLUMN_MIN = 150; // a column's narrowest, in px
const GAP = 14;
const GUTTER = 44;     // the hour labels, left of the columns
const BADGE = 52;
const HEAD_GAP = 10;   // between the heads and the day boxes
const TAB_ROW_H = 24;  // one tab under a day box
const DAY_MIN_H = 160; // a day box's least height
const AGENDA_CHROME = 270; // the agenda's height less its day boxes and tab rows: banner, keyset, frame, header, footer lines, heads
const BASE_REM = 13;   // Herdr's UI text size at zoom 1: rem_size() / BASE_REM is the zoom
const FRAME_X = 24;    // the agenda frame's borders and padding, both sides, with a little to spare

/** The agenda's inner width in the px a mod draws with. Herdr scales those by its zoom, which
 *  a mod cannot read, so it comes from rem_size(). The right column takes its own width,
 *  or none while FOCUS hides it. */
function agendaWidth() {
  const zoom = window.rem_size() / BASE_REM;
  const find = (n) => (!n || typeof n !== "object" ? null : n.id === "right" ? n : (n.children ?? []).map(find).find(Boolean) ?? null);
  const right = find(layout());
  const rightPx = right && !right.hidden && typeof right.size?.px === "number" ? right.size.px : 0;
  return window.viewport_size().width / zoom - rightPx - FRAME_X;
}

/** How tall the day boxes are: the window's height (in a mod's px, as agendaWidth) less the rest
 *  of the agenda and a row for each tab of the space with the most, never under DAY_MIN_H. */
function dayHeight(tabRows) {
  const zoom = window.rem_size() / BASE_REM;
  return Math.max(DAY_MIN_H, Math.floor(window.viewport_size().height / zoom - AGENDA_CHROME - tabRows * TAB_ROW_H));
}

// The opening cascade (main.js sets r.cascade): hidden for one render as the agenda opens, then
// each column fades in after the one on its left. Eight at most take 7 × 45 + 90 = 405 ms.
const CASCADE_STEP = 45;
const CASCADE_FADE = 90;

/** A part of the agenda as the cascade draws it: hidden at first, then in by column. */
function cascade(r, el, row) {
  // The transition is declared on the hidden render too (at once), so the change to 1 on the
  // next render is a later change, which is what a transition animates.
  if (r.cascade === "hide") return el.opacity(0).transition("opacity", { duration: 1 });
  return el.opacity(1).transition("opacity", { duration: CASCADE_FADE, delay: Math.min(row, 7) * CASCADE_STEP, easing: "ease-out" });
}

const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/** A theme color with an alpha ("55"), for the day boxes' fills. */
const tint = (hex, alpha) => `${hex.slice(0, 7)}${alpha}`;

/** Scroll the agenda so the cursor's tab row shows: the heads for the first row, else the row
 *  (the heads are item 0, the day boxes 1, the tab rows 2, 3, …). In WEEK, the space's row. */
function scrollToCursor(r) {
  if (r.agendaView === "week") return r.agendaScroll.scroll_to_item(r.cursor.col); // WEEK: a row per space
  r.agendaScroll.scroll_to_item(r.cursor.row === 0 ? 0 : r.cursor.row + 2);
}

/** The agenda for the route r, with w = { columns, line, day, days, cur, next, n1Stop, n1, back }
 *  (days: the week's day-file events by day key, today's among them). TODAY shows each space as
 *  a column of today's hours: its head, a box with the time its agents ran, waited on you and
 *  you were there, and its tabs under it. weekBody (agendaweek.js, from the route) is WEEK's view,
 *  drawn in place of the columns and their totals when it is given. */
export function draw(r, w, weekBody = null) {
  if (!r.cursor) {
    r.cursor = startCursor(w.columns, w.cur);
    scrollToCursor(r);
  }
  const now = Date.now();
  const terms = terminals();
  const sp = spaces();
  const at = cursorAt(w.columns, r.cursor);
  const due = new Map(dueList(w.line, sp, now).map((d) => [d.letter, d]));
  // TODAY's day, only when TODAY shows: WEEK replays its own days (agendaweek.js), and Herdr
  // stops a draw that takes too long.
  const events = weekBody ? [] : w.days?.get(dayKey(now)) ?? w.day ?? [];
  const segs = daySegsCached(events, now, true);
  const ses = weekBody ? [] : sessions(events, now, true);
  const axis = dayAxis(ses, now);
  // Each space's day since it took its letter, under any name it had (letterEntry), once.
  const since = new Map((w.line?.slots ?? []).map((x) => [x.letter, slotSince(x)]));
  const entries = new Map();
  const entryOf = (t) => {
    if (t.free) return undefined;
    if (!entries.has(t.letter)) entries.set(t.letter, letterEntry(segs, t.letter, since.get(t.letter) ?? 0));
    return entries.get(t.letter);
  };
  const ctx = { r, w, now, terms, sp, at, due, segs, ses, axis, entryOf };
  // The columns that fit, always with the cursor's; each keeps its index in the line.
  const win = columnWindow(w.columns.length, r.cursor.col, fitColumns(agendaWidth() - GUTTER, COLUMN_MIN, GAP), r.agendaStart ?? 0);
  r.agendaStart = win.start;
  const shown = w.columns.slice(win.start, win.end).map((t, k) => ({ t, col: win.start + k, k }));
  const rowCount = Math.max(0, ...shown.map(({ t }) => (t.free ? 0 : t.stops.length)));
  ctx.dayH = dayHeight(rowCount);
  // Each space's words once: the heads draw them, the totals line adds them up.
  ctx.words = new Map(shown.filter(({ t }) => !weekBody && !t.free).map(({ t }) => [t.letter, columnWords({
    entry: entryOf(t), due: due.get(t.letter) ?? null, now,
  })]));
  // The agenda in rows: the heads, the day boxes, then one row per tab position. Each row is a
  // direct child of the scroll area, so scroll_to_item can bring the cursor's row into view.
  const row = (id, gutter, cells) => h_flex().id(id).w_full().items_stretch().gap(GAP).child(div().w(GUTTER).flex_none().child(gutter ?? div())).children(cells);
  const freeLetters = w.columns.filter((t) => t.free).length;
  const rows = weekBody ? [] : [ // WEEK draws its own rows (agendaweek.js)
    row("agenda-heads", null, shown.map(({ t, col }) => cellBox(`agenda-head-${t.letter}`)
      .child(rightClick(r, head(ctx, t).id(`agenda-headrow-${t.letter}`), spaceMenu({ free: t.free, freeLetters }), { letter: t.letter, col, row: 0 })))),
    row("agenda-days", hourLabels(ctx), shown.map(({ t, k }) => cellBox(`agenda-day-${t.letter}`).pt(HEAD_GAP).child(cascade(r, dayBox(ctx, t, k === 0), k)))),
  ];
  if (!weekBody) for (let i = 0; i < rowCount; i++) rows.push(row(`agenda-row-${i}`, null, shown.map(({ t, col, k }) => cell(ctx, t, col, i, k))));
  const body = div().text_color(C.dim).child("No spaces yet. Type a letter to sign on, or press Esc.");
  return v_flex().flex_1().min_h(0).gap(8)
    .child(header(r, w, weekBody ? { start: 0, end: w.columns.length } : win)) // WEEK shows every space
    // Herdr's overflow_*_scrollbar wraps the element, so its flex size never reaches the layout:
    // it grew to its content and nothing scrolled. The box takes the flex size, the scroll area
    // fills the box, and the bar lies on top (as Herdr's own changes panel does it).
    .when(Boolean(weekBody), (el) => el.child(weekBody))
    .when(!weekBody, (el) => el
      .child(div().flex_1().min_h(0).relative()
        .child(div().id("agenda-scroll").absolute().inset_0().overflow_y_scroll().track_scroll(r.agendaScroll).pt(4).children(w.columns.length ? rows : [body]))
        .child(Scrollbar.vertical("agenda-scroll").absolute().inset_0()))
      .child(todayFooter(ctx, shown)))
    .child(bottom(r, at, hovered(r, w.columns.flatMap((t) => t.stops), sp, now, 200)));
}

function header(r, w, win) {
  const slots = w.columns.filter((t) => !t.free).length;
  const free = w.columns.length - slots;
  const tabs = tabCount(w.columns.flatMap((t) => t.stops));
  const parts = [`${slots} space${slots === 1 ? "" : "s"}`];
  if (free) parts.push(`${free} free`);
  parts.push(`${tabs} tab${tabs === 1 ? "" : "s"}`);
  const before = win.start;
  const after = w.columns.length - win.end;
  // A click on a marker moves the cursor to the first hidden column on that side.
  const marker = (id, text, col) => div().id(id).flex_none().text_color(C.fg).cursor_pointer()
    .on_click((_e, cx) => { r.cursor = { col, row: 0 }; cx.stop_propagation(); cx.notify(); }).child(text);
  return h_flex().gap(12).min_w(0).items_center()
    .child(viewButton(r, "today", "TODAY"))
    .child(viewButton(r, "week", "WEEK"))
    .child(cap("Tab", "switches"))
    .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(parts.join(" · ")))
    .when(before > 0, (el) => el.child(marker("agenda-more-left", `◀ ${before} more`, before - 1)))
    .when(after > 0, (el) => el.child(marker("agenda-more-right", `${after} more ▶`, win.end)));
}

/** Show an agenda view, "today" (each space's hours) or "week" (its last days and the next), keeping the cursor's space: the row goes back to the first. */
function showView(r, view) {
  r.agendaView = view;
  if (r.cursor) r.cursor = { col: r.cursor.col, row: 0 };
}

/** A view's button in the header: reverse video while it shows, a dim border otherwise. */
function viewButton(r, view, word) {
  const on = (r.agendaView ?? "today") === view;
  const el = div().id(`agenda-view-${view}`).flex_none().px(6).border_1().cursor_pointer()
    .on_click((_e, cx) => { showView(r, view); cx.stop_propagation(); cx.notify(); }).child(word);
  return on ? el.bg(C.fg).border_color(C.fg).text_color(C.bg) : el.border_color(C.dim).text_color(C.dim).hover((st) => st.bg(C.glow));
}

function badge(letter, dashed, strong) {
  let el = div().w(BADGE).h(BADGE).flex_none().rounded_full().border_2().border_color(dashed ? C.dim : C.fg).bg(C.bg)
    .flex().items_center().justify_center().text_size(30).text_color(dashed ? C.dim : C.bright).child(letter);
  if (dashed) el = el.border_dashed();
  if (strong) el = el.bg(C.fg).text_color(C.bg);
  return el;
}

/** An agenda cell: as wide as a column, and never wider, whatever its text. */
function cellBox(id) {
  return div().id(id).flex_1().flex_basis(0).min_w(COLUMN_MIN).overflow_hidden();
}

/** A space's head: the badge with the name, then its due date (only when it has one), its day
 *  and its last activity (columnWords). A late date and QUIET are in reverse video, and the
 *  words say it too. The space you are in has a filled badge and its name in reverse video. */
function head(ctx, t) {
  const { r, w, at } = ctx;
  const here = !t.free && w.cur && t.stops.some((s) => stopKey(s) === stopKey(w.cur));
  const cursorHere = at.column === t;
  const name = t.free ? `${t.letter} · free` : t.name;
  const line = (text) => div().h(18).text_size(13).line_height("18px").truncate().child(text);
  let lines;
  if (t.free) {
    lines = [line(t.was ? `was ${t.was}` : "not in use").text_color(C.dim), line(t.closed ? `free since ${clock(t.closed)}` : "").text_color(C.dim), line("↩ sign on here").text_color(cursorHere ? C.bright : C.dim)];
  } else {
    const cw = ctx.words.get(t.letter);
    const tone = { late: (el) => el.px(3).bg(C.fg).text_color(C.bg), soon: (el) => el.text_color(C.bright), plain: (el) => el.text_color(C.fg), none: (el) => el.text_color(C.dim) }[cw.dueTone];
    // Only what this space has: a due line when it has a date, its day when it was active,
    // and its last activity (QUIET in reverse video when nothing happened today).
    lines = [
      cw.due && h_flex().h(18).min_w(0).child(tone(div().flex_none().text_size(13).line_height("18px").child(cw.due))),
      cw.day && line(cw.day).text_color(C.fg),
      h_flex().h(18).min_w(0).child(cw.quiet ? div().flex_none().px(3).text_size(13).line_height("18px").bg(C.dim).text_color(C.bg).child(cw.last)
        : div().flex_none().text_size(13).line_height("18px").text_color(C.dim).child(cw.last)),
    ].filter(Boolean);
  }
  return h_flex().gap(10).items_start().min_w(0)
    .child(div().id(`agenda-badge-${t.letter}`).flex_none().cursor_pointer()
      .on_click((_e, cx) => { if (t.free) r.agendaSignOn(t.letter); else if (t.stops[0]) r.agendaGo(t.stops[0]); cx.stop_propagation(); })
      .child(badge(t.letter, t.free, here)))
    .child(v_flex().flex_1().min_w(0)
      .child(h_flex().min_w(0).child(div().min_w(0).px(here ? 5 : 0).text_size(17).line_height("22px").truncate()
        .when(here, (el) => el.bg(C.fg).text_color(C.bg))
        .when(!here, (el) => el.text_color(t.free ? C.dim : C.bright)).child(name)))
      .children(lines));
}

/** The hour labels left of the day boxes, at the hour lines. */
function hourLabels(ctx) {
  const { axis, dayH } = ctx;
  return div().relative().w_full().h(dayH + HEAD_GAP).text_size(12).text_color(C.dim)
    .children(axis.hours.map((h) => div().absolute().left(0).top(HEAD_GAP + Math.max(0, yAt(axis, dayH, h) - 8)).child(clock(h).slice(0, 2))))
    .child(div().absolute().left(0).top(HEAD_GAP + dayH - 16).text_color(C.bright).child("now"));
}

/** A space's day box: the hour lines, its marks (dayBlocks) and a dashed line for now at the
 *  bottom. A free letter keeps an empty dashed box, so no other column moves. Time with no
 *  record is the same in every column, so only the first column shown (first) says
 *  "not recorded". */
function dayBox(ctx, t, first) {
  const { axis, dayH } = ctx;
  let el = div().relative().w_full().h(dayH).border_1().border_color(C.dim).overflow_hidden();
  if (t.free) return el.border_dashed();
  const lines = axis.hours.map((h) => div().absolute().left(0).right(0).top(yAt(axis, dayH, h)).h(0).border_t(1).border_color(C.glow));
  const marks = dayBlocks(ctx.entryOf(t), ctx.ses, axis, dayH).map((b) => mark(b.kind === "closed" && !first ? { ...b, label: "" } : b));
  return el.children(lines).children(marks)
    .child(div().absolute().left(0).right(0).bottom(0).h(0).border_t(1).border_dashed().border_color(C.bright));
}

/** One mark in a day box. They differ in shape and words, not color alone: a run is filled, a
 *  wait is a hollow block that says WAIT, your time is a thin bar at the left edge, and a dim band
 *  runs across the box where nothing was recorded. */
function mark(b) {
  const el = div().absolute().top(b.top).h(b.height).overflow_hidden().text_size(12).line_height("16px");
  if (b.kind === "you") return el.left(1).w(4).bg(C.bright);
  if (b.kind === "closed") return el.left(0).right(0).px(8).bg(tint(C.dim, "26")).text_color(C.dim).child(b.label);
  if (b.kind === "ran") return el.left(8).right(3).px(4).bg(tint(C.fg, "55")).text_color(C.fg).child(b.label);
  return el.left(8).right(3).px(4).border_1().border_color(C.bright).bg(tint(C.bright, "22")).text_color(C.bright).child(b.label);
}

/** A space's tab in row i under its day box: its lamp, code and name. The tab you are at is in
 *  reverse video, NEXT adds →, NEXT1 adds ▲ and pulses, and the cursor's row has ▶ and a
 *  bright border. A click goes there; a right-click opens its menu; a hover shows its detail. */
function cell(ctx, t, col, i, k) {
  const { r, w, at } = ctx;
  const box = cellBox(`agenda-cell-${t.letter}-${i}`);
  const s = t.free ? null : t.stops[i];
  if (!s) return box;
  const key = stopKey(s);
  const isCur = w.cur && key === stopKey(w.cur);
  const isNext = w.next && key === stopKey(w.next);
  const isN1 = w.n1Stop && key === stopKey(w.n1Stop);
  const isCursor = at.column === t && at.stop === s;
  let el = h_flex().id(`agenda-card-${s.code}`).w_full().min_w(0).h(TAB_ROW_H).px(5).gap(6).items_center().border_1().border_color(isCursor ? C.bright : C.bg).cursor_pointer()
    .on_click((_e, cx) => { r.agendaGo(s); cx.stop_propagation(); })
    .child(div().flex_none().w(10).text_color(isCur ? C.bg : C.bright).child(isCursor ? "▶" : ""))
    .child(lamp(s.status, isCur))
    .child(div().flex_none().font_weight(700).text_color(isCur ? C.bg : C.bright).child(s.code))
    .child(div().flex_1().min_w(0).truncate().child(s.label || "—"))
    .when(isNext && !isCur, (e) => e.child(div().flex_none().text_color(C.fg).child("→")))
    .when(isN1 && !isCur, (e) => e.child(div().flex_none().text_color(C.bright).loop("opacity", { from: 0.55, to: 1, period: 1100 }).child("▲")));
  el = isCur ? el.bg(C.fg).text_color(C.bg) : el.text_color(stateColor(s.status)).hover((st) => st.bg(C.glow));
  return box.child(cascade(r, tabTrigger(r, el, { ...s, col, row: i }, isCur), k));
}

/** A tab's lamp, as the route draws its stop dots: filled while working or waiting on you,
 *  hollow when idle or done, the blocked one pulsing. On the tab you are at (reverse video) it
 *  is drawn in the background color, so it still reads. */
function lamp(status, onInv) {
  const col = onInv ? C.bg : stateColor(status);
  let d = div().flex_none().w(9).h(9).rounded_full().border_1().border_color(col);
  if (lit(status)) d = d.bg(col);
  if (status === "blocked") d = d.loop("opacity", { from: 0.4, to: 1, period: 1100 });
  return d;
}

/** TODAY's totals and what its marks mean, under the columns. */
function todayFooter(ctx, shown) {
  const t = { ran: 0, wait: 0, you: 0, quiet: 0 };
  for (const { t: col } of shown) {
    if (col.free) continue;
    const x = segTotals(ctx.entryOf(col));
    t.ran += x.ran; t.wait += x.wait; t.you += x.you;
    if (ctx.words.get(col.letter)?.quiet) t.quiet++;
  }
  const swatch = (el, word) => h_flex().flex_none().gap(5).items_center().child(el).child(div().child(word));
  return h_flex().gap(16).min_w(0).text_size(13).text_color(C.dim).flex_wrap()
    .child(div().flex_1().min_w(0).truncate().text_color(C.fg).child(totalsLine("today", t)))
    .child(swatch(div().w(12).h(10).bg(tint(C.fg, "55")), "agent ran"))
    .child(swatch(div().w(12).h(10).border_1().border_color(C.bright).bg(tint(C.bright, "22")), "WAIT: waited on you"))
    .child(swatch(div().w(4).h(10).bg(C.bright), "you were there"))
    .child(swatch(div().px(3).bg(C.dim).text_color(C.bg).child("QUIET"), "not touched today"));
}

/** Hovering el (a tab's dot, row or card) shows its detail in the readout while the pointer
 *  is on it: r.hoverKey is the route view's own, so a hover changes no PLATO state and takes
 *  no focus. */
export function hoverable(r, el, s) {
  const key = stopKey(s);
  return el.on_hover((on, cx) => {
    if (on) r.hoverKey = key;
    else if (r.hoverKey === key) r.hoverKey = null;
    cx.notify();
  });
}

/** The hovered tab, if it is still there, as hoverDetail words (perLine for its purpose). */
export function hovered(r, all, sp, now, perLine) {
  const s = r.hoverKey ? all.find((x) => stopKey(x) === r.hoverKey) : null;
  if (!s) return null;
  const purpose = s.terminal ? purposeOf(terminals().find((x) => x.address === s.terminal)?.labels) : null;
  return hoverDetail(s, purpose, stateSince(s, sp), now, perLine);
}

/** A hovered tab's detail in place of the route's readout: the code and names, the purpose
 *  with its source, and the state with its time, on at most four lines like the readout. */
export function detailBlock(d) {
  const last = d.purpose.length - 1;
  return v_flex().gap(1).text_size(13).border_t(1).border_color(C.glow).pt(4).min_w(0)
    .child(div().truncate().font_weight(700).text_color(C.bright).child(d.title))
    .children(d.purpose.map((l, i) => (i < last ? div().truncate().child(l)
      : h_flex().gap(8).min_w(0).when(l !== "", (el) => el.child(div().flex_initial().min_w(0).truncate().child(l)))
        .child(div().flex_none().text_color(C.dim).child(d.source)))))
    .when(!d.purpose.length, (el) => el.child(div().text_color(C.dim).child("no purpose")))
    .child(div().truncate().text_color(stateColor(d.status)).child(`${d.program} · ${stateWord(d.status)}${d.time ? ` ${d.time}` : ""}`));
}

/** A right-click on el opens a menu of items (spaceMenu or tabMenu) at the pointer, as
 *  Herdr's own tab menu does (r.openMenu). target names what the menu is for by its code or
 *  letter, and in the agenda by its column and row. */
export function rightClick(r, el, items, target) {
  return el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); r.openMenu(items, target); });
}

/** A tab's trigger: its right-click menu and its hover detail. */
export function tabTrigger(r, trigger, s, current) {
  return hoverable(r, rightClick(r, trigger, tabMenu({ current, inAgenda: r.agendaMode }), { code: s.code, col: s.col, row: s.row }), s);
}

/** The agenda's bottom line: while the pointer is on a tab, its detail; otherwise the keys for
 *  where the cursor is. NEXT, BACK, JUMP, LAB and the rest are left out: the keyset shows them,
 *  and the tab rows mark NEXT (→) and NEXT1 (▲). Tab and Esc are in the header and the title. */
function bottom(r, at, hov) {
  const line = h_flex().h(22).gap(10).items_center().text_size(13).border_t(1).border_color(C.glow).pt(4).min_w(0);
  if (hov) {
    return line
      .child(div().flex_none().font_weight(700).text_color(C.bright).child(hov.title))
      .child(div().flex_none().text_color(stateColor(hov.status)).child(`${hov.program} · ${stateWord(hov.status)}${hov.time ? ` ${hov.time}` : ""}`))
      .child(div().flex_1().min_w(0).truncate().child(hov.purpose.join(" ")))
      .when(Boolean(hov.source), (el) => el.child(div().flex_none().text_color(C.dim).child(hov.source)));
  }
  const keys = [cap("←↑↓→", "move")];
  if (at.stop) keys.push(cap("↩", `go ${at.stop.code}`), cap("space", "look"));
  else if (at.column?.free) keys.push(cap("↩", `sign on at ${at.column.letter}`));
  if (at.column && !at.column.free) keys.push(cap("⌘⌥W", `sign-off ${at.column.letter}`));
  return line.gap(16).children(keys);
}

/** A key cap and what it does: the key boxed, the word after it, as in the keyset. */
function cap(key, word) {
  return h_flex().flex_none().gap(5).items_center()
    .child(div().px(4).border_1().border_color(C.dim).text_color(C.fg).child(key))
    .child(div().text_color(C.dim).child(word));
}

/** A key in the agenda. Returns true when the agenda used it. Chords with ⌘ or ⌃ are left to
 *  keys.json (AGENDA folds back, ⌘↩ NEXT and the rest). */
export function key(r, e, columns) {
  const m = e.modifiers ?? {};
  if (m.platform || m.control || m.alt) return false;
  r.agendaCursor();
  columns = r.columns ?? columns;
  if (e.key === "escape") { r.fold(); return true; }
  const week = r.agendaView === "week";
  if (e.key === "tab") { showView(r, week ? "today" : "week"); return true; }
  // Enter acts on the card under the cursor, so you see where you will land before you go.
  if (e.key === "enter") {
    const at = cursorAt(columns, r.cursor);
    if (at.stop) r.agendaGo(at.stop);
    else if (at.column?.free) r.agendaSignOn(at.column.letter);
    return true;
  }
  if (["left", "right", "up", "down"].includes(e.key)) {
    // In WEEK each space is a row: up and down move between spaces, left and right do nothing.
    if (week && (e.key === "left" || e.key === "right")) return true;
    const k = week ? (e.key === "up" ? "left" : "right") : e.key;
    r.cursor = moveCursor(r.cursor, k, columns);
    if (week) r.cursor = { col: r.cursor.col, row: 0 };
    scrollToCursor(r);
    return true;
  }
  const ch = e.key_char ?? (e.key.length === 1 ? e.key : "");
  if (e.key === "space" || ch === " ") {
    r.agendaLook(cursorAt(columns, r.cursor).stop);
    return true;
  }
  return false;
}
