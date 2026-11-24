// The strip role: the bottom pane header. One copy per pane says what only it can say, about
// its own pane wherever your keys are: the stop code (e1, c3.2 in a split tab), the git state
// of the pane's folder ("⎇ feat/x ●3 ↑2 ↓1"), the agent's progress ("3/7") and, only while it
// needs you, its step ("▸ asks: Bash: git push"), from the step labels that any agent can
// write (see stripdata.js), and the state with how long it
// has been in it. Where you are (the space, the tab, the purpose) is in the banner and NOW AT.
// When the pane is narrow, the step is cut first, then the branch; the code and state stay.
// In reverse video with "◀ arrived from e1" after an arrival, until 4 s pass or a prompt is
// sent there, with the names and "GOAL <purpose>". (Reverse video, not the bright color: in
// the paper-white glow, bright and normal text are almost the same.)
// The git state comes from `git status --porcelain=v2 --branch` in the pane's folder, on the
// space's machine: at start, when the folder or branch changes, and every GIT_EVERY_MS, one
// call at a time (gitDue in stripdata.js). Reads the letters from shared "plato.line" (the route role writes them) and
// the arrival from shared "plato.arrival" (the nowat role writes it); writes nothing.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, shared, props, terminals, exec, checking } from "herdr";
import { C, FONT, stateColor, stateWord } from "./look.js";
import { letterOf, stopCode, tabLabel, programWord, duration, labelOf, arrivalShown, purposeOf } from "./line.js";
import { parseGit, gitWords, stepWords, gitDue, GIT_TIMEOUT_MS } from "./stripdata.js";
import { LINE, ARRIVAL } from "./shared.js";

export default class Strip {
  init(_p, cx) {
    this.tick(cx);
    this.git = null;     // parseGit's result for the pane's folder, or null
    this.gitFor = null;  // the folder and branch it was read for
    this.gitAt = 0;
    this.gitBusy = false;
    if (checking()) return;
    // A light check each second: read git again when the folder or branch changed, or
    // GIT_EVERY_MS passed.
    this.readGit(cx);
    cx.timer.every(1000, (cx) => this.readGit(cx));
  }

  /** Read the git state of the pane's folder, unless a read is running or nothing is due. */
  readGit(cx) {
    const p = panes().find((x) => x.pane === props()?.pane);
    const key = p?.cwd ? `${p.cwd}\n${p.branch ?? ""}` : null;
    if (!key) {
      if (this.git) { this.git = null; cx.notify(); }
      this.gitFor = null;
      return;
    }
    if (!gitDue({ busy: this.gitBusy, key: this.gitFor, at: this.gitAt }, key, Date.now())) return;
    this.gitBusy = true;
    this.gitFor = key;
    this.gitAt = Date.now();
    const at = this.gitAt;
    const machine = spaces().find((s) => s.tabs.some((t) => t.id === p.tab))?.machine ?? null;
    cx.spawn(async (cx) => {
      // --no-optional-locks: a read in the background never takes git's index lock from you.
      const r = await exec("git", ["--no-optional-locks", "status", "--porcelain=v2", "--branch"], { cwd: p.cwd, on: machine, timeout: GIT_TIMEOUT_MS }).catch(() => null);
      // A late answer for a folder the pane has left, or from a read given up on, is dropped.
      if (key !== this.gitFor || at !== this.gitAt) return;
      this.gitBusy = false;
      const git = r && r.code === 0 ? parseGit(r.stdout) : null;
      if (JSON.stringify(git) !== JSON.stringify(this.git)) { this.git = git; cx.notify(); }
    });
  }

  /** Redraw on the minute, for the time in the state. */
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => { cx.notify(); this.tick(cx); });
  }

  render() {
    const id = props()?.pane;
    const all = panes();
    const p = all.find((x) => x.pane === id);
    const space = p && spaces().find((s) => s.tabs.some((t) => t.id === p.tab));
    const tab = space?.tabs.find((t) => t.id === p.tab);
    const base = h_flex().id("strip").size_full().font_family(FONT).text_size(12).bg(C.bg).border_t(1).px(8).gap(8).items_center();
    if (!p || !tab) return base.border_color(C.glow);
    const letter = letterOf(shared(LINE) ?? null, space.id);
    const mine = all.filter((x) => x.tab === p.tab);
    const code = stopCode(letter, tab.index, mine.length > 1 ? mine.indexOf(p) + 1 : null);
    const on = p.focused;
    const now = Date.now();
    const terms = terminals();
    const arrival = shared(ARRIVAL);
    const arrived = arrivalShown(arrival, p.pane, labelOf(terms, p.terminal, "plato.last_at"), now); // a stop's key is its pane
    const fg = arrived ? C.bg : on ? C.fg : C.dim;
    const since = p.status === "working" ? tab.working_since : tab.changed_at;
    const time = duration(since, now);
    const labels = terms.find((t) => t.address === p.terminal)?.labels ?? null;
    const purpose = purposeOf(labels);
    const state = div().flex_none().text_color(arrived ? C.bg : on ? stateColor(p.status) : C.dim).child(time ? `${stateWord(p.status)} ${time}` : stateWord(p.status));
    const codeEl = div().flex_none().font_weight(700).text_color(arrived ? C.bg : on ? C.bright : C.dim).child(code);
    if (arrived) {
      const sep = () => div().text_color(C.bg).child("›");
      return base.border_color(C.fg).bg(C.fg).text_color(C.bg)
        .child(codeEl)
        .child(h_flex().flex_initial().min_w(0).gap(6).overflow_hidden()
          .child(div().flex_none().child(space.name))
          .child(sep())
          .child(div().min_w(0).truncate().child(`${tab.index} ${tabLabel(tab, p)}`))
          .child(sep())
          .child(div().flex_none().child(programWord(p.program))))
        .child(div().flex_1().min_w(0).truncate().child(purpose ? `GOAL ${purpose.text}` : ""))
        .child(div().flex_none().font_weight(700).child(`◀ arrived from ${arrival.from.code}`))
        .child(state);
    }
    const git = gitWords(p.branch ?? null, this.git);
    const step = p.terminal ? stepWords(labels, p.status) : null;
    const rule = () => div().flex_none().w(1).h(14).bg(C.glow);
    const dimOr = (c) => (on ? c : C.dim);
    return base.border_color(on ? C.fg : C.glow).text_color(fg)
      .child(codeEl)
      // The branch keeps its width before the step does (the step's flex basis is 0).
      .when(Boolean(git), (el) => el.child(rule()).child(h_flex().flex_initial().min_w(0).gap(6).overflow_hidden()
        .child(div().min_w(0).truncate().text_color(dimOr(C.fg)).child(git.name))
        .when(Boolean(git.marks), (e) => e.child(div().flex_none().text_color(C.dim).child(git.marks)))))
      .when(Boolean(step), (el) => el.child(rule()).child(h_flex().flex_1().min_w(0).gap(6).overflow_hidden()
        .when(Boolean(step.text), (e) => e.child(div().min_w(0).truncate().text_color(dimOr(C.fg)).child(step.text)))
        .when(Boolean(step.tasks), (e) => e.child(div().flex_none().text_color(step.dim ? C.dim : dimOr(C.fg)).child(step.tasks)))))
      .when(!step, (el) => el.child(div().flex_1()))
      .child(state);
  }
}
