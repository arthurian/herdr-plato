// The banner role: PLATO's top line. "PLATO · space e plans · tab 1 AGENTS.md"
// on the left; on the right, how many agents need you (in reverse video, so it shows in
// every glow), the date and the clock. A click on PLATO steps the glow, as GLOW does.
// The glow's name stands dim after PLATO ("PLATO amber"), bright for two seconds after a change.
// A notice ("⌘K q is undefined", shared "plato.notice") shows after the tab for two seconds.
// After a move, the left side says "▶ ARRIVED AT c3 moss · api from e1 plans" in reverse
// video instead, so the arrival never covers the terminal. The nowat role sets shared
// "plato.arrival"; this role clears it after 4 s, or as soon as a prompt is sent there.
// The count leaves out the agent you are at, so it agrees with NEXT1.
// The banner also keeps the day record (recorder.js), because it is on screen in every view.
//   commands: glow (plato.glow)

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, focused, shared, setShared, run, theme, terminals, checking } from "herdr";
import { C, FONT } from "./look.js";
import { letterOf, tabLabel, waitingFor, stops, currentStop, stopKey, labelOf, arrivalLive, arrivalShown, arrivalWords } from "./line.js";

import { nextGlow, glowWord } from "./glow.js";
import { LINE, ARRIVAL, NOTICE } from "./shared.js";
import { noticeLive, noticeStale } from "./logic.js";
import { keyText } from "./keys.js";
import { Recorder } from "./recorder.js";

const LIGHTS = 76; // room for the macOS window buttons
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LIT_MS = 2000; // how long the glow's name stays bright after a change

function when(d) {
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${hm}`;
}

export default class Banner {
  init(_p, cx) {
    this.tick(cx);
    this.recorder = new Recorder(cx);
    // A light check each second; it writes only when the arrival ends, which redraws the strip too.
    // The record is checked too, in case a change came without a render.
    if (!checking()) cx.timer.every(1000, () => {
      this.recorder.record(Date.now());
      const a = shared(ARRIVAL);
      if (a && !arrivalLive(a, labelOf(terminals(), a.to?.terminal, "plato.last_at"), Date.now())) setShared(ARRIVAL, null);
      if (noticeStale(shared(NOTICE), Date.now())) setShared(NOTICE, null); // its two seconds are over
    });
  }

  command(c, cx) {
    if (c === "glow") this.glow(cx);
  }

  /** The app quits or the layout changes: end the day record's session. */
  quit() {
    return this.recorder.close();
  }

  /** Step the glow; its name lights up for a moment. */
  glow(cx) {
    run("app.theme", { name: nextGlow(theme().accent) });
    this.litUntil = Date.now() + LIT_MS;
    cx.timer.after(LIT_MS + 50, (cx) => cx.notify());
  }

  /** Redraw on the minute, for the clock. */
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    this.recorder.record(Date.now());
    const f = focused();
    const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active);
    const tab = space?.tabs.find((t) => t.id === f?.tab) ?? space?.tabs.find((t) => t.active);
    const pane = panes().find((p) => p.pane === f?.pane) ?? panes().find((p) => p.tab === tab?.id);
    const letter = space ? letterOf(shared(LINE) ?? null, space.id) : null;
    const waiting = waitingFor(agents(), f?.terminal ?? null).length;
    const a = shared(ARRIVAL);
    const cur = a && currentStop(stops(shared(LINE) ?? null, spaces(), panes()), f);
    const arrived = Boolean(a && arrivalShown(a, stopKey(cur), labelOf(terminals(), a.to?.terminal, "plato.last_at"), Date.now()));
    const dim = (t) => div().text_color(C.dim).child(t);
    const inv = (t) => div().px(4).bg(C.fg).text_color(C.bg).child(t);

    // PLATO and the glow's name step the glow on a click; the name is bright just after a change.
    const lit = this.litUntil && Date.now() < this.litUntil;
    const plato = h_flex().id("glow").gap(6).cursor_pointer().tooltip(`GLOW ${keyText({ cmd: "glow" })}`).on_click((_e, cx) => this.glow(cx))
      .child(div().child("PLATO"))
      .child(div().text_color(lit ? C.bright : C.dim).child(glowWord(theme().accent)));
    let left = h_flex().flex_1().min_w(0).pl(LIGHTS).gap(10).items_center().child(plato);
    if (arrived) left = left.child(div().min_w(0).truncate().px(4).bg(C.bright).text_color(C.bg).child(arrivalWords(a)));
    else if (space) {
      left = left.child(dim("· space")).child(inv(`${letter ?? "?"} ${space.name}`));
      if (tab) left = left.child(dim("· tab")).child(div().min_w(0).truncate().text_color(C.bright).child(`${tab.index} ${tabLabel(tab, pane)}`));
    }
    // A notice shows for two seconds; the one-second check clears it after.
    const said = noticeLive(shared(NOTICE), Date.now());
    if (said) left = left.child(div().flex_none().px(4).bg(C.bright).text_color(C.bg).child(said));
    const right = h_flex().flex_none().gap(10).items_center()
      // A click on the count goes where NEXT1 goes, by the NEXT1 command itself.
      .when(waiting > 0, (el) => el.child(inv(`${waiting} need${waiting === 1 ? "s" : ""} you`).id("need-you").cursor_pointer().on_click(() => run("plato.next1"))))
      .child(dim(when(new Date())));
    return h_flex().id("banner").size_full().font_family(FONT).text_size(14).bg(C.bg).text_color(C.fg)
      .items_center().px(8).gap(10).border_b(1).border_color(C.fg)
      .child(left).child(right);
  }
}
