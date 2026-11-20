// The map: PLATO stood up over the terminal (plato-route with props mode "map").
// Each letter is a column headed by its space name and a large badge; its stops hang
// down it as stop cards (a signal lamp, code, label, program, state and time, the last
// prompt sent). A free letter keeps a dashed column. The current stop is in reverse
// video under "YOU ARE HERE"; agents that need you have a "WAITING" or "DONE" tag; NEXT and
// NEXT1 targets are tagged, and the readout names NEXT, NEXT1 and BACK.
// Keys (the map has the keyboard while it shows): a letter and a number jump there and
// fold back; arrows move the cursor (▶) and Enter goes; the Space bar peeks at the stop under
// the cursor; Escape folds back; a free letter starts a sign-on there. LAB and SIGN-OFF
// (keys.json chords) act on the space under the cursor (main.js). The route calls draw() and key().

import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar } from "gpui-base";
import { terminals, spaces, layout } from "herdr";
import { C, stateColor, stateWord, lit } from "./look.js";
import { stopKey, lastSent, duration, tabCount } from "./line.js";
import { selectCode, backCode, codeWords, startCursor, moveCursor, cursorAt, stateSince, activityWords, fitColumns, columnWindow } from "./map.js";
import { dueList, dueWords, build } from "./day.js";

// The columns share the map's width (beside SIGNALS, NOW AT and MAP TOTALS). They never get
// narrower than COLUMN_MIN: when not all fit, the map shows the ones that do, always with the
// cursor's column, so the arrows reach every space without scrolling sideways. Cards are tall enough for code and name, state and time, and
// the last prompt sent, so the map is not mostly empty with few stops.
const COLUMN_MIN = 210; // a column's narrowest, in px: cards stay 160 px wide
const GAP = 18;
const BADGE = 60; // as tall as the name, summary and day lines beside it
const CARD_MIN_H = 104;
const BAR_X = BADGE / 2; // the column line runs down from the middle of the badge
const CARD_X = BADGE / 2 + 20; // the cards, from the column's left edge
const HEAD_GAP = 14;   // between the badge and the first card
const CARD_GAP = 16;   // between cards
const BASE_REM = 13;   // Herdr's UI text size at zoom 1: rem_size() / BASE_REM is the zoom
const FRAME_X = 24;    // the map frame's borders and padding, both sides, with a little to spare

/** The map's inner width in the px a mod draws with. Herdr scales those by its zoom, which
 *  a mod cannot read, so it comes from rem_size(). The right column takes its own width,
 *  or none while FOCUS hides it. */
function mapWidth() {
  const zoom = window.rem_size() / BASE_REM;
  const find = (n) => (!n || typeof n !== "object" ? null : n.id === "right" ? n : (n.children ?? []).map(find).find(Boolean) ?? null);
  const right = find(layout());
  const rightPx = right && !right.hidden && typeof right.size?.px === "number" ? right.size.px : 0;
  return window.viewport_size().width / zoom - rightPx - FRAME_X;
}
const BRANCH_Y = 19;   // where the branch meets a card, from the card's top
const HEAD_EXTRA = 0;  // name 24 + summary 18 + day 18 = 60, the badge's height

// The opening cascade (main.js sets r.cascade): hidden for one render as the map opens, then
// each row of cards fades in after the one above. Eight rows at most take 7 × 45 + 90 = 405 ms.
const CASCADE_STEP = 45;
const CASCADE_FADE = 90;

/** A row of the map as the cascade draws it: hidden at first, then in by row. */
function cascade(r, el, row) {
  // The transition is declared on the hidden render too (at once), so the change to 1 on the
  // next render is a later change, which is what a transition animates.
  if (r.cascade === "hide") return el.opacity(0).transition("opacity", { duration: 1 });
  return el.opacity(1).transition("opacity", { duration: CASCADE_FADE, delay: Math.min(row, 7) * CASCADE_STEP, easing: "ease-out" });
}

const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/** Scroll the map so the cursor's row shows: the heads for the first row, so the names
 *  come back into view, else the card row (rows after the heads are 1, 2, …). */
function scrollToCursor(r) {
  r.mapScroll.scroll_to_item(r.cursor.row === 0 ? 0 : r.cursor.row + 1);
}

/** The map for the route r, with w = { columns, line, day, cur, next, n1Stop, n1, back }
 *  (day: today's day-file events, or null before they are read). */
