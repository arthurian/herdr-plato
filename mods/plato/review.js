// The review role: REVIEW, PLATO's page for the day, in the place of the line and the work (the
// layout's review-view block). The route opens and folds it (plato.review, cmd-shift-r); while it
// is open, shared "plato.review" is { at } and this copy takes the keyboard.
// On open it lists plato-data, picks the day (openDay), reads that day file, up to 7 earlier
// ones for the sessions seen before (each read once), and the day's post folder, then counts
// the day's commits with git, one call at a time. While open, it watches plato-data and the
// post folders and reads again on a change; while closed, it reads nothing.
// Keys: ↑↓ (ctrl-p, ctrl-n) pick a result or a comment; the Space bar opens LOOK for its tab
// (plato.pick), Enter goes there (plato.goto); c copies the note; ←→ another day; Esc or
// ctrl-g closes (plato.review), and cmd-shift-r passes to Herdr, which runs plato.review. Each key
// in the key line is also a click.
// All words come from reviewdata.js.

import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, ScrollHandle } from "gpui-base";
import { shared, setShared, run, exec, readTextFile, watchFolder, appHome, terminals, panes, spaces, keys, checking } from "herdr";
import * as fs from "fs/promises";
import { C, FONT } from "./look.js";
import { keyText, dialogOpen, aliveAt } from "./keys.js";
import { ALIVE_MS, keysGaveBack } from "./logic.js";
import { chordOf } from "./leader.js";
import { dayKey, parseDay, freshDay } from "./day.js";
import { stops, purposeOf } from "./line.js";
import { GIT_TIMEOUT_MS } from "./stripdata.js";
import {
  openDay, stepDay, tabFacts, hasTabLabels, openEmpty, dayBand, hitTimes, hitTimeWords, mergeTabs, sumTimes, hitKey, dayStats, doneCounts, openTabs, quietSpaces, parsePost, layoutPosts,
  countCommits, doneShares, badge, sourcesLine, resultRows, resultRowWords, reportFor, spaceNames, groupRows, resultCopyText, commentCopyText, resultCountWords, rowsBelow, moreWords, REVIEW_WORDS, reviewKeys, wantedDay, dayBounds,
  coversWords, commitsByTab, resultTabs, dayWentRows, quietWords, openWords, byline, commentsHead, commentsWords, notOpen, bandLabel, bandMarks, switchBursts, bandHit, nowWords, burstLabels,
  postNameOrder, postsShown, liveStop, leadSentence,
} from "./reviewdata.js";
import { REVIEW, KEYS_BACK, NOTICE, LINE } from "./shared.js";

const DATA = "plato-data";
const EARLIER = 7; // earlier day files read for the sessions seen before
/** The dialogs that may open over the page; once they close, the page takes the keyboard back. */
const OVER = ["look", "jump", "help"];
/** Key names as the key line writes them. */
const NAMED = { up: "↑", down: "↓", left: "←", right: "→", enter: "↵", space: "space", c: "c", t: "t", tab: "tab" };
const CTRL = { p: "↑", n: "↓", b: "←", f: "→" };
const BAND_ROW = 24, BAND_ROW_MAX = 64, BAND_LABEL = 130; // TIMELINE: the least and most row height and the name column, px
const OFF_LINES = 12; // TIMELINE: the hatch lines across a stretch PLATO was off
const BAR_LABEL_MIN = 0.02; // TIMELINE: a bar narrower than this share of the band has no label
const DONE_LABEL = 112; // DONE: the verb column, px ("brainstormed" fits)
const RESULTS_GROW = 1.3, FACTS_GROW = 0.85; // column widths: the results wrap the most, the facts' numbers are short

/** A box that takes the size its parent gives it, with content that scrolls inside and a bar
 *  on top. Herdr's overflow_y_scrollbar wraps the element and loses its flex size, so a flex
 *  child built with it took its content's height and never scrolled (timetable.js does the same).
 *  The content is a column, so rows with flex_1 still share a box's free height. Content given
 *  as a list becomes the area's direct children (gap apart), so handle.scroll_to_item(i) can
 *  reveal child i. */
function scrollBox(id, content, handle = null, gap = 0) {
  const area = v_flex().id(id).absolute().inset_0().overflow_y_scroll().gap(gap)
    .when(Boolean(handle), (el) => el.track_scroll(handle));
  return div().relative()
    .child(Array.isArray(content) ? area.children(content) : area.child(content.flex_grow(1)))
    .child(Scrollbar.vertical(id).absolute().inset_0());
}

export default class Review {
  init(_p, cx) {
    this.h = cx.focus_handle();
    this.bandOpen = true;     // the timeline on DAY; t folds it, and the choice stays while Herdr runs
    this.days = [];
    this.day = null;          // { key, events } of the day shown
    this.want = null;         // the day key wanted (←→), which a watch reload loads
    this.posts = [];          // its posts, parsed, in file name order
    this.seen = new Map();    // earlier day key -> its session ids (read once; they do not change)
    this.seenBefore = new Set();
    this.git = null;          // { key, repoOf, counts, ok } for the day shown
    this.countedAt = Date.now();
    this.sel = 0;
    this.resultScroll = ScrollHandle.new(); // the results column, to keep the picked result in view
    this.commentScroll = ScrollHandle.new(); // COMMENTS' list, the same way
    this.page = "day"; // "day" (DAY) or "comments" (COMMENTS); Tab switches
    this.gen = 0;
    this.watches = {};
    this.rebuild();
    if (checking()) return;
    cx.timer.every(200, (cx) => this.claim(cx));
    // The window root binds Tab and Shift-Tab to move the keyboard to the next tab stop, and a
    // binding runs before on_key_down, so Tab never reached key() and took the keyboard away.
    // These bindings, in the page's own context, win over the root's.
    cx.bind_keys([
      { keystroke: "tab", action: "plato-review-page", context: "PlatoReview" },
      { keystroke: "shift-tab", action: "plato-review-page", context: "PlatoReview" },
    ]);
  }

