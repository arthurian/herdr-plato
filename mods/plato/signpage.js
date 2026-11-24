// The sign role: the sign-on and sign-off pages, as a modal dialog that the route role opens.
//   props { role: "sign", page: "on" | "off" | "up" | "purpose" | "due", space, text, letter } (up: CLOSE UP the line)
// Sign-on shows the letter the new space will take (the first free slot; → or a click
// puts it at the end of the line instead; a free letter typed in the agenda comes as
// props.letter and is taken instead of the first free slot), the space name line, an
// optional folder (typed, or chosen with choose… or cmd-o, which open the system folder
// picker) and an optional due date. Only the typed folder is checked; an empty folder
// starts the space in the home folder. "sign-on <path>" puts the path in the folder field.
// NEXT sets shared "plato.pending" and runs space.new; the route role
// then gives the new space the pending letter. BACK cancels.
// Sign-off shows a summary first. Only NEXT (or NEXT1) closes the space, with
// space.close {confirmed: true}; BACK keeps it open. For a space in the middle of the
// line, U also closes up the line (the route role does it once the space has gone).
// SET PURPOSE (page "purpose", props terminal, code, label, text) reuses the name line: NEXT
// writes the label plato.purpose_yours on that terminal with hc, blank clears it; BACK cancels.
// SET DUE (page "due", props letter, name, text) also uses the name line, for a space's due
// date in SIGN-ON's forms: NEXT asks the route role to set it (plato.due:<letter>=<date>, the
// route alone writes the line), blank clears it; BACK cancels.
// Dialogs get no key commands: NEXT, BACK and NEXT1 arrive through shared
// "plato.sign.key", which the route role sets while this page is open.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, spaces, panes, agents, terminals, shared, setShared, run, exec, home, keys, checking, pickFolder } from "herdr";
import { C, FONT, stateWord } from "./look.js";
import { signOnLetters, stops, duration, next1Agent, tabCount, purposeOf, purposeSource } from "./line.js";
import { signOnTarget, folderPath, tildePath, shortPath, parseDue, dueWords, signOffPlan, landing, editLine, closeUpPlan, purposeArgs, dueCommand, enterKey } from "./sign.js";
import { LINE, PENDING, SIGN_DIALOG, SIGN_KEY, CLOSEUP } from "./shared.js";
import { alive } from "./keys.js";


const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const CHECKING = "Checking the folder…";
const tilde = (path) => tildePath(path, home());