export function draw(r, w) {
  if (!r.cursor) {
    r.cursor = startCursor(w.columns, w.cur);
    scrollToCursor(r);
  }
  const now = Date.now();
  const terms = terminals();
  const sp = spaces();
  const at = cursorAt(w.columns, r.cursor);
  const due = new Map(dueList(w.line, sp, now).map((d) => [d.letter, d]));
  // Today's graph from the timetable's day file, for each space's "ran … today" words.
  const g = w.day ? build(w.day, now, true) : null;
  const ctx = { r, w, now, terms, sp, at, due, g };
  // The columns that fit, always with the cursor's; each keeps its index in the line.
  const win = columnWindow(w.columns.length, r.cursor.col, fitColumns(mapWidth(), COLUMN_MIN, GAP), r.mapStart ?? 0);
  r.mapStart = win.start;
  // The map in rows: the heads (badge and name), then one row per card position. Each row
  // is a direct child of the scroll area, so scroll_to_item can bring the cursor's row into
  // view. A cell stretches to its row, so a column's line runs on past a short card.
  const shown = w.columns.slice(win.start, win.end).map((t, k) => ({ t, col: win.start + k }));
  const rowCount = Math.max(0, ...shown.map(({ t }) => (t.free ? 1 : t.stops.length)));
  const row = (id, cells) => h_flex().id(id).w_full().items_stretch().gap(GAP).children(cells);
  const rows = [row("map-heads", shown.map(({ t }) => cellBox(`map-head-${t.letter}`).child(head(ctx, t))))];
  for (let i = 0; i < rowCount; i++) rows.push(row(`map-row-${i}`, shown.map(({ t, col }) => cell(ctx, t, col, i))));
  const body = div().text_color(C.dim).child("No spaces yet. Type a letter to sign on, or press Esc.");
  return v_flex().flex_1().min_h(0).gap(8)
    .child(header(r, w, win))
    // Herdr's overflow_*_scrollbar wraps the element, so its flex size never reaches the layout:
    // it grew to its content and nothing scrolled. The box takes the flex size, the scroll area
    // fills the box, and the bar lies on top (as Herdr's own changes panel does it).
    .child(div().flex_1().min_h(0).relative()
      .child(div().id("map-scroll").absolute().inset_0().overflow_y_scroll().track_scroll(r.mapScroll).pt(4).children(w.columns.length ? rows : [body]))
      .child(Scrollbar.vertical("map-scroll").absolute().inset_0()))
    .child(readout(w))
    .child(typing(r, at, w));
}

function header(r, w, win) {
  const slots = w.columns.filter((t) => !t.free).length;
  const free = w.columns.length - slots;
  const tabs = tabCount(w.columns.flatMap((t) => t.stops));
  const parts = [`${slots} space${slots === 1 ? "" : "s"}`];
  if (free) parts.push(`${free} free`);
  parts.push(`${tabs} tab${tabs === 1 ? "" : "s"}`);
  if (w.cur) parts.push(`you are at ${w.cur.code}`);
  const before = win.start;
  const after = w.columns.length - win.end;
  // A click on a marker moves the cursor to the first hidden column on that side.
  const marker = (id, text, col) => div().id(id).flex_none().text_color(C.fg).cursor_pointer()
    .on_click((_e, cx) => { r.cursor = { col, row: 0 }; cx.stop_propagation(); cx.notify(); }).child(text);
  return h_flex().gap(12).min_w(0)
    .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(parts.join(" · ")))
    .when(before > 0, (el) => el.child(marker("map-more-left", `◀ ${before} more`, before - 1)))
    .when(after > 0, (el) => el.child(marker("map-more-right", `${after} more ▶`, win.end)));
}

function badge(letter, dashed, strong) {
  let el = div().w(BADGE).h(BADGE).flex_none().rounded_full().border_2().border_color(dashed ? C.dim : C.fg).bg(C.bg)
    .flex().items_center().justify_center().text_size(36).text_color(dashed ? C.dim : C.bright).child(letter);
  if (dashed) el = el.border_dashed();
  if (strong) el = el.bg(C.fg).text_color(C.bg);
  return el;
}

/** "3 tabs · 1 working · 1 waiting": what a space holds, under its name. */
function summary(t) {
  const n = tabCount(t.stops);
  const parts = [`${n} tab${n === 1 ? "" : "s"}`];
  const working = t.stops.filter((s) => s.status === "working").length;
  const waiting = t.stops.filter((s) => s.status === "blocked" || s.status === "done").length;
  if (working) parts.push(`${working} working`);
  if (waiting) parts.push(`${waiting} waiting`);
  return parts.join(" · ");
}