  dir() {
    return `${appHome()}/${DATA}`;
  }

  /** Each 200 ms: nothing while the page is closed. On a new opening, read; then take the
   *  keyboard for a moment, and again after the keys panel, LOOK, JUMP, HELP or a sign page. */
  claim(cx) {
    const open = shared(REVIEW);
    if (!open) return this.shut();
    this.countBelow(cx);
    if (this.openAt !== open.at) {
      this.openAt = open.at;
      this.page = open.page === "comments" ? "comments" : "day";
      this.day = null;
      this.want = open.day ?? null;
      this.sel = 0;
      this.follow(cx, "data", this.dir());
      this.load(cx, this.want);
    }
    if (dialogOpen("keys")) { this.keyingAt ??= Date.now() - ALIVE_MS; return; }
    if (this.keyingAt != null) {
      const gaveBack = keysGaveBack(shared(KEYS_BACK), this.keyingAt);
      this.keyingAt = null;
      if (gaveBack && !this.h.is_focused()) this.h.focus();
      return;
    }
    const sign = Date.now() - (aliveAt("sign") ?? 0) < ALIVE_MS;
    if (OVER.some((n) => dialogOpen(n)) || sign || Date.now() - (this.sentAt ?? 0) < 1000) { this.away = true; return; }
    if (this.away) {
      this.away = false;
      if (!this.h.is_focused()) this.h.focus();
      return;
    }
    if (this.h.is_focused() || Date.now() - open.at > 1500) return;
    this.h.focus();
  }

  /** The page closed: stop watching. */
  shut() {
    if (this.openAt == null) return;
    this.openAt = null;
    for (const w of Object.values(this.watches)) w.w?.cancel();
    this.watches = {};
  }

  /** Watch a folder while the page is open; a change reads the wanted day again. A watch that
   *  ends (the folder is missing or gone) leaves its slot, and the next load follows it again. */
  follow(cx, slot, path) {
    this.watches[slot]?.w?.cancel();
    const me = { path, w: null };
    this.watches[slot] = me;
    cx.spawn(async (cx) => {
      for (;;) {
        me.w = watchFolder(path);
        const got = await me.w.catch(() => []);
        if (this.watches[slot] !== me) return; // replaced or closed
        if (!shared(REVIEW) || !got.length) { delete this.watches[slot]; return; } // closed or gone
        this.load(cx, this.want);
      }
    });
  }

  /** Read the day list, then a day (want, or the one openDay picks), its earlier days' sessions
   *  and its posts. A new day also counts its commits and watches its post folder; the posts
   *  folder and a post folder whose watch ended are followed again. */
  load(cx, want) {
    const gen = ++this.gen;
    cx.spawn(async (cx) => {
      const dir = this.dir();
      const now = Date.now();
      const names = await fs.readdir(dir).catch(() => []);
      const days = names.map((n) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(n)?.[1]).filter(Boolean).sort();
      const key = want ?? openDay(days, now);
      const events = key ? parseDay(await readTextFile(`${dir}/${key}.json`).catch(() => null)) : [];
      const seenBefore = new Set();
      for (const k of key ? days.filter((d) => d < key).slice(-EARLIER) : []) {
        if (!this.seen.has(k)) {
          const ev = parseDay(await readTextFile(`${dir}/${k}.json`).catch(() => null));
          this.seen.set(k, new Set(tabFacts(ev, now, false).flatMap((t) => t.sessions)));
        }
        for (const id of this.seen.get(k)) seenBefore.add(id);
      }
      const posts = [];
      if (key) {
        const folder = `${dir}/posts/${key}`;
        for (const n of (await fs.readdir(folder).catch(() => [])).filter((f) => f.endsWith(".md")).sort(postNameOrder)) {
          const p = parsePost(n, await readTextFile(`${folder}/${n}`).catch(() => ""));
          if (p) posts.push(p);
        }
      }
      if (gen !== this.gen || !shared(REVIEW)) return; // a later read, or the page closed
      const fresh = key !== this.day?.key;
      this.want ??= key;
      this.days = days;
      this.day = freshDay(this.day, { key, events }); // a read caught mid-write keeps the last one
      this.seenBefore = seenBefore;
      this.posts = posts;
      this.countedAt = now;
      if (!this.watches.postsRoot) this.follow(cx, "postsRoot", `${dir}/posts`);
      if (key && (fresh || !this.watches.posts)) this.follow(cx, "posts", `${dir}/posts/${key}`);
      if (fresh) {
        this.sel = 0;
        this.resultScroll.scroll_to_item(0);
        this.commentScroll.scroll_to_item(0);
        this.git = null;
        this.countGit(cx);
      }
      // A reload that is not a new day keeps the pick on the same result or comment, though a new
      // comment or result moves it in the list.
      const was = fresh ? null : this.items()[this.sel]?.key;
      this.rebuild();
      const items = this.items();
      const at = was == null ? -1 : items.findIndex((x) => x.key === was);
      this.sel = at >= 0 ? at : Math.min(this.sel, Math.max(0, items.length - 1));
      if (at >= 0) this.reveal();
      cx.notify();
    });
  }

