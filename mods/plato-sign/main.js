// plato-sign: the sign-on and sign-off pages, as a modal dialog that plato-route opens.
//   props { page: "on" | "off" | "up", space, text, letter } (up: CLOSE UP the line)
// Sign-on shows the letter the new space will take (the first free slot; → or a click
// puts it at the end of the line instead; a free letter typed in the map comes as
// props.letter and is taken instead of the first free slot), the space name line, the folder it found and
// an optional due date. NEXT sets shared "plato.pending" and runs space.new; plato-route
// then gives the new space the pending letter. BACK cancels.
// Sign-off shows a summary first. Only NEXT (or NEXT1) closes the space, with
// space.close {confirmed: true}; BACK keeps it open. For a space in the middle of the
// line, U also closes up the line (plato-route does it once the space has gone).
// Dialogs get no key commands: NEXT, BACK and NEXT1 arrive through shared
// "plato.sign.key", which plato-route sets while this page is open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, spaces, panes, agents, shared, setShared, run, exec, home, keys, checking } from "herdr";
import { C, FONT, stateWord } from "./look.js";
import { signOnLetters, stops, duration, next1Agent, tabCount } from "./line.js";
import { signOnTarget, folderCandidates, shortPath, wrapPath, parseDue, dueWords, signOffPlan, landing, editLine, closeUpPlan } from "./sign.js";

const LINE = "plato.line";
const PENDING = "plato.pending";
const DIALOG = "plato.dialog.sign";
const SIGN_KEY = "plato.sign.key";
const CLOSEUP = "plato.closeup";

const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const FOLDER_CHARS = 64; // the folder line's room at 640 px, after "folder "
const tilde = (path) => (path && path.startsWith(home()) ? `~${path.slice(home().length)}` : path);

/** The key bound to a plato-route command, as ⌘⌥↩. */
function keyFor(cmd) {
  const k = keys().find((x) => x.section.startsWith("layout:") && x.action === `plato-route.${cmd}`)?.keys ?? "";
  const map = { cmd: "⌘", alt: "⌥", shift: "⇧", ctrl: "⌃", enter: "↩" };
  return k.split("-").map((p) => map[p] ?? p.toUpperCase()).join("");
}