/** A space's summary line: what it holds, then its due date (the timetable's words). Late
 *  is in reverse video and today bright; the words say it too, so color is not alone. */
function summaryLine(t, d) {
  const el = h_flex().gap(6).min_w(0).text_size(13).line_height("18px")
    .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(t.free ? (t.was ? `was ${t.was}` : "not in use") : summary(t)));
  if (!d) return el;
  const words = div().flex_none().child(dueWords(d));
  return el.child(d.days < 0 ? words.px(3).bg(C.fg).text_color(C.bg) : words.text_color(d.days <= 1 ? C.bright : C.fg));
}

/** A map cell: as wide as a column, and never wider, whatever its text. */
function cellBox(id) {
  return div().id(id).flex_1().flex_basis(0).min_w(COLUMN_MIN).overflow_hidden();
}

/** A space's head: the badge with the name, its summary and its day beside it. */
function head(ctx, t) {
  const { r, w, at } = ctx;
  const here = !t.free && w.cur && t.stops.some((s) => stopKey(s) === stopKey(w.cur));
  const cursorHere = at.column === t;
  const name = t.free ? `${t.letter} · free` : t.name;
  return h_flex().gap(12).items_center().min_w(0)
    .child(div().id(`map-badge-${t.letter}`).flex_none().cursor_pointer()
      .on_click((_e, cx) => { if (t.free) r.mapSignOn(t.letter); else if (t.stops[0]) r.mapGo(t.stops[0]); cx.stop_propagation(); })
      .child(badge(t.letter, t.free, here)))
    .child(v_flex().flex_1().min_w(0)
      .child(h_flex().min_w(0).child(div().min_w(0).px(here ? 5 : 0).text_size(18).line_height("24px").truncate()
        .when(here, (el) => el.bg(C.fg).text_color(C.bg))
        .when(!here, (el) => el.text_color(t.free ? C.dim : C.bright)).child(name)))
      .child(summaryLine(t, t.free ? null : ctx.due.get(t.letter)))
      // Its day so far, in words ("ran 1h 40m today · last active 3m ago"); an empty line
      // when there is nothing to say, so every head is the same height and the cards line up.
      .child(div().h(18).text_size(13).line_height("18px").truncate().text_color(C.dim)
        .child((t.free ? null : activityWords(ctx.g?.rows[t.letter], ctx.now)) ?? "")))
    .when(cursorHere && t.free, (el) => el.child(div().flex_none().text_color(C.bright).child("◀")));
}

/** A space's cell in card row i: its card (a free letter has its dashed card in row 0),
 *  with the line coming down from the badge, or empty below its last card. The space
 *  above the card is inside the cell, so the line never breaks between rows. */
function cell(ctx, t, col, i) {
  const { at } = ctx;
  const cursorHere = at.column === t;
  const box = cellBox(`map-cell-${t.letter}-${i}`).flex().flex_col().pl(CARD_X).pt(i === 0 ? HEAD_GAP : CARD_GAP);
  if (t.free) return i === 0 ? box.child(freeBody(ctx, t, cursorHere)) : box;
  const s = t.stops[i];
  return s ? box.child(card(ctx, s, cursorHere && at.stop === s, col, i, i === t.stops.length - 1)) : box;
}

/** The line from a space down to one card: from the card above (or the badge) to the
 *  card's branch, which turns right into the card. On every card but the last, the line
 *  goes on down the card's full height to meet the next one. */
function link(dashed, first, strong, last = true) {
  const above = first ? HEAD_GAP + HEAD_EXTRA : CARD_GAP;
  const color = dashed ? C.dim : C.fg;
  let down = div().absolute().left(BAR_X - CARD_X - 1).top(-above).w(0).border_l(2).border_color(color);
  down = last ? down.h(above + BRANCH_Y) : down.bottom(0);
  let across = div().absolute().left(BAR_X - CARD_X - 1).top(BRANCH_Y).w(CARD_X - BAR_X + 1).h(0).border_t(2).border_color(strong ? C.bright : color);
  if (dashed) { down = down.border_dashed(); across = across.border_dashed(); }
  return [down, across];
}