/** The key bound to a route command, as ⌘⌥↩. */
function keyFor(cmd) {
  const k = keys().find((x) => x.section.startsWith("layout:") && x.action === `plato.${cmd}`)?.keys ?? "";
  const map = { cmd: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃", enter: "↩" };
  return k.split("-").map((p) => map[p] ?? p.toUpperCase()).join("");
}

export default class Sign {
  init(_p, cx) {
    const p = props() ?? {};
    this.page = ["off", "up", "purpose", "due"].includes(p.page) ? p.page : "on";
    this.dueFor = { letter: p.letter ?? null, name: p.name ?? "" };
    this.purposeFor = { terminal: p.terminal ?? null, code: p.code ?? "", label: p.label ?? "" };
    this.space = p.space ?? null;
    this.fixed = p.letter ?? null; // a free letter chosen in the agenda
    this.opened = Date.now();
    this.done = false;
    this.msg = "";
    const text = String(p.text ?? "");
    const start = this.page === "on" ? signOnTarget(text, home()) : { name: text, path: null };
    const field = (t) => ({ text: t, cursor: t.length });
    this.fields = [field(start.name), field(start.path ? tilde(start.path) : ""), field("")]; // name, folder, due
    this.at = 0;
    this.end = false;
    this.found = null; // { key, path } for the folder field's text: path null when missing or blank
    this.choosing = false; // the folder picker is open
    this.h = cx.focus_handle();
    this.h.focus();
    if (checking()) return;
    alive("sign", cx); // so the route's toggles know this dialog is still open
    if (this.page === "on") { this.look(cx); this.tell(); }
    cx.timer.every(150, (cx) => this.poll(cx));
  }

  /** A key from the route role (NEXT, BACK, NEXT1). */
  poll(cx) {
    const k = shared(SIGN_KEY);
    if (!k || k.at <= this.opened || this.done) return;
    setShared(SIGN_KEY, null);
    this.act(k.key, cx);
    cx.notify();
  }

  act(key, cx) {
    if (this.done) return;
    if (key === "back") return this.close();
    if (this.page === "purpose") { if (key === "next") this.setPurpose(cx); return; }
    if (this.page === "due") { if (key === "next") this.setDue(); return; }
    if (this.page === "on") { if (key === "next") this.signOn(); return; }
    // CLOSE UP: NEXT closes up the line; its own key again (cmd-u) closes the page.
    if (this.page === "up") { if (key === "next") this.closeUpNow(); else if (key === "up") this.close(); return; }
    if (key === "next" || key === "next1") this.signOff(key);
    if (key === "up" && signOffPlan(shared(LINE) ?? null, this.space)?.middle) this.signOff("up");
  }

  /** CLOSE UP: ask the route role to drop the free letters and move the later spaces up (it
   *  applies a request with no space at once), then close the page. */
  closeUpNow() {
    if (closeUpPlan(shared(LINE) ?? null).free.length) setShared(CLOSEUP, { space: null, at: Date.now() });
    this.close();
  }

  close() {
    this.done = true;
    const id = props()?.overlay;
    if (shared(SIGN_DIALOG)?.id === id) setShared(SIGN_DIALOG, null);
    if (id) closeOverlay(id);
  }

  // ---- sign-on ----

  letters() {
    return signOnLetters(shared(LINE) ?? null);
  }

  /** The agenda's chosen letter, while it is still free. */
  chosen() {
    const slot = this.fixed && (shared(LINE)?.slots ?? []).find((s) => s.letter === this.fixed);
    return slot && !slot.space ? this.fixed : null;
  }

  letter() {
    const l = this.letters();
    return (!this.end && (this.chosen() ?? l.free)) || l.end;
  }

  /** Tell the other panels (NOW AT) which letter this sign-on will take. */
  tell() {
    const d = shared(SIGN_DIALOG);
    const letter = this.letter();
    if (d && d.id === props()?.overlay && d.letter !== letter) setShared(SIGN_DIALOG, { ...d, letter });
  }

  /** Check the typed folder, and only that folder. */
  look(cx) {
    const key = this.fields[1].text.trim();
    if (this.found?.key === key) { this.looking = key; return; } // back to a checked text: drop the check in flight
    if (this.looking === key) return;
    this.looking = key;
    const path = folderPath(key, home());
    if (!path) { this.found = { key, path: null }; return; }
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", '[ -d "$1" ]', "sh", path], { timeout: 3000 }).catch(() => ({ code: 1 })); // a hung mount reads as not found
      if (this.looking !== key) return;
      this.found = { key, path: r.code === 0 ? path : null };
      if (this.msg === CHECKING) this.msg = "";
      cx.notify();
    });
  }

  /** choose… (or cmd-o): the system folder picker fills the folder field; cancel keeps it. */
  choose(cx) {
    if (this.choosing || this.page !== "on") return;
    this.choosing = true;
    cx.spawn(async (cx) => {
      const path = await pickFolder({ prompt: "Choose" }).catch(() => null);
      this.choosing = false;
      if (path) { this.fields[1] = { text: tilde(path), cursor: tilde(path).length }; this.at = 1; this.look(cx); }
      this.h.focus();
      cx.notify();
    });
  }

  signOn() {
    const name = this.fields[0].text.trim();
    if (!name) { this.msg = "Type a space name first."; this.at = 0; return; }
    const due = parseDue(this.fields[2].text, Date.now());
    if (due.error) { this.msg = `Due date: ${due.error}.`; this.at = 2; return; }
    const letter = this.letter();
    if (!letter) { this.msg = "All 26 letters are in use."; return; }
    const raw = this.fields[1].text.trim();
    const folder = folderPath(raw, home());
    if (folder && this.found?.key !== raw) { this.msg = CHECKING; return; }
    if (folder && !this.found.path) { this.msg = `There is no folder ${tilde(folder)}.`; this.at = 1; return; }
    setShared(PENDING, { name, letter, due: due.due, at: Date.now() });
    run("space.new", folder ? { name, folder } : { name });
    this.close();
  }

  // ---- set due ----

  /** Ask the route role to set the due date (blank clears it), then close; a date it cannot
   *  read stays open and says why. */
  setDue() {
    const due = parseDue(this.fields[0].text, Date.now());
    if (due.error) { this.msg = `Due date: ${due.error}.`; return; }
    run(`plato.${dueCommand(this.dueFor.letter, due.due)}`);
    this.close();
  }

  duePage() {
    const { letter, name } = this.dueFor;
    const slot = (shared(LINE)?.slots ?? []).find((s) => s.letter === letter);
    const due = parseDue(this.fields[0].text, Date.now());
    return v_flex().flex_1().min_h(0).gap(8)
      .child(v_flex()
        .child(div().text_size(22).line_height("28px").text_color(C.bright).child("SET DUE"))
        .child(div().child(`When is ${letter} ${name} due?`)))
      .child(h_flex().gap(10).items_center().border_t(1).border_color(C.glow).pt(8)
        .child(div().flex_none().text_color(C.bright).child("Due date"))
        .child(this.input(0, "fri 27, 11/27, +5, or blank")))
      .child(div().text_color(due.error ? C.bright : C.dim).child(due.error ? `${due.error}` : due.due ? `due ${dueWords(due.due, Date.now())}` : "no due date"))
      .child(div().text_color(C.dim).child(slot?.due ? `now: due ${dueWords(slot.due, Date.now())}` : "now: no due date"))
      .child(div().text_color(C.dim).child("Blank clears the date."))
      .child(div().flex_1())
      .when(Boolean(this.msg), (el) => el.child(div().text_color(C.bright).child(this.msg)))
      .child(this.keyRow([["next", "NEXT", keyFor("next"), "or Enter saves"], ["back", "BACK", keyFor("back"), "or Esc cancels"]]));
  }

  // ---- set purpose ----

  /** Write your purpose (blank clears it), then close; on a failure, say so and stay open. */
  setPurpose(cx) {
    const t = this.purposeFor.terminal;
    if (!t || this.saving) return;
    this.saving = true;
    cx.spawn(async (cx) => {
      const r = await exec("hc", purposeArgs(t, this.fields[0].text)).catch((e) => ({ code: 1, stderr: String(e) }));
      this.saving = false;
      if (r.code === 0) return this.close();
      this.msg = `hc label failed: ${(r.stderr || "").trim() || `exit ${r.code}`}`;
      cx.notify();
    });
  }

  purposePage() {
    const { terminal, code, label } = this.purposeFor;
    const now = terminal ? purposeOf(terminals().find((x) => x.address === terminal)?.labels) : null;
    return v_flex().flex_1().min_h(0).gap(8)
      .child(v_flex()
        .child(div().text_size(22).line_height("28px").text_color(C.bright).child("SET PURPOSE"))
        .child(div().child(`What is ${code} ${label} for?`)))
      .child(h_flex().gap(10).items_center().border_t(1).border_color(C.glow).pt(8)
        .child(div().flex_none().text_color(C.bright).child("Purpose"))
        .child(this.input(0, "one line: what this tab is for")))
      .child(div().text_color(C.dim).child(now ? `now: ${now.text} ${purposeSource(now)}` : "now: no purpose"))
      .child(div().text_color(C.dim).child("Yours comes before the agent's and the first prompt. Blank clears yours."))
      .child(div().flex_1())
      .when(Boolean(this.msg), (el) => el.child(div().text_color(C.bright).child(this.msg)))
      .child(this.keyRow([["next", "NEXT", keyFor("next"), "or Enter saves"], ["back", "BACK", keyFor("back"), "or Esc cancels"]]));
  }

  // ---- sign-off ----

  signOff(how) {
    const line = shared(LINE) ?? null;
    const space = spaces().find((s) => s.id === this.space);
    if (!space) return this.close();
    if (how === "up" && signOffPlan(line, space.id)?.middle) setShared(CLOSEUP, { space: space.id, at: Date.now() });
    const a = how === "next1" ? next1Agent(agents().filter((x) => x.space !== space.id), null) : null;
    if (a) run("agent.focus", { terminal: a.address });
    else {
      const to = landing(stops(line, spaces(), panes()), space.id);
      if (to) {
        run("space.select", { id: to.space });
        run("tab.select", { id: to.tab });
        if (to.pane) run("pane.focus", { pane: to.pane });
      }
    }
    run("space.close", { id: space.id, confirmed: true });
    this.close();
  }

  // ---- keys ----

  key(e, cx) {
    if (this.done) return;
    const m = e.modifiers ?? {};
    const plain = !m.platform && !m.control && !m.alt && !m.shift;
    let used = true;
    if (e.key === "escape") this.close();
    else if (e.key === "enter") { if (enterKey(m)) this.act(enterKey(m), cx); else used = false; } // with cmd: a layout key, which the route hands over
    else if (this.page === "off") {
      if (plain && e.key === "u" && signOffPlan(shared(LINE) ?? null, this.space)?.middle) this.signOff("up");
      else used = false;
    } else used = this.typeKey(e, m, cx);
    if (!used) return;
    this.msg = this.msg && e.key === "enter" ? this.msg : "";
    cx.stop_propagation();
    cx.notify();
  }

  typeKey(e, m, cx) {
    const f = this.fields[this.at];
    const l = this.letters();
    const choice = l.free && l.end;
    if ((this.page === "purpose" || this.page === "due") && (e.key === "tab" || e.key === "down" || e.key === "up")) return true;
    if (e.key === "tab" || e.key === "down" || e.key === "up") {
      const back = e.key === "up" || (e.key === "tab" && m.shift);
      this.at = (this.at + (back ? 2 : 1)) % 3;
      return true;
    }
    if (m.platform && e.key === "o") { this.choose(cx); return true; }
    if (this.at === 0 && choice && e.key === "right" && !m.platform && !m.alt && f.cursor === f.text.length && !this.end) { this.end = true; this.tell(); return true; }
    if (this.at === 0 && choice && e.key === "left" && !m.platform && !m.alt && f.cursor === 0 && this.end) { this.end = false; this.tell(); return true; }
    const clip = m.platform && e.key === "v" ? cx.read_from_clipboard() : undefined;
    const next = editLine(f, { key: e.key, mods: m, char: e.key_char, clip });
    if (!next) return false;
    this.fields[this.at] = next;
    if (this.at === 1 && this.page === "on") this.look(cx);
    return true;
  }

  // ---- drawing ----

  render() {
    const body = this.page === "on" ? this.onPage() : this.page === "up" ? this.upPage() : this.page === "purpose" ? this.purposePage() : this.page === "due" ? this.duePage() : this.offPage();
    return v_flex().id("sign").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().font_family(FONT).text_size(14).line_height("20px").bg(C.bg).text_color(C.fg)
      .p(2).child(v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
        v_flex().flex_1().min_h(0).border_1().border_color(C.fg).px(16).py(12).gap(8).child(body)));
  }

  /** The page's keys as boxed caps, as on the keyset, each with what it does. A click on a
   *  cap acts as the key does (act), so the page works by mouse too and still confirms.
   *  list: [[key for act, name, shortcut, words]]. */
  keyRow(list) {
    return h_flex().flex_wrap().gap(14).items_center().children(list.map(([k, name, sc, words]) => h_flex().gap(6).items_center()
      .child(h_flex().id(`sign-key-${k}`).gap(6).px(6).border_1().border_color(C.fg).cursor_pointer()
        .hover((st) => st.bg(C.fg).text_color(C.bg))
        .on_click((_e, cx) => { this.act(k, cx); cx.notify(); })
        .child(div().child(name)).when(Boolean(sc), (el) => el.child(div().text_color(C.dim).child(sc))))
      .child(div().text_color(C.dim).child(words))));
  }

  badge(letter, dashed) {
    let r = div().w(46).h(46).flex_none().rounded_full().border_2().border_color(C.fg)
      .flex().items_center().justify_center().text_size(26).text_color(C.bright).child(letter ?? "?");
    return dashed ? r.border_dashed() : r;
  }

  /** A field. room: characters shown before the cursor. tail: unfocused, show the end of a
   *  long path (shortPath), so the folder's own name shows. */
  input(i, hint, room = 45, tail = false) {
    const on = i === this.at;
    const f = this.fields[i];
    const cursor = f.cursor < f.text.length
      ? div().whitespace_nowrap().bg(C.fg).text_color(C.bg).child(f.text[f.cursor])
      : div().w(8).h(17).bg(C.fg).loop("opacity", { from: 0, to: 1, period: 1060 });
    const before = f.text.slice(0, f.cursor);
    const shown = before.length > room + 1 ? `…${before.slice(-room)}` : before; // keep the cursor in view
    const text = on
      ? h_flex().min_w(0).child(div().whitespace_nowrap().child(shown)).child(cursor)
        .child(div().whitespace_nowrap().child(f.text.slice(f.cursor + 1)))
        .when(!f.text && Boolean(hint), (x) => x.child(div().pl(6).text_color(C.dim).whitespace_nowrap().child(hint)))
      : div().truncate().text_color(f.text ? C.fg : C.dim).child((tail ? shortPath(f.text, room) : f.text) || hint);
    return h_flex().id(`field-${i}`).flex_1().min_w(0).gap(8).py(2).border_b(1).border_color(on ? C.bright : C.dim)
      .cursor_pointer().on_click((_e, cx) => { this.at = i; cx.notify(); })
      .child(div().flex_none().text_color(on ? C.bright : C.dim).child("▶"))
      .child(div().flex_1().min_w(0).overflow_hidden().child(text));
  }

  onPage() {
    this.tell(); // the line can change while the page is open
    const l = this.letters();
    const letter = this.letter();
    const raw = this.fields[1].text.trim();
    const due = parseDue(this.fields[2].text, Date.now());
    let where;
    if (!letter) where = "All 26 letters are in use. Sign off a space first.";
    else if (!this.end && this.chosen()) where = `Signing on at ${letter}, the free letter you chose in the agenda${l.end ? ` · → puts it at the end as ${l.end}` : ""}`;
    else if (this.end || !l.free) where = `Signing on at ${letter}, the end of the line${l.free ? ` · ← fills the free ${this.chosen() ?? l.free} instead` : ""}`;
    else where = `Signing on at ${letter}, the first free letter${l.end ? ` · → puts it at the end as ${l.end}` : ""}`;
    const f = this.found?.key === raw ? this.found : null;
    const state = !folderPath(raw, home()) ? "starts in your home folder"
      : !f ? "checking…" : f.path ? "found · 1 tab opens with your shell" : "not found";
    return v_flex().flex_1().min_h(0).gap(10)
      .child(h_flex().gap(14).items_center()
        .child(this.badge(letter, true))
        .child(v_flex()
          .child(div().text_size(22).line_height("28px").text_color(C.bright).child("SIGN-ON"))
          .child(div().text_color(C.dim).child("Type your space name, then press NEXT"))))
      .child(h_flex().child(this.input(0, "space name"))) // in a row, so flex_1 widens it, not heightens it
      .child(div().id("where").cursor_pointer().text_color(l.free && l.end ? C.fg : C.dim)
        .on_click((_e, cx) => { if (l.free && l.end) { this.end = !this.end; this.tell(); cx.notify(); } })
        .child(where))
      // The optional folder: typed, or chosen with the system picker (a click or cmd-o).
      .child(h_flex().gap(10).items_center()
        .child(div().flex_none().text_color(this.at === 1 ? C.bright : C.dim).child("Folder? (optional)"))
        .child(this.input(1, "blank for your home folder, or ~/…", 34, true))
        .child(h_flex().id("sign-choose").flex_none().gap(6).px(6).border_1().border_color(C.fg).cursor_pointer()
          .hover((st) => st.bg(C.fg).text_color(C.bg))
          .on_click((_e, cx) => this.choose(cx))
          .child(div().child("choose…")).child(div().text_color(C.dim).child("⌘O"))))
      .child(div().text_color(f && !f.path && raw ? C.bright : C.dim).child(state))
      .child(h_flex().gap(10).items_center()
        .child(div().flex_none().text_color(this.at === 2 ? C.bright : C.dim).child("Due date? (optional)"))
        .child(this.input(2, "fri 27, 11/27, +5, or blank")))
      .child(div().text_color(due.error ? C.bright : C.dim).child(due.error ? `${due.error}` : due.due ? `due ${dueWords(due.due, Date.now())}` : "no due date"))
      .child(div().flex_1())
      .when(Boolean(this.msg), (el) => el.child(div().text_color(C.bright).child(this.msg)))
      .child(this.keyRow([["next", "NEXT", keyFor("next"), "or Enter signs on"], ["back", "BACK", keyFor("back"), "or Esc cancels"]]));
  }

  offPage() {
    const now = Date.now();
    const line = shared(LINE) ?? null;
    const space = spaces().find((s) => s.id === this.space);
    const slot = line?.slots?.find((s) => s.space === this.space);
    const plan = signOffPlan(line, this.space);
    if (!space) return v_flex().gap(8).child(div().text_color(C.bright).child("SIGN-OFF")).child(div().child("This space has already closed. Press BACK."));
    const all = stops(line, spaces(), panes());
    const mine = all.filter((s) => s.space === space.id);
    const to = landing(all, space.id);
    const n1 = next1Agent(agents().filter((x) => x.space !== space.id), null);
    const n1Stop = n1 ? all.find((s) => s.pane === n1.pane) : null;
    const row = (name, value, color = C.fg) => h_flex().gap(12).min_w(0)
      .child(div().w(110).flex_none().text_color(C.dim).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(color).child(value));
    const plats = mine.map((s) => `${s.code} ${s.program || s.label}${s.status && s.status !== "idle" ? ` (${stateWord(s.status)})` : ""}`).join(", ");
    let lineText = "";
    let upText = "";
    if (plan && !plan.middle) {
      const others = plan.comesOff.filter((x) => x !== plan.letter);
      lineText = (others.length ? `${plan.letter} and free ${others.join(", ")} come off` : `${plan.letter} comes off`)
        + (plan.leaves ? ` · leaves ${plan.leaves}` : " · the line will be empty");
    } else if (plan) {
      const later = line.slots.slice(line.slots.findIndex((s) => s.space === space.id) + 1).filter((s) => s.space).map((s) => s.letter);
      lineText = `${plan.letter} stays as a free letter · ${later.join(", ")} keep${later.length === 1 ? "s" : ""} ${later.length === 1 ? "its letter" : "their letters"}`;
      upText = `U closes up the line instead: ${plan.moves.map(([a, b]) => `${a}→${b}`).join(", ")}`;
    }
    const where = (s) => (s ? `${s.code} ${s.spaceName}` : "nowhere");
    return v_flex().flex_1().min_h(0).gap(8)
      .child(h_flex().gap(14).items_center()
        .child(this.badge(plan?.letter ?? "?", false))
        .child(v_flex()
          .child(div().text_size(22).line_height("28px").text_color(C.bright).child("SIGN-OFF"))
          .child(div().child(`Ready to sign off ${space.name}.`))))
      .child(v_flex().gap(2).border_t(1).border_color(C.glow).pt(6)
        .child(row("space", `${plan?.letter ?? "?"} ${space.name}`))
        .child(row("time open", slot?.opened ? `${duration(slot.opened, now)} · ${clock(slot.opened)} to ${clock(now)}` : "not known"))
        .child(row("tabs", `${tabCount(mine)} · ${plats || "none"}`))
        .when(Boolean(slot?.due), (el) => el.child(row("due", dueWords(slot.due, now))))
        .child(row("line", lineText || "this space has no letter")))
      .when(Boolean(upText), (el) => el.child(div().text_color(C.bright).child(upText)))
      .child(div().flex_1())
      .child(div().child(`Press NEXT to sign off and go to ${where(to)}${n1Stop ? ` · NEXT1 to sign off and go to ${where(n1Stop)}` : ""}`))
      .child(this.keyRow([
        ["next", "NEXT", keyFor("next"), "signs off"],
        ...(n1Stop ? [["next1", "NEXT1", keyFor("next1"), "signs off, goes to NEXT1"]] : []),
        ...(upText ? [["up", "U", "", "closes up instead"]] : []),
        ["back", "BACK", keyFor("back"), "or Esc keeps it open · nothing has closed yet"],
      ]));
  }

  /** CLOSE UP: what closing up the line does, before it happens. Letters are muscle
   *  memory, so the page lists every move and waits for NEXT. */
  upPage() {
    const plan = closeUpPlan(shared(LINE) ?? null);
    const row = (name, value, color = C.fg) => h_flex().gap(12).min_w(0)
      .child(div().w(110).flex_none().text_color(C.dim).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(color).child(value));
    const head = h_flex().gap(14).items_center()
      .child(this.badge(plan.free[0] ?? "·", true))
      .child(v_flex()
        .child(div().text_size(22).line_height("28px").text_color(C.bright).child("CLOSE UP"))
        .child(div().child(plan.free.length ? "Close up the line: the free letters come off, and the spaces after them move up." : "There are no free letters. The line is already closed up.")));
    if (!plan.free.length) {
      return v_flex().flex_1().min_h(0).gap(8).child(head).child(div().flex_1())
        .child(this.keyRow([["back", "BACK", keyFor("back"), "or Esc closes this page"]]));
    }
    const moves = plan.moves.map(([from, to, name], i) => row(i === 0 ? "moves" : "", `${name || from} ${from} → ${to}`, C.bright));
    return v_flex().flex_1().min_h(0).gap(8).child(head)
      .child(v_flex().gap(2).border_t(1).border_color(C.glow).pt(6)
        .child(row("free letters", `${plan.free.join(", ")} come${plan.free.length === 1 ? "s" : ""} off`))
        .children(moves.length ? moves : [row("moves", "none: the free letters were at the end")]))
      .child(div().flex_1())
      .child(div().child("Press NEXT to close up the line. The moved spaces show \"was\" and their old letter for a day."))
      .child(this.keyRow([["next", "NEXT", keyFor("next"), "closes up the line"], ["back", "BACK", keyFor("back"), "or Esc keeps the line as it is · nothing has moved yet"]]));
  }

}