export default class Sign extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.page = p.page === "off" || p.page === "up" ? p.page : "on";
    this.space = p.space ?? null;
    this.fixed = p.letter ?? null; // a free letter chosen in the map
    this.opened = Date.now();
    this.done = false;
    this.msg = "";
    const text = String(p.text ?? "");
    this.fields = [{ text, cursor: text.length }, { text: "", cursor: 0 }];
    this.at = 0;
    this.end = false;
    this.found = null; // { key, path } for the name line's text
    this.h = cx.focus_handle();
    this.h.focus();
    if (checking()) return;
    if (this.page === "on") { this.look(cx); this.tell(); }
    cx.timer.every(150, (cx) => this.poll(cx));
  }

  /** A key from plato-route (NEXT, BACK, NEXT1). */
  poll(cx) {
    const k = shared(SIGN_KEY);
    if (!k || k.at <= this.opened || this.done) return;
    setShared(SIGN_KEY, null);
    this.act(k.key);
    cx.notify();
  }

  act(key) {
    if (this.done) return;
    if (key === "back") return this.close();
    if (this.page === "on") { if (key === "next") this.signOn(); return; }
    // CLOSE UP: NEXT closes up the line; its own key again (cmd-u) closes the page.
    if (this.page === "up") { if (key === "next") this.closeUpNow(); else if (key === "up") this.close(); return; }
    if (key === "next" || key === "next1") this.signOff(key);
    if (key === "up" && signOffPlan(shared(LINE) ?? null, this.space)?.middle) this.signOff("up");
  }

  /** CLOSE UP: ask plato-route to drop the free letters and move the later spaces up (it
   *  applies a request with no space at once), then close the page. */
  closeUpNow() {
    if (closeUpPlan(shared(LINE) ?? null).free.length) setShared(CLOSEUP, { space: null, at: Date.now() });
    this.close();
  }

  close() {
    this.done = true;
    const id = props()?.overlay;
    if (shared(DIALOG)?.id === id) setShared(DIALOG, null);
    if (id) closeOverlay(id);
  }

  // ---- sign-on ----

  letters() {
    return signOnLetters(shared(LINE) ?? null);
  }

  /** The map's chosen letter, while it is still free. */
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
    const d = shared(DIALOG);
    const letter = this.letter();
    if (d && d.id === props()?.overlay && d.letter !== letter) setShared(DIALOG, { ...d, letter });
  }

  /** Look for the space's folder: a typed path, else beside the open spaces' folders,
   *  then home. */
  look(cx) {
    const key = this.fields[0].text.trim();
    if (this.found?.key === key || this.looking === key) return;
    this.looking = key;
    const t = signOnTarget(key, home());
    const cands = t.path ? [t.path] : folderCandidates(t.name, home(), spaces().filter((s) => !s.machine).map((s) => s.folder));
    if (!cands.length) { this.found = { key, path: null }; return; }
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", 'for d do [ -d "$d" ] && { printf %s "$d"; exit 0; }; done; exit 1', "sh", ...cands]);
      if (this.looking !== key) return;
      this.found = { key, path: r.code === 0 ? r.stdout : null };
      cx.notify();
    });
  }

  signOn() {
    const raw = this.fields[0].text.trim();
    const t = signOnTarget(raw, home());
    if (!t.name) { this.msg = "Type a space name first."; this.at = 0; return; }
    const due = parseDue(this.fields[1].text, Date.now());
    if (due.error) { this.msg = `Due date: ${due.error}.`; this.at = 1; return; }
    const letter = this.letter();
    if (!letter) { this.msg = "All 26 letters are in use."; return; }
    const found = this.found?.key === raw ? this.found.path : undefined;
    if (t.path && found === null) { this.msg = `There is no folder ${tilde(t.path)}.`; return; }
    const folder = t.path ?? found ?? null;
    setShared(PENDING, { name: t.name, letter, due: due.due, at: Date.now() });
    run("space.new", folder ? { name: t.name, folder } : { name: t.name });
    this.close();
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
    else if (e.key === "enter") this.act(m.alt ? "back" : m.control ? "next1" : "next");
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
    if (e.key === "tab" || e.key === "down" || e.key === "up") { this.at = 1 - this.at; return true; }
    if (this.at === 0 && choice && e.key === "right" && !m.platform && !m.alt && f.cursor === f.text.length && !this.end) { this.end = true; this.tell(); return true; }
    if (this.at === 0 && choice && e.key === "left" && !m.platform && !m.alt && f.cursor === 0 && this.end) { this.end = false; this.tell(); return true; }
    const clip = m.platform && e.key === "v" ? cx.read_from_clipboard() : undefined;
    const next = editLine(f, { key: e.key, mods: m, char: e.key_char, clip });
    if (!next) return false;
    this.fields[this.at] = next;
    if (this.at === 0) this.look(cx);
    return true;
  }

  // ---- drawing ----

  render() {
    const body = this.page === "on" ? this.onPage() : this.page === "up" ? this.upPage() : this.offPage();
    return v_flex().id("sign").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().font_family(FONT).text_size(14).line_height("20px").bg(C.bg).text_color(C.fg)
      .p(2).child(v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(
        v_flex().flex_1().min_h(0).border_1().border_color(C.fg).px(16).py(12).gap(8).child(body)));
  }

  badge(letter, dashed) {
    let r = div().w(46).h(46).flex_none().rounded_full().border_2().border_color(C.fg)
      .flex().items_center().justify_center().text_size(26).text_color(C.bright).child(letter ?? "?");
    return dashed ? r.border_dashed() : r;
  }

  /** The folder line. Shortened in the middle when long; a click shows it whole. */
  folderLine(folder, color) {
    const short = shortPath(folder, FOLDER_CHARS);
    const cut = short !== folder;
    const whole = cut && this.wholeFolder === folder;
    const row = h_flex().id("folder").gap(6).min_w(0).items_start().text_color(color)
      .child(div().flex_none().child("folder"))
      .child(whole ? div().flex_1().min_w(0).child(wrapPath(folder)) : div().min_w(0).truncate().child(short))
      .when(cut && !whole, (el) => el.child(div().flex_none().text_color(C.dim).child("· click to show all")));
    return !cut ? row : row.cursor_pointer().hover((st) => st.bg(C.glow))
      .on_click((_e, cx) => { this.wholeFolder = whole ? null : folder; cx.notify(); });
  }

  input(i, hint) {
    const on = i === this.at;
    const f = this.fields[i];
    const cursor = f.cursor < f.text.length
      ? div().whitespace_nowrap().bg(C.fg).text_color(C.bg).child(f.text[f.cursor])
      : div().w(8).h(17).bg(C.fg).loop("opacity", { from: 0, to: 1, period: 1060 });
    const before = f.text.slice(0, f.cursor);
    const shown = before.length > 46 ? `…${before.slice(-45)}` : before; // keep the cursor in view
    const text = on
      ? h_flex().min_w(0).child(div().whitespace_nowrap().child(shown)).child(cursor)
        .child(div().whitespace_nowrap().child(f.text.slice(f.cursor + 1)))
        .when(!f.text && Boolean(hint), (x) => x.child(div().pl(6).text_color(C.dim).whitespace_nowrap().child(hint)))
      : div().truncate().text_color(f.text ? C.fg : C.dim).child(f.text || hint);
    return h_flex().id(`field-${i}`).flex_1().min_w(0).gap(8).py(2).border_b(1).border_color(on ? C.bright : C.dim)
      .cursor_pointer().on_click((_e, cx) => { this.at = i; cx.notify(); })
      .child(div().flex_none().text_color(on ? C.bright : C.dim).child("▶"))
      .child(div().flex_1().min_w(0).overflow_hidden().child(text));
  }

  onPage() {
    this.tell(); // the line can change while the page is open
    const l = this.letters();
    const letter = this.letter();
    const raw = this.fields[0].text.trim();
    const t = signOnTarget(raw, home());
    const due = parseDue(this.fields[1].text, Date.now());
    let where;
    if (!letter) where = "All 26 letters are in use. Sign off a space first.";
    else if (!this.end && this.chosen()) where = `Signing on at ${letter}, the free letter you chose in the map${l.end ? ` · → puts it at the end as ${l.end}` : ""}`;
    else if (this.end || !l.free) where = `Signing on at ${letter}, the end of the line${l.free ? ` · ← fills the free ${this.chosen() ?? l.free} instead` : ""}`;
    else where = `Signing on at ${letter}, the first free letter${l.end ? ` · → puts it at the end as ${l.end}` : ""}`;
    const f = this.found?.key === raw ? this.found : null;
    const [folder, state] = !raw ? ["type a name, or a path that starts with ~/ or /", ""]
      : f?.path ? [tilde(f.path), "found · 1 tab opens with your shell"]
      : f ? (t.path ? [tilde(t.path), "not found"] : ["not found", "it starts where you are now"])
      : ["", "looking..."];
    return v_flex().flex_1().min_h(0).gap(10)
      .child(h_flex().gap(14).items_center()
        .child(this.badge(letter, true))
        .child(v_flex()
          .child(div().text_size(22).line_height("28px").text_color(C.bright).child("SIGN-ON"))
          .child(div().text_color(C.dim).child("Type your space name, then press NEXT"))))
      .child(this.input(0, "space name, or a folder path"))
      .child(div().id("where").cursor_pointer().text_color(l.free && l.end ? C.fg : C.dim)
        .on_click((_e, cx) => { if (l.free && l.end) { this.end = !this.end; this.tell(); cx.notify(); } })
        .child(where))
      // The folder on its own line, shortened in the middle so its own name always shows;
      // what happens with it on the line below.
      // A click on a shortened folder shows it whole, wrapped after each "/"; again shortens it.
      .child(v_flex().gap(2).min_w(0)
        .child(this.folderLine(folder, f?.path ? C.fg : C.dim))
        .when(Boolean(state), (el) => el.child(div().text_color(C.dim).child(state))))
      .child(h_flex().gap(10).items_center()
        .child(div().flex_none().text_color(this.at === 1 ? C.bright : C.dim).child("Due date? (optional)"))
        .child(this.input(1, "fri 27, 11/27, +5, or blank")))
      .child(div().text_color(due.error ? C.bright : C.dim).child(due.error ? `${due.error}` : due.due ? `due ${dueWords(due.due, Date.now())}` : "no due date"))
      .child(div().flex_1())
      .when(Boolean(this.msg), (el) => el.child(div().text_color(C.bright).child(this.msg)))
      .child(div().text_color(C.dim).child(`NEXT ${keyFor("next")} or Enter signs on · BACK ${keyFor("back")} or Esc cancels`));
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
      .child(div().text_color(C.dim).child(`BACK ${keyFor("back")} or Esc keeps it open · nothing has closed yet`));
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
        .child(div().text_color(C.dim).child(`BACK ${keyFor("back")} or Esc closes this page`));
    }
    const moves = plan.moves.map(([from, to, name], i) => row(i === 0 ? "moves" : "", `${name || from} ${from} → ${to}`, C.bright));
    return v_flex().flex_1().min_h(0).gap(8).child(head)
      .child(v_flex().gap(2).border_t(1).border_color(C.glow).pt(6)
        .child(row("free letters", `${plan.free.join(", ")} come${plan.free.length === 1 ? "s" : ""} off`))
        .children(moves.length ? moves : [row("moves", "none: the free letters were at the end")]))
      .child(div().flex_1())
      .child(div().child("Press NEXT to close up the line. The moved spaces show \"was\" and their old letter for a day."))
      .child(div().text_color(C.dim).child(`BACK ${keyFor("back")} or Esc keeps the line as it is · nothing has moved yet`));
  }

}