  /** Count the day's commits, one git call at a time; a day change stops the count and starts
   *  it again for the new day. */
  countGit(cx) {
    if (this.gitBusy) { this.gitAgain = true; return; }
    const key = this.day?.key;
    if (!key) return;
    const cwds = [...new Set(tabFacts(this.day.events, Date.now(), false).filter((t) => t.active && t.cwd).map((t) => t.cwd))];
    this.gitBusy = true;
    cx.spawn(async (cx) => {
      const git = await this.gitCounts(key, cwds);
      this.gitBusy = false;
      if (this.gitAgain) { this.gitAgain = false; return this.countGit(cx); }
      if (!git || this.day?.key !== key) return;
      this.git = git;
      this.rebuild();
      cx.notify();
    });
  }

  /** For each folder its repo, then for each repo its user.email and the commits by that email
   *  in the day. null when the day changed meanwhile. ok: at least one count worked. */
  async gitCounts(key, cwds) {
    const { from, to } = dayBounds(key);
    const repoOf = new Map(), counts = new Map();
    let ok = false;
    for (const cwd of cwds) {
      if (this.day?.key !== key) return null;
      const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: GIT_TIMEOUT_MS }).catch(() => null);
      if (r?.code === 0 && r.stdout.trim()) repoOf.set(cwd, r.stdout.trim());
    }
    for (const repo of new Set(repoOf.values())) {
      if (this.day?.key !== key) return null;
      const e = await exec("git", ["config", "user.email"], { cwd: repo, timeout: GIT_TIMEOUT_MS }).catch(() => null);
      const email = e?.code === 0 ? e.stdout.trim() : "";
      if (!email) continue;
      // --fixed-strings: an email such as a+b@x.org is not a pattern.
      const l = await exec("git", ["log", `--since=@${from}`, `--until=@${to}`, `--author=${email}`, "--fixed-strings", "--format=%H"], { cwd: repo, timeout: GIT_TIMEOUT_MS }).catch(() => null);
      if (l?.code !== 0) continue;
      counts.set(repo, countCommits(l.stdout));
      ok = true;
    }
    return { key, repoOf, counts, ok };
  }

  /** The page model, from what was read. Today's purposes and todo progress come from the live
   *  labels, as the strip reads them; a past day's from its record only. */
  build() {
    const now = Date.now();
    const key = this.day?.key ?? null;
    const events = this.day?.events ?? [];
    const empty = { key: key ?? wantedDay(now), today: false, empty: true, badge: badge({ empty: REVIEW_WORDS.why }), resultRows: [], resultGroups: [], comments: [], quiet: null, note: null };
    if (!key || !events.length) return empty;
    const today = key === dayKey(now);
    const live = new Map(today ? terminals().map((t) => [t.address, t.labels ?? {}]) : []);
    const raw = tabFacts(events, now, today).map((t) => {
      const labels = live.get(t.a);
      if (!labels) return t;
      return { ...t, purpose: (today && purposeOf(labels)?.text) || t.purpose, tasks: labels["plato.tasks"] ?? t.tasks };
    });
    const tabs = mergeTabs(raw); // one tab for each code and purpose
    const codeOf = new Map(raw.map((t) => [t.a, t.code]));
    const code = (p) => (p.terminal ? codeOf.get(p.terminal) ?? null : null);
    const posts = layoutPosts(this.posts, (a) => codeOf.get(a) ?? null);
    const commits = this.git?.ok ? commitsByTab(tabs.filter((t) => t.active), this.git.repoOf, this.git.counts) : new Map();
    const end = today ? now : dayBounds(key).to * 1000 - 1;
    const listed = resultTabs(tabs);
    const times = hitTimes(events, now, today, raw);
    // One row per result, grouped by space in letter order, newest first inside each group; each
    // row's report is the tab's report nearest to it. place is the row's child in the results
    // column (0 is the heading, then each group's heading and rows); a group's first row
    // scrolls to its heading.
    let place = 0;
    const resultGroups = groupRows(resultRows(listed), spaceNames(events)).map((g) => {
      const head = ++place;
      return {
        letter: g.letter, name: g.name,
        rows: g.rows.map((r, k) => {
          const report = reportFor(this.posts, r.t.as, r.at);
          return { code: r.t.code, a: r.t.a, as: r.t.as, at: r.at, tab: r.tab, place: ++place, scrollTo: k === 0 ? head : place, report, time: hitTimeWords(sumTimes(times, r.t.as)), words: resultRowWords(r, commits.get(hitKey(r.t)) ?? 0, report) };
        }),
      };
    });
    const shown = resultGroups.flatMap((g) => g.rows);
    return {
      key, today, empty: false,
      badge: badge({ posts: postsShown(posts, new Set(shown.map((h) => h.report).filter(Boolean)).size), countedAt: this.countedAt, soFar: today, empty: null }),
      sources: sourcesLine({ hasLabels: hasTabLabels(events), hasPosts: this.posts.length > 0, hasGit: Boolean(this.git?.ok), counting: !this.git && Boolean(this.gitBusy) }),
      resultRows: shown, resultGroups,
      quiet: quietWords(quietSpaces(events, tabs)),
      note: posts.note && { text: posts.note.text, lead: leadSentence(posts.note.text), by: `${posts.note.kind} · ${byline(posts.note, code(posts.note))}` },
      comments: posts.comments.map((p) => ({ code: code(p), a: p.terminal, time: p.time, text: p.text, by: `— ${byline(p, code(p))}` })),
      commentsHead: commentsHead(posts.comments.length, today),
      done: doneCounts(tabs),
      open: openTabs(tabs, end, commits),
      openEmpty: openEmpty(tabs),
      went: dayWentRows(dayStats(events, now, today, this.seenBefore)),
      band: dayBand(events, now, today),
    };
  }

  rebuild() {
    this.model = this.build();
  }

  /** What ↑↓ pick from, as { code, a, note, key }: the result rows on the DAY page; on the
   *  COMMENTS page the director's note (when there is one), then the comments. code is the code
   *  in the record, a the terminal (null: a comment with no tab, or the note), key what keeps the
   *  pick across a reload. */
  items() {
    const onDay = this.page === "day";
    return (onDay ? this.model.resultRows : this.commentPicks())
      .map((x) => ({ code: x.code, a: x.a ?? null, note: Boolean(x.note), key: onDay ? `${x.code}|${x.a}|${x.at}` : `${x.time}|${x.a}` }));
  }

  /** COMMENTS' picks: the note first, so c can copy it, then the comments. */
  commentPicks() {
    return (this.model.note ? [{ code: null, a: null, note: true, time: "note" }] : []).concat(this.model.comments);
  }

  /** 1 when the note is pick 0 on COMMENTS, else 0: a comment's pick is its place plus this. */
  noteOff() {
    return this.model?.note ? 1 : 0;
  }

  /** The text c copies: the picked result row with its purpose and report, the picked comment
   *  with its by-line, or the note. null with nothing picked. */
  copyText() {
    if (this.page === "day") {
      const r = this.model.resultRows[this.sel];
      return r ? resultCopyText(r) : null;
    }
    const off = this.noteOff();
    if (off && this.sel === 0) return this.model.note.text;
    const c = this.model.comments[this.sel - off];
    return c ? commentCopyText(c) : null;
  }

  /** Show a page ("day" or "comments"): the pick starts again at the top. The page shown
   *  already keeps its pick. */
  show(page) {
    if (page === this.page) return;
    this.page = page;
    this.sel = 0;
    this.reveal();
  }

  /** Scroll the page's list to the pick. The results column's children are the heading, then one
   *  per result, so the first result shows the heading too. COMMENTS' list holds only the comments. */
  reveal() {
    if (this.page === "day") this.resultScroll.scroll_to_item(this.sel === 0 ? 0 : this.model.resultRows[this.sel]?.scrollTo ?? 0);
    else this.commentScroll.scroll_to_item(Math.max(0, this.sel - this.noteOff()));
  }

  notice(text) {
    setShared(NOTICE, { text, at: Date.now() });
  }

  /** What a key does, by its name in the key line; a click on its cap does the same. */
  act(k, cx) {
    const items = this.items();
    switch (k) {
      case "↑":
      case "↓":
        if (items.length) this.sel = Math.min(Math.max(this.sel + (k === "↑" ? -1 : 1), 0), items.length - 1);
        return this.reveal();
      case "tab":
        // The page switches; the day stays. A day with no record has no pages.
        if (this.model.empty) return;
        return this.show(this.page === "day" ? "comments" : "day");
      case "←":
      case "→": {
        const day = stepDay(this.days, this.model.key, k === "←" ? -1 : 1);
        if (day) { this.want = day; this.load(cx, day); }
        return;
      }
      case "space":
      case "↵": {
        // Codes follow tab positions, so the live stop is found by its terminal, and its code now is sent.
        const item = items[this.sel];
        if (!item) return this.notice(REVIEW_WORDS.nothingPicked);
        if (item.note) return this.notice(REVIEW_WORDS.noteNoTab);
        if (!item.a) return this.notice(REVIEW_WORDS.noTab);
        const stop = liveStop(stops(shared(LINE) ?? null, spaces(), panes()), item.a);
        if (!stop) return this.notice(item.code ? notOpen(item.code) : REVIEW_WORDS.noTab);
        if (k === "↵") return run(`plato.goto:${stop.code}`);
        this.sentAt = Date.now(); // LOOK opens over the page; the page takes the keyboard back after
        return run(`plato.pick:${JSON.stringify({ id: "look", target: { code: stop.code, from: "review" } })}`);
      }
      case "t":
        // DAY: fold the timeline, so the columns take its height; t or a click shows it again.
        if (this.page !== "day" || this.model.empty) return;
        this.bandOpen = !this.bandOpen;
        return;
      case "c": {
        // Copy what is picked: a result, a comment, or the note.
        const text = this.model.empty ? null : this.copyText();
        if (!text) return this.notice(REVIEW_WORDS.noCopy);
        cx.write_to_clipboard(text);
        return this.notice(REVIEW_WORDS.copied);
      }
    }
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    // The chord bound to plato.review: Herdr runs it, so the page does not.
    if (keys().some((x) => x.action === "plato.review" && chordOf(x.keys) === chordOf(e.key, m))) return;
    const close = e.key === "escape" || (m.control && !m.platform && !m.alt && e.key === "g");
    if (close) { cx.stop_propagation(); return run("plato.review"); }
    if (m.platform || m.alt) return;
    const k = m.control ? CTRL[e.key] : NAMED[e.key] ?? (e.key_char === " " ? "space" : null);
    if (!k) return;
    cx.stop_propagation();
    this.act(k, cx);
    cx.notify();
  }

  /** A key as a boxed cap, and a click that does what the key does. */
  cap(k, id) {
    return div().id(id).flex_none().px(4).border_1().border_color(C.fg).text_color(C.bright).cursor_pointer()
      .hover((s) => s.bg(C.glow))
      .on_click((_e, cx) => { this.act(k, cx); cx.stop_propagation(); cx.notify(); })
      .child(k);
  }

  keyLine() {
    return h_flex().flex_none().flex_wrap().gap_x(18).gap_y(2).pt(4).border_t(1).border_color(C.glow).text_color(C.dim)
      .children(reviewKeys(this.model.empty ? "day" : this.page, this.bandOpen).filter((k) => !this.model.empty || (k.id !== "page" && k.id !== "band")).map((k, i) => h_flex().gap(4).items_center()
        .children(k.keys.map((key, j) => this.cap(key, `review-key-${i}-${j}`)))
        .child(div().child(k.words))));
  }

  heading(text, note = null) {
    return h_flex().gap(8).text_color(C.dim).child(div().child(text)).when(Boolean(note), (el) => el.child(div().ml_auto().text_color(C.bright).child(note)));
  }

  /** A row the arrows pick: ▶ and the glow when picked; a click picks it. */
  pickable(el, i, id) {
    const on = i === this.sel;
    return h_flex().id(id).w_full().items_start().gap(4).cursor_pointer().when(on, (r) => r.bg(C.glow))
      .on_click((_e, cx) => { this.sel = i; cx.stop_propagation(); cx.notify(); })
      .child(div().flex_none().w(12).text_color(C.bright).child(on ? "▶" : ""))
      .child(el.flex_1().min_w(0));
  }

  /** RESULTS as a list: the heading, then each space's heading (letter and name) and its rows
   *  (or the empty line), then the quiet spaces. A row is the time, the code and the result; the
   *  picked row also shows the tab's purpose, facts, time and the report. The column scrolls to
   *  a row by its place in this list. */
  results(m) {
    return [this.heading(REVIEW_WORDS.results)]
      .concat(m.resultRows.length ? [] : [div().text_color(C.dim).child(REVIEW_WORDS.noResults)])
      // A space heading: 10 px above it, so it sits with its own rows; the letter in a box, as on
      // the route; the name; and the space's count of results at the right.
      .concat(m.resultGroups.flatMap((g) => [h_flex().gap(6).pt(10).pl(16).items_center()
        .child(div().flex_none().w(17).h(17).flex().items_center().justify_center().border_1().border_color(C.fg)
          .text_size(12).line_height("15px").text_color(C.bright).child(g.letter))
        .child(div().min_w(0).truncate().text_color(C.fg).child(g.name))
        .child(div().flex_none().ml_auto().text_color(C.dim).child(resultCountWords(g.rows.length)))]
        .concat(g.rows.map((h) => this.resultRow(h, m.resultRows.indexOf(h))))))
      .concat(m.quiet ? [div().text_color(C.dim).child(m.quiet)] : []);
  }

  /** The kinds of the results column's children from the top, for rowsBelow: the heading or the
   *  empty line, each space heading and its rows (the picked one apart), then the quiet line. */
  resultKinds(m) {
    return ["other"].concat(m.resultRows.length ? [] : ["other"])
      .concat(m.resultGroups.flatMap((g) => ["group", ...g.rows.map((h) => (m.resultRows.indexOf(h) === this.sel ? "picked" : "row"))]))
      .concat(m.quiet ? ["other"] : []);
  }

  /** Count the result rows below the visible part of RESULTS, from the last frame's scroll
   *  position, and draw again when the count changes. */
  countBelow(cx) {
    const m = this.model;
    let n = 0;
    if (this.page === "day" && m && !m.empty) {
      const h = this.resultScroll;
      n = rowsBelow(this.resultKinds(m), Math.max(0, h.content_size().height - h.offset().y - h.viewport_size().height));
    }
    if (n !== this.below) { this.below = n; cx.notify(); }
  }

  /** One result row, picked by ↑↓ at index i of resultRows. Rows and space headings other than
   *  the picked row keep to one line, so rowsBelow knows their height. */
  resultRow(h, i) {
    return this.pickable(v_flex()
      .child(h_flex().gap(6)
        .child(div().flex_none().text_color(C.dim).child(h.words.time))
        .child(div().flex_none().text_color(C.bright).child(h.code))
        .child(div().min_w(0).text_color(C.text).when(i !== this.sel, (el) => el.truncate()).child(h.words.mark ? `${h.words.mark} ${h.words.v}` : h.words.v)))
      .when(i === this.sel, (el) => el
        .when(Boolean(h.words.purpose), (r) => r.child(div().pt(2).text_color(C.fg).child(h.words.purpose)))
        .when(Boolean(h.words.facts) || Boolean(h.time), (r) => r.child(h_flex().flex_wrap().gap_x(12)
          .when(Boolean(h.words.facts), (x) => x.child(div().text_color(C.text).child(h.words.facts)))
          .when(Boolean(h.time), (x) => x.child(div().text_color(C.dim).child(`◷ ${h.time}`)))))
        .when(Boolean(h.words.report), (r) => r
          .when(Boolean(h.words.reportTime), (x) => x.child(div().pt(2).text_color(C.dim).child(`${REVIEW_WORDS.report} · ${h.words.reportTime}`)))
          .child(div().text_color(C.text).child(h.words.report)))), i, `review-result-${i}`);
  }

  /** DIRECTOR'S NOTE on COMMENTS: the note in full, as tall as its text (at most 1500
   *  characters), or one dim line when the day has none. */
  note(m) {
    if (!m.note) return h_flex().flex_none().gap(12).pb(4).border_b(1).border_color(C.glow).text_color(C.dim)
      .child(div().child(REVIEW_WORDS.note)).child(div().child(REVIEW_WORDS.noNoteToday));
    // The note is pick 0 on COMMENTS, so ↑ reaches it and c copies it.
    return div().flex_none().pb(6).border_b(1).border_color(C.glow).child(this.pickable(v_flex().gap(6)
      .child(this.heading(REVIEW_WORDS.note, REVIEW_WORDS.shareable))
      .child(div().text_color(C.text).child(m.note.text))
      .child(div().text_color(C.dim).child(m.note.by)), 0, "review-note"));
  }

  /** The DIRECTOR line on DAY: the note's lead on one line (cut with an ellipsis), or "no note
   *  today". A click shows COMMENTS, as Tab does. */
  director(m) {
    return h_flex().id("review-director").flex_none().gap(12).cursor_pointer()
      .on_click((_e, cx) => { this.show("comments"); cx.stop_propagation(); cx.notify(); })
      .child(div().flex_none().text_color(C.fg).child(REVIEW_WORDS.director))
      .when(!m.note, (el) => el.child(div().text_color(C.dim).child(REVIEW_WORDS.noNoteLine)))
      .when(Boolean(m.note), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(C.text).child(m.note.lead))
        .child(div().flex_none().text_color(C.dim).child(REVIEW_WORDS.more)));
  }

  /** The header's page names: the current page bright and underlined; a click shows a page. */
  pageTabs() {
    const tab = (page, words) => div().id(`review-page-${page}`).cursor_pointer()
      .when(this.page === page, (el) => el.text_color(C.bright).border_b(1).border_color(C.bright))
      .when(this.page !== page, (el) => el.text_color(C.dim).hover((s) => s.text_color(C.fg)))
      .on_click((_e, cx) => { this.show(page); cx.stop_propagation(); cx.notify(); })
      .child(words);
    return h_flex().gap(8).items_center().child(tab("day", REVIEW_WORDS.day)).child(div().text_color(C.dim).child("|")).child(tab("comments", commentsWords(this.model.comments.length)));
  }

  /** DONE, OPEN and HOW IT WENT. */
  /** One DONE line: the verb, a bar to scale with the day's largest count, and the
   *  count. "other" is dim, so the named verbs stand out. */
  bar(d, id) {
    return h_flex().id(id).gap(8).items_center()
      .child(div().w(DONE_LABEL).flex_none().truncate().child(d.verb))
      .child(div().flex_1().min_w(0).h(10).child(div().h_full().w(`${Math.round(d.share * 100)}%`).min_w(2).bg(d.verb === "other" ? C.dim : C.fg)))
      .child(div().w(28).flex_none().text_right().text_color(C.bright).child(String(d.n)));
  }

  facts(m) {
    const pair = (a, b, id) => h_flex().id(id).gap(8).child(div().min_w(0).child(a)).child(div().flex_1().min_w(8).h(10).border_b(1).border_dashed().border_color(C.glow)).child(div().flex_none().text_color(C.bright).child(b));
    return v_flex().gap(4)
      .child(this.heading(REVIEW_WORDS.done))
      .when(!m.done.length, (el) => el.child(div().text_color(C.dim).child(REVIEW_WORDS.noneDone)))
      .children(doneShares(m.done).map((d, i) => this.bar(d, `review-done-${i}`)))
      .child(div().pt(6).child(this.heading(REVIEW_WORDS.open)))
      .when(!m.open.length, (el) => el.child(div().text_color(C.dim).child(m.openEmpty)))
      .children(m.open.map((r, i) => {
        const w = openWords(r);
        return h_flex().id(`review-open-${i}`).gap(8)
          .child(div().flex_none().text_color(C.bright).child(r.code))
          .child(div().flex_1().min_w(0).truncate().when(!r.purpose, (el) => el.text_color(C.dim)).child(w.purpose))
          .child(div().flex_none().text_color(C.dim).child(w.meta));
      }))
      .child(div().pt(6).child(this.heading(REVIEW_WORDS.went)))
      .children(m.went.map(([a, b], i) => pair(a, b, `review-went-${i}`)));
  }


  /** COMMENTS' list: every comment of the day, newest first, each in a box; the list scrolls
   *  and keeps the picked comment in view. */
  comments(m) {
    const off = this.noteOff(); // the note is pick 0 when there is one
    const list = m.comments.length
      ? m.comments.map((l, i) => div().id(`review-comment-box-${i}`).p(4).border_1().border_color(i + off === this.sel ? C.bright : C.glow)
        .child(this.pickable(v_flex()
          .child(div().text_color(C.text).child(l.text))
          .child(div().text_color(C.dim).child(l.by)), i + off, `review-comment-${i}`)))
      : [div().text_color(C.dim).child(REVIEW_WORDS.noComments)];
    return v_flex().flex_1().min_h(0).gap(6)
      .child(this.heading(REVIEW_WORDS.comments, m.commentsHead))
      .child(scrollBox("review-comments", list, this.commentScroll, 10).flex_1().min_h(0));
  }

  /** TIMELINE: a row for each space, drawn in percent of the row's width. The band takes its
   *  share of the page height, each row between BAND_ROW and BAND_ROW_MAX; more rows scroll. Quick switching (switchBursts) is a hatched strip
   *  over the rows with its count. The picked result's bars and marks stay lit, its bars boxed,
   *  and the rest dim; a click on a bar picks its result. */
  band(m) {
    const b = m.band;
    if (!b || b.to <= b.from) return null;
    const span = b.to - b.from;
    const pc = (t) => `${((t - b.from) / span) * 100}%`;
    const wd = (f, t) => `${(Math.max(0, t - f) / span) * 100}%`;
    const tint = (alpha) => `${C.fg.slice(0, 7)}${alpha}`;
    const at = (f, t) => div().absolute().left(pc(f)).w(wd(f, t));
    const rows = b.rows;
    const bursts = switchBursts(rows);
    // The picked row's tab, by its place among the tabs; null off DAY or with no results. The
    // band lights every bar of that tab.
    const pick = this.page === "day" && m.resultRows.length ? m.resultRows[this.sel]?.tab ?? null : null;
    const lit = (item) => pick == null || m.resultRows[bandHit(m.resultRows, item)]?.tab === pick;
    const hatch = (f, t) => Array.from({ length: OFF_LINES + 1 }, (_, k) => div().absolute().left(pc(f + ((t - f) * k) / OFF_LINES)).top(0).bottom(0).w(1).bg(C.glow));
    const key = (sample, words) => h_flex().gap(4).items_center().child(sample).child(div().child(words));
    const legend = h_flex().gap(12).text_color(C.dim).text_size(12)
      .child(key(div().w(14).h(8).bg(tint("55")), "you were there"))
      .child(key(div().w(14).h(2).bg(C.fg), "an agent worked"))
      .child(key(div().w(8).h(8).bg(C.bright), "waited on you"))
      .child(key(div().child("✓✕"), "result"))
      .when(bursts.length > 0, (el) => el.child(key(h_flex().w(14).h(8).gap(2).children([0, 1, 2, 3].map(() => div().w(1).h_full().bg(C.dim))), "quick switches")))
      // Today's band ends now: its label sits at the right end, over the now line in each row.
      .when(m.today, (el) => el.child(div().text_color(C.bright).child(nowWords(b.to))));
    const row = (r, i) => {
      const els = [];
      for (const t of b.ticks) els.push(div().absolute().left(pc(t)).top(0).bottom(0).w(1).bg(C.glow));
      for (const o of b.offs) els.push(...hatch(o.from, o.to));
      if (m.today) els.push(div().absolute().right(0).top(0).bottom(0).w(1).bg(C.bright));
      r.here.forEach((h, k) => {
        const on = lit(h);
        const n = bandHit(m.resultRows, h);
        const label = (h.to - h.from) / span >= BAR_LABEL_MIN ? bandLabel(h.code) : "";
        els.push(at(h.from, h.to).id(`review-bar-${i}-${k}`).top(2).bottom(5).bg(tint(on ? "55" : "22")).overflow_hidden()
          .when(on && pick != null, (el) => el.border_1().border_color(C.bright))
          // A bar of a result picks it; a bar of no result has no click and no pointer.
          .when(n >= 0, (el) => el.cursor_pointer().on_click((_e, cx) => {
            this.sel = n;
            this.reveal();
            cx.stop_propagation();
            cx.notify();
          }))
          .child(div().pl(2).text_size(11).line_height("13px").whitespace_nowrap().text_color(on ? C.fg : C.dim).child(label)));
      });
      for (const w of r.work) els.push(at(w.from, w.to).bottom(2).h(2).bg(lit(w) ? C.fg : C.dim));
      for (const w of r.waits) els.push(at(w.from, w.to).top(2).bottom(5).min_w(3).bg(lit(w) ? C.bright : C.dim));
      for (const x of bandMarks(r.results, span)) {
        const on = x.items.some(lit);
        els.push(div().absolute().left(pc(x.at)).top(0).ml(-4).font_weight(700)
          .text_color(on ? (x.ok ? C.fg : C.bright) : C.dim).child(`${x.ok ? "✓" : "✕"}${x.n > 1 ? x.n : ""}`));
      }
      return h_flex().id(`review-band-${i}`).w_full().items_stretch()
        .flex_1().min_h(BAND_ROW).max_h(BAND_ROW_MAX)
        .child(div().w(BAND_LABEL).flex_none().pt(2).truncate().child(h_flex().gap(6)
          .child(div().text_color(C.bright).child(r.letter)).child(div().child(r.name))))
        .child(div().relative().flex_1().min_w(0).border_b(1).border_color(C.glow).children(els));
    };
    const hours = div().relative().flex_1().h(14).children(b.ticks.map((t) => div().absolute().left(pc(t)).ml(-8).text_size(11)
      .line_height("14px").text_color(C.dim).child(String(new Date(t).getHours()).padStart(2, "0"))));
    // Quick switching: a hatched strip over the rows, with its count where it fits.
    const counts = bursts.length ? h_flex().flex_none().child(div().w(BAND_LABEL).flex_none())
      .child(div().relative().flex_1().h(18)
        .children(bursts.map((x) => at(x.from, x.to).top(13).h(4).min_w(2).overflow_hidden().children(hatch(0, 1).map((_, k) => div().absolute().left(`${(k * 100) / OFF_LINES}%`).top(0).bottom(0).w(1).bg(C.dim)))))
        .children(burstLabels(bursts, span).map((l) => div().absolute().left(pc(l.at)).top(0).text_size(11).line_height("12px").text_color(C.dim).child(l.text)))) : null;
    return v_flex().id("review-band").flex_1().min_h(0).justify_end().gap(0).pt(6).border_t(1).border_color(C.glow)
      .child(div().id("review-band-head").pb(4).cursor_pointer()
        .on_click((_e, cx) => { this.act("t", cx); cx.stop_propagation(); cx.notify(); })
        .child(this.heading(REVIEW_WORDS.timeline, legend)))
      .when(Boolean(counts), (el) => el.child(counts))
      // The rows scroll inside a capped box, so many spaces never push the columns off the page.
      .child(scrollBox("review-band-rows", v_flex().children(rows.map(row)))
        .flex_1().min_h(0))
      .child(h_flex().child(div().w(BAND_LABEL).flex_none()).child(hours));
  }

  /** The folded timeline: one line, and a click shows the timeline again, as t does. */
  bandShut() {
    return h_flex().id("review-band-shut").flex_none().gap(8).pt(6).border_t(1).border_color(C.glow).cursor_pointer()
      .on_click((_e, cx) => { this.act("t", cx); cx.stop_propagation(); cx.notify(); })
      .child(div().text_color(C.dim).child(REVIEW_WORDS.timeline))
      .child(div().text_color(C.dim).child(REVIEW_WORDS.timelineHidden));
  }

  render() {
    const m = this.model;
    const onDay = this.page === "day";
    const column = (id, child, grow = 1, handle = null) => scrollBox(id, child, handle, 6).flex_1().flex_grow(grow).min_w(0);
    // RESULTS says how many rows are below its visible part, at its bottom right.
    const more = this.page === "day" ? moreWords(this.below ?? 0) : null;
    const resultsCol = column("review-results", this.results(m), RESULTS_GROW, this.resultScroll)
      // Its background reaches the right edge, so it covers a heading's count under it.
      .when(Boolean(more), (el) => el.child(div().absolute().bottom(0).right(0).pl(8).pr(12).bg(C.bg).text_color(C.dim).child(more)));
    const cols = m.empty ? [] : [resultsCol, column("review-facts", this.facts(m), FACTS_GROW)];
    const close = div().id("review-close").text_color(C.dim).cursor_pointer().hover((s) => s.text_color(C.bright))
      .on_click((_e, cx) => { cx.stop_propagation(); run("plato.review"); })
      .child(`${keyText({ cmd: "review" })} ${REVIEW_WORDS.closes}`);
    const head = h_flex().flex_none().gap(12).items_center()
      .child(div().text_color(C.bright).font_weight(700).child(REVIEW_WORDS.title))
      .child(div().text_color(C.dim).child(coversWords(m.key)))
      .when(!m.empty, (el) => el.child(div().text_color(C.glow).child("│")).child(this.pageTabs()))
      .child(div().ml_auto().px(6).border_1().border_color(C.fg).child(m.badge))
      .child(close);
    const page = v_flex().flex_1().min_h(0).border_1().border_color(C.fg).px(10).py(6).gap(8)
      .child(head)
      .when(onDay && !m.empty, (el) => el.child(this.director(m)))
      .when(!m.empty && Boolean(m.sources), (el) => el.child(div().flex_none().text_color(C.dim).child(m.sources)))
      // DAY: the columns always take a share of the height and scroll inside it; a
      // content-sized row does not shrink its scrolling columns and drew over the band.
      .when(onDay || m.empty, (el) => el.child(h_flex().flex_1().min_h(0).gap(20).items_stretch().children(cols)))
      .when(onDay && !m.empty && Boolean(m.band), (el) => el.child(this.bandOpen ? this.band(m) : this.bandShut()))
      // COMMENTS: the note (or its one line), then every comment.
      .when(!onDay && !m.empty, (el) => el.child(this.note(m)).child(this.comments(m)))
      .child(this.keyLine());
    return v_flex().id("review").size_full().font_family(FONT).text_size(14).line_height("19px").bg(C.bg).text_color(C.fg).p(2)
      .track_focus(this.h)
      .key_context("PlatoReview")
      .on_action("plato-review-page", (_e, cx) => { this.act("tab", cx); cx.notify(); })
      .on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", () => this.h.focus())
      .child(v_flex().flex_1().min_h(0).border_1().border_color(C.glow).p(1).child(page));
  }
}