function freeBody(ctx, t, cursorHere) {
  const box = v_flex().relative().gap(3).px(10).py(8).text_size(14).line_height("19px").text_color(C.dim)
    .border_1().border_dashed().border_color(cursorHere ? C.bright : C.dim)
    .child(div().child(`free since ${t.closed ? clock(t.closed) : "?"}`))
    .child(div().text_color(cursorHere ? C.bright : C.dim).child(`type ${t.letter} to sign on here`));
  return cascade(ctx.r, div().id(`map-free-${t.letter}`).child(box.children(link(true, true, false))), 0);
}

/** A tag in a card's top line: reverse video, so it reads in every glow (on the current
 *  card, which is itself in reverse video, the tag is drawn the other way round). */
function tag(color, onInv) {
  const el = div().flex_none().px(5).text_size(13).line_height("17px");
  return onInv ? el.bg(C.bg).text_color(C.fg) : el.bg(color).text_color(C.bg);
}

/** A card's signal lamp, as the route draws its stop dots: filled while working or
 *  waiting on you, hollow when idle or done, the blocked one pulsing. On the current card
 *  (reverse video) it is drawn in the background color, so it still reads. */
function lamp(status, onInv) {
  const col = onInv ? C.bg : stateColor(status);
  const filled = lit(status);
  let d = div().flex_none().w(10).h(10).rounded_full().border_1().border_color(col);
  if (filled) d = d.bg(col);
  if (status === "blocked") d = d.loop("opacity", { from: 0.4, to: 1, period: 1100 });
  return d;
}

function card(ctx, s, isCursor, col, row, isLast) {
  const { r, w, now, terms, sp } = ctx;
  const key = stopKey(s);
  const isCur = w.cur && key === stopKey(w.cur);
  const isNext = w.next && key === stopKey(w.next);
  const isN1 = w.n1Stop && key === stopKey(w.n1Stop);
  const since = stateSince(s, sp);
  const time = since != null ? duration(since, now) : "";
  const last = lastSent(terms, s.terminal);
  const waiting = s.status === "blocked" || s.status === "done";

  const tags = [];
  if (isCur) tags.push(tag(C.fg, true).child("YOU ARE HERE"));
  if (s.status === "blocked") tags.push(tag(C.bright, isCur).child(`WAITING${time ? ` ${time}` : ""}`));
  else if (s.status === "done") tags.push(tag(C.bright, isCur).child("DONE · unseen"));
  // NEXT and NEXT1 both in reverse video, so they stand out; NEXT1 also pulses and says
  // "▲", so the two differ by more than color (in plato-white, bright and normal match).
  if (isN1 && !isCur) tags.push(tag(C.bright, false).loop("opacity", { from: 0.55, to: 1, period: 1100 }).child("NEXT1 ▲"));
  if (isNext && !isCur) tags.push(tag(C.fg, false).child("NEXT →"));

  const sub = isCur ? C.bg : stateColor(s.status);
  let box = v_flex().id(`map-card-${s.code}`).relative().w_full().min_w(0).min_h(CARD_MIN_H).px(10).py(8).gap(3).border_1().cursor_pointer()
    .on_click((_e, cx) => { r.mapGo(s); cx.stop_propagation(); })
    .child(h_flex().gap(8).min_w(0).items_center().text_size(16).line_height("22px")
      .child(lamp(s.status, isCur))
      .child(div().flex_none().font_weight(700).text_color(isCur ? C.bg : C.bright).child(s.code))
      .child(div().flex_1().min_w(0).truncate().child(s.label || "—")))
    // The tags on their own line, wrapping, so a narrow column never cuts one off.
    .when(tags.length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).min_w(0).children(tags)))
    .child(div().text_size(14).line_height("19px").truncate().text_color(sub).child(`${s.program || "—"} · ${stateWord(s.status)}${time ? ` ${time}` : ""}`))
    .when(Boolean(last?.text), (el) => el.child(div().text_size(13).line_height("18px").max_h(54).overflow_hidden().text_color(isCur ? C.bg : C.dim)
      .child(`${last.at ? `sent ${duration(last.at, now)} ago: ` : ""}“${last.text}”`)));
  if (isCur) box = box.bg(C.fg).text_color(C.bg).border_color(C.fg);
  else if (isN1) box = box.border_dashed().border_color(C.bright).hover((st) => st.bg(C.glow));
  else box = box.border_color(waiting ? C.bright : C.dim).hover((st) => st.bg(C.glow));
  if (isCursor) box = box.border_2().border_color(C.bright);
  const mark = isCursor ? [div().absolute().left(-CARD_X + 2).top(BRANCH_Y - 11).text_size(16).text_color(C.bright).child("▶")] : [];
  return cascade(r, div().id(`map-stop-${col}-${row}`).relative().flex_1().min_w(0), row)
    .child(box)
    .children(link(false, row === 0, isCur, isLast))
    .children(mark);
}

