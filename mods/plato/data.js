// DATA: a checkpoint in the lesson's notesfile, like a response in PLATO Notes.
// Four lines: GOAL (the base note, prefilled), then Worked, Noticed and Next.
// Tab and Shift-Tab move, Enter saves, Esc cancels. A changed GOAL updates the
// goal; any filled checkpoint line adds a numbered response. Both go to the
// lesson's notesfile (shared "plato.notes"). The FILE line names a file for a
// Markdown copy (shared "plato.notesFile"); it starts empty, which means no file.
// Each line edits like a macOS text field and takes readline keys.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, spaces, shared, setShared, exec, home, notify } from "herdr";
import { C, lineInput } from "./kit.js";
import { editLine, checkpointAdd, goalSet, checkpointBlock, goalBlock, nextField, notesFilePath } from "./logic.js";
import { setPlace, dialogClosed } from "./keys.js";

export const NOTES_KEY = "plato.notes";

/** The FILE setting: unset until DATA is first saved, "" for no file. */
export const FILE_KEY = "plato.notesFile";

const FIELDS = [
  { key: "goal", label: "GOAL", hint: "Why are you in this lesson?" },
  { key: "worked", label: "WORKED", hint: "What just happened? What is going well?" },
  { key: "noticed", label: "NOTICED", hint: "What feels unclear, slow, or harder than expected?" },
  { key: "next", label: "NEXT", hint: "What is the most useful next step?" },
  { key: "file", label: "FILE", hint: "empty keeps notes in Herdr · or a path, e.g. ~/notes.md" },
];

async function append(path, text) {
  const r = await exec("sh", ["-c", 'mkdir -p "$(dirname "$1")" && printf "%s" "$2" >> "$1"', "sh", path, text]);
  if (r.code !== 0) throw new Error(r.stderr || `exit ${r.code}`);
}

const lastN = (file) => file?.responses?.[file.responses.length - 1]?.n ?? 0;

export default class Data {
  init(_p, cx) {
    const space = spaces().find((s) => s.active);
    this.space = space;
    const goal = (shared(NOTES_KEY) ?? {})[space?.id]?.goal?.text ?? "";
    this.goal0 = goal;
    const fileSetting = shared(FILE_KEY);
    this.firstTime = fileSetting === undefined || fileSetting === null;
    const start = { goal, file: this.firstTime ? "" : String(fileSetting) };
    this.lines = FIELDS.map((f) => {
      const text = start[f.key] ?? "";
      return { text, cursor: text.length };
    });
    this.at = goal ? 1 : 0; // start on WORKED once the lesson has a goal
    this.h = cx.focus_handle();
    this.h.focus();
    setPlace("data");
  }

  close() {
    setPlace(null);
    dialogClosed("data");
    closeOverlay(props().overlay);
  }

  submit(cx) {
    const space = this.space;
    if (!space) return this.close();
    const at = Date.now();
    const v = Object.fromEntries(FIELDS.map((f, i) => [f.key, this.lines[i].text.trim()]));
    setShared(FILE_KEY, v.file);
    const path = notesFilePath(v.file, home());
    delete v.file;
    const all = { ...(shared(NOTES_KEY) ?? {}) };
    let file = all[space.id] ?? null;
    let text = "";
    if (v.goal !== this.goal0.trim()) {
      file = goalSet(file, v.goal, at);
      if (v.goal) text += goalBlock(space.name, at, v.goal);
    }
    const before = lastN(file);
    file = checkpointAdd(file, v, at);
    if (lastN(file) !== before) text += checkpointBlock(space.name, lastN(file), at, v);
    all[space.id] = file;
    setShared(NOTES_KEY, all);
    if (text && path) {
      cx.spawn(async () => {
        try {
          await append(path, text);
        } catch (e) {
          notify({ title: "DATA could not save to the notes file", body: `${path}\n${e?.message ?? e}`, level: "warning" });
        }
      });
    }
    this.close();
  }

  key(e, cx) {
    const mods = e.modifiers ?? {};
    if (e.key === "escape") this.close();
    else if (e.key === "enter") this.submit(cx);
    else if (e.key === "tab") this.at = nextField(this.at, FIELDS.length, Boolean(mods.shift));
    else if (e.key === "up") this.at = nextField(this.at, FIELDS.length, true);
    else if (e.key === "down") this.at = nextField(this.at, FIELDS.length, false);
    else {
      const clip = mods.platform && e.key === "v" ? cx.read_from_clipboard() : undefined;
      const next = editLine(this.lines[this.at], { key: e.key, mods, char: e.key_char, clip });
      if (!next) return;
      this.lines[this.at] = next;
    }
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const field = (f, i) => {
      const on = i === this.at;
      const line = this.lines[i];
      const value = on ? lineInput(line, f.hint)
        : line.text ? div().truncate().child(line.text) : div().text_color(C.dim).truncate().child(f.hint);
      return h_flex().id(`data-${f.key}`).gap(10).py(3).border_b(1).border_color(on ? C.bright : C.dim)
        .cursor_pointer().on_click((_e, cx) => { this.at = i; cx.notify(); })
        .child(div().w(70).flex_none().text_color(on ? C.bright : C.dim).child(f.label))
        .child(div().flex_1().min_w(0).overflow_hidden().child(value));
    };
    return v_flex().id("data").track_focus(this.h).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(6).bg(C.bg).border_1().border_color(C.fg)
      .child(div().text_color(C.bright).child(`DATA  ·  a checkpoint for ${this.space?.name ?? "this lesson"}`))
      .children(FIELDS.map(field))
      .when(this.firstTime, (el) => el.child(div().text_color(C.bright)
        .child("New: DATA keeps notes in Herdr. To also keep a Markdown copy, type a file path in FILE.")))
      .child(div().flex_1())
      .child(div().text_color(C.dim).child(`Tab moves · Enter saves to NOTES${this.lines[4].text.trim() ? " and FILE" : ""} · Esc · empty lines are fine`));
  }
}