function readout(w) {
  const where = (s) => (s ? `${s.code} ${s.spaceName} · ${s.label}` : "—");
  const item = (name, text, color) => h_flex().gap(6).min_w(0).flex_1()
    .child(div().flex_none().text_color(C.dim).child(name))
    .child(div().min_w(0).truncate().text_color(color).child(text));
  return h_flex().gap(16).text_size(13).border_t(1).border_color(C.glow).pt(4).min_w(0)
    .child(item("NEXT →", where(w.next), C.fg))
    .child(item("BACK →", where(w.prev), C.fg))
    .child(item("NEXT1 →", w.n1Stop ? `${where(w.n1Stop)} · ${stateWord(w.n1.status)}` : "nothing waiting", w.n1Stop ? C.bright : C.dim))
    .child(item("BACK1 →", where(w.back1), C.fg));
}

/** A key cap and what it does: the key boxed, the word after it, as in the keyset. */
function cap(key, word) {
  return h_flex().flex_none().gap(5).items_center()
    .child(div().px(4).border_1().border_color(C.dim).text_color(C.fg).child(key))
    .child(div().text_color(C.dim).child(word));
}

/** The map's bottom line: the GO box with the code typed so far and where it goes, then
 *  the keys for where the cursor is. LAB and JUMP are left out: the keyset shows them. */
function typing(r, at, w) {
  const m = codeWords(r.code, w.columns);
  const matchColor = { hint: C.dim, none: C.dim, space: C.fg, tab: C.bright }[m.kind];
  const keys = [cap("←↑↓→", "move")];
  if (at.stop) keys.push(cap("↩", `go ${at.stop.code}`), cap("space", "peek"));
  else if (at.column?.free) keys.push(cap("↩", `sign on at ${at.column.letter}`));
  if (at.column && !at.column.free) keys.push(cap("⌘⌥W", `sign-off ${at.column.letter}`));
  keys.push(cap("esc", "close"));
  return h_flex().gap(16).items_center().text_size(13).min_w(0)
    .child(h_flex().flex_none().gap(6).items_center().px(6).border_1().border_color(C.fg)
      .child(div().text_color(C.dim).child("GO"))
      .child(div().text_color(C.bright).child("▶"))
      .child(div().min_w(24).text_color(C.bright).child(r.code || ""))
      .child(div().w(8).h(16).bg(C.fg).loop("opacity", { from: 0, to: 1, period: 1060 }))
      .child(div().w(240).truncate().text_color(matchColor).child(m.text)))
    .child(h_flex().flex_1().min_w(0).flex_wrap().gap(12).children(keys));
}

/** A key in the map. Returns true when the map used it. Chords with ⌘ or ⌃ are left to
 *  keys.json (⌘I folds back, ⌘↩ NEXT and the rest). */
export function key(r, e, columns) {
  const m = e.modifiers ?? {};
  if (m.platform || m.control || m.alt) return false;
  r.mapCursor();
  columns = r.columns ?? columns;
  if (e.key === "escape") { r.fold(); return true; }
  // Enter acts on the card under the cursor, which a typed code has already selected, so
  // you see where you will land before you go.
  if (e.key === "enter") {
    const at = cursorAt(columns, r.cursor);
    if (at.stop) r.mapGo(at.stop);
    else if (at.column?.free) r.mapSignOn(at.column.letter);
    r.code = "";
    return true;
  }
  if (["left", "right", "up", "down"].includes(e.key)) {
    r.cursor = moveCursor(r.cursor, e.key, columns);
    scrollToCursor(r);
    r.code = "";
    return true;
  }
  if (e.key === "backspace") {
    const b = backCode(r.code, columns, r.world().cur);
    r.code = b.code;
    if (b.cursor) { r.cursor = b.cursor; scrollToCursor(r); }
    return true;
  }
  const ch = e.key_char ?? (e.key.length === 1 ? e.key : "");
  if (e.key === "space" || ch === " ") {
    r.mapPeek(cursorAt(columns, r.cursor).stop);
    r.code = "";
    return true;
  }
  if (ch.length !== 1) return false;
  const t = selectCode(r.code, ch, columns);
  r.code = t.code;
  if (t.cursor) { r.cursor = t.cursor; scrollToCursor(r); }
  return true;
}
