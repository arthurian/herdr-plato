// review.js imports Herdr, so Node cannot run it; this checks its source instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewKeys } from "../reviewdata.js";

const src = readFileSync(new URL("../review.js", import.meta.url), "utf8");
/** The source without comments, so words in a comment do not count. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** A method's body, by its name at two spaces in. */
const method = (name) => code.match(new RegExp(`^ {2}(?:async )?${name}\\([^)]*\\) \\{\\n([\\s\\S]*?)\\n {2}\\}`, "m"))?.[1] ?? "";

test("review: reads files only on open, on a day change and on a folder change", () => {
  const timers = [...code.matchAll(/timer\.every\([^\n]*/g)].map((m) => m[0]);
  assert.ok(timers.length >= 1, "claim runs on a timer");
  for (const t of timers) assert.match(t, /^timer\.every\(200, \(cx\) => this\.claim\(cx\)\)/, `a timer that is not claim: ${t}`);
  assert.doesNotMatch(code, /timer\.after\(/, "no one-shot timers");
  const claim = method("claim");
  assert.match(claim, /^\s*const open = shared\(REVIEW\);\n\s*if \(!open\) return/, "claim returns at once while the page is closed");
  assert.match(code, /watchFolder\(/, "folder changes come from watchFolder");
  const render = method("render");
  assert.ok(render, "review.js has a render()");
  assert.doesNotMatch(render, /readTextFile|readdir|exec\(|watchFolder/, "render reads nothing");
});

test("review: never reads plato.first from the record", () => {
  assert.doesNotMatch(code, /plato\.first/);
  const uses = code.split("\n").filter((l) => /purposeOf\(/.test(l) && !/^import/.test(l));
  assert.ok(uses.length >= 1, "today's purposes come from purposeOf");
  for (const l of uses) assert.match(l, /\btoday\b/, `purposeOf only for today: ${l.trim()}`);
});

test("review: one git call at a time, with the strip's 5 s timeout", () => {
  assert.match(code, /import \{[^}]*\bGIT_TIMEOUT_MS\b[^}]*\} from "\.\/stripdata\.js"/);
  const calls = [...code.matchAll(/exec\("git"[^\n]*/g)].map((m) => m[0]);
  assert.ok(calls.length >= 3, "rev-parse, config and log");
  for (const c of calls) assert.match(c, /timeout: GIT_TIMEOUT_MS/, c);
  assert.equal([...code.matchAll(/await exec\("git"/g)].length, calls.length, "each git call is awaited before the next");
  assert.doesNotMatch(code, /Promise\.all/);
});

test("review: every key in the key line is also a click", () => {
  assert.match(method("cap"), /\.on_click\(/, "a key cap is a click");
  const line = method("keyLine");
  assert.match(line, /reviewKeys\(this\.model\.empty \? "day" : this\.page, this\.bandOpen\)/);
  assert.match(line, /this\.cap\(/);
  assert.doesNotMatch(line, /\.child\(k\)/, "a key is never drawn as plain text");
  const act = method("act");
  for (const page of ["day", "comments"]) for (const k of reviewKeys(page)) for (const key of k.keys) assert.ok(act.includes(`"${key}"`), `the key ${key} has an action`);
});

test("review: its own chord passes to Herdr, which runs plato.review once", () => {
  const key = method("key");
  assert.match(key, /action === "plato.review"[^\n]*chordOf\(e\.key, m\)\)\) return;/, "the plato.review chord returns without acting");
  assert.doesNotMatch(key.split("\n").find((l) => /const close =/.test(l)) ?? "", /own|plato.review/, "Esc and ctrl-g alone close from the page");
});

test("review: Enter and Space find the live stop by terminal and always answer", () => {
  const act = method("act");
  assert.match(act, /liveStop\(/, "the live stop comes from the terminal");
  assert.match(act, /REVIEW_WORDS\.nothingPicked/);
  assert.match(act, /REVIEW_WORDS\.noTab/);
  assert.match(act, /notOpen\(/);
  assert.doesNotMatch(act, /if \(!code\) return;/, "no silent return");
  assert.match(act, /plato\.goto:\$\{stop\.code\}/, "goto sends the live code");
  assert.match(act, /code: stop\.code/, "LOOK gets the live code");
});

test("review: load sorts posts by time, clamps the pick, and follows the post folders again", () => {
  const load = method("load");
  assert.match(load, /\.sort\(postNameOrder\)/);
  assert.match(load, /this\.sel = at >= 0 \? at : Math\.min\(this\.sel,/);
  assert.match(load, /this\.follow\(cx, "postsRoot", `\$\{dir\}\/posts`\)/);
  assert.match(load, /!this\.watches\.posts/);
});

test("review: a watch reload loads the wanted day", () => {
  assert.match(method("follow"), /this\.load\(cx, this\.want\)/);
  assert.match(method("act"), /this\.want = day;/);
});

test("review: the badge counts the posts shown, and the sources line says when git still counts", () => {
  const build = method("build");
  assert.match(build, /badge\(\{ posts: postsShown\(/);
  assert.match(build, /counting: /);
});

// Herdr sends commands only to the copies it shows. While REVIEW shows, the line copy of the
// route is hidden, so the review copy must carry a route that folds the page and takes the moves.
test("review: the review copy carries a route (mode review) that folds REVIEW", () => {
  const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../route.js", import.meta.url), "utf8");
  assert.match(main, /review:\s*\{\s*role:\s*"route",\s*mode:\s*"review"\s*\}/, "main.js gives the review copy a route in mode review");
  assert.match(main, /\.\.\.this\.roles,\s*\.\.\.this\.carried/, "commands reach the carried route");
  assert.match(route, /this\.reviewMode = p\?\.mode === "review"/);
  assert.match(route, /c === "review"\) return this\.reviewMode \? this\.fold\(\)/, "the review copy folds");
});

test("review: Tab switches the page, resets the pick and keeps the day", () => {
  const act = method("act");
  assert.match(act, /case "tab":/);
  assert.match(act, /this\.show\(this\.page === "day" \? "comments" : "day"\)/);
  assert.match(code, /NAMED = \{[^}]*tab: "tab"/);
  const show = method("show");
  assert.match(show, /if \(page === this\.page\) return;/, "the page shown keeps its pick");
  assert.match(show, /this\.sel = 0/);
  assert.match(show, /this\.reveal\(\)/);
  assert.doesNotMatch(show, /this\.(want|day|load)\b/, "a page change keeps the day");
});

test("review: REVIEW opens on the DAY page, and picks follow the page", () => {
  assert.match(code, /this\.openAt = open\.at;\n\s*this\.page = open\.page === "comments" \? "comments" : "day";/, "day unless a script named comments");
  assert.match(code, /this\.want = open\.day \?\? null;[\s\S]{0,120}this\.load\(cx, this\.want\)/, "a script can name the day");
  assert.match(method("items"), /onDay \? this\.model\.resultRows : this\.commentPicks\(\)/);
});

test("review: ↑↓ keep the pick in view on both pages", () => {
  assert.match(method("act"), /return this\.reveal\(\);/);
  const reveal = method("reveal");
  assert.match(reveal, /this\.resultScroll\.scroll_to_item\(this\.sel === 0 \? 0 : this\.model\.resultRows\[this\.sel\]\?\.scrollTo \?\? 0\)/, "the heading is child 0 of the results column; a row scrolls to its place, or its group's heading");
  assert.match(reveal, /this\.commentScroll\.scroll_to_item\(Math\.max\(0, this\.sel - this\.noteOff\(\)\)\)/, "comments are the only children of their list; the note above it is pick 0 when there is one");
});

test("review: a reload keeps the pick on the same result or comment", () => {
  assert.match(code, /const was = fresh \? null : this\.items\(\)\[this\.sel\]\?\.key;/);
  assert.match(code, /items\.findIndex\(\(x\) => x\.key === was\)/);
  assert.match(method("items"), /key: onDay \? `\$\{x\.code\}\|\$\{x\.a\}\|\$\{x\.at\}` : `\$\{x\.time\}\|\$\{x\.a\}`/, "one row per result: the result's time keeps rows of one tab apart");
});

test("review: TIMELINE grows only without results; the page names show a page", () => {
  assert.match(method("band"), /v_flex\(\)\.id\("review-band"\)\.flex_1\(\)\.min_h\(0\)/, "the band always takes its share of the height");
  assert.match(method("pageTabs"), /this\.show\(page\)/);
});

test("review: a result's text and its full report use the theme's text color, not the accent", () => {
  const row = method("resultRow");
  assert.match(row, /text_color\(C\.text\)[^\n]*\.child\(h\.words\.mark \? `\$\{h\.words\.mark\} \$\{h\.words\.v\}` : h\.words\.v\)/, "only ✕ shows; a plain result has no mark");
  assert.match(row, /div\(\)\.text_color\(C\.text\)\.child\(h\.words\.facts\)/);
  assert.match(row, /div\(\)\.text_color\(C\.text\)\.child\(h\.words\.report\)/);
});

test("review: the note's by-line starts with its kind, so it reads \"note · \"", () => {
  assert.match(method("build"), /by: `\$\{posts\.note\.kind\} · /);
});

test("review: the note uses the theme's text color; its shareable mark stays bright", () => {
  const note = method("note");
  assert.match(note, /div\(\)\.text_color\(C\.text\)\.child\(m\.note\.text\)/);
  assert.match(method("heading"), /text_color\(C\.bright\)\.child\(note\)/, "the ◆ shareable note");
});

test("review: comments on COMMENTS use the theme's text color", () => {
  assert.match(method("comments"), /div\(\)\.text_color\(C\.text\)\.child\(l\.text\)/);
});

test("review: the quiet spaces count every active tab, not only the results", () => {
  assert.match(method("build"), /quiet: quietWords\(quietSpaces\(events, tabs\)\)/);
});

test("review: a bar that belongs to no result has no click and no pointer", () => {
  const band = method("band");
  assert.match(band, /const n = bandHit\(m\.resultRows, h\);/);
  assert.match(band, /\.when\(n >= 0, \(el\) => el\.cursor_pointer\(\)\.on_click\(/);
});

test("review: the comments live only on COMMENTS; the page name counts them", () => {
  assert.doesNotMatch(code, /lettersLine|PAPER_LETTERS/);
  assert.match(method("pageTabs"), /commentsWords\(this\.model\.comments\.length\)/);
  const signals = readFileSync(new URL("../signals.js", import.meta.url), "utf8");
  assert.doesNotMatch(signals, /PAPER_LETTERS|letters\(/);
  assert.match(signals, /runningRows\(/);
});

test("review: a day with no record has no pages", () => {
  assert.match(method("act"), /case "tab":[\s\S]{0,120}if \(this\.model\.empty\) return;/);
  assert.match(method("keyLine"), /reviewKeys\(this\.model\.empty \? "day" : this\.page, this\.bandOpen\)/);
});

test("review: the DIRECTOR line sits under the header on DAY only, one line, and a click opens COMMENTS", () => {
  const render = method("render");
  assert.match(render, /onDay && !m\.empty[^\n]*this\.director\(m\)/, "DAY, not an empty day");
  const dir = method("director");
  assert.match(dir, /id\("review-director"\)/);
  assert.match(dir, /this\.show\("comments"\)/, "the click takes the Tab path");
  assert.match(dir, /REVIEW_WORDS\.director/);
  assert.match(dir, /REVIEW_WORDS\.more/);
  assert.match(dir, /REVIEW_WORDS\.noNoteLine/);
  assert.match(dir, /truncate\(\)/, "the lead is one line");
  assert.match(dir, /m\.note\.lead/);
});

test("review: Tab and Shift-Tab switch the page, not the window's focus", () => {
  // The window root binds tab and shift-tab to move the keyboard to the next tab stop, and a
  // binding runs before on_key_down. A binding in REVIEW's own key context wins over the root's.
  const init = method("init");
  assert.match(init, /cx\.bind_keys\(\[/, "init binds keys");
  for (const k of ["tab", "shift-tab"]) assert.match(init, new RegExp(`keystroke: "${k}", action: "plato-review-page", context: "PlatoReview"`), k);
  const render = method("render");
  assert.match(render, /\.key_context\("PlatoReview"\)/, "the page declares the context");
  assert.match(render, /\.on_action\("plato-review-page", \(_e, cx\) => \{ this\.act\("tab", cx\); cx\.notify\(\); \}\)/, "the action switches the page");
});

test("review: t and a click on the TIMELINE line fold the timeline, and the columns take its height", () => {
  assert.match(method("act"), /case "t":[\s\S]{0,160}this\.bandOpen = !this\.bandOpen;/);
  assert.match(code, /this\.bandOpen = true;/, "the timeline starts open");
  const render = method("render");
  assert.match(render, /this\.bandOpen \? this\.band\(m\) : this\.bandShut\(\)/);
  assert.match(method("bandShut"), /\.on_click\(/);
  assert.match(method("bandShut"), /REVIEW_WORDS\.timelineHidden/);
  assert.match(method("band"), /id\("review-band-head"\)[\s\S]{0,200}\.on_click\(/, "a click on the open timeline's heading folds it");
  assert.match(method("keyLine"), /k\.id !== "band"/, "a day with no record has no timeline key");
});

test("review: c copies the picked result, comment or note", () => {
  const act = method("act");
  assert.match(act, /case "c": \{[\s\S]{0,400}cx\.write_to_clipboard\(text\)/);
  assert.match(method("copyText"), /resultCopyText\(/);
  assert.match(method("copyText"), /commentCopyText\(/);
  assert.match(method("copyText"), /this\.model\.note\.text/);
  assert.match(method("commentPicks"), /this\.model\.note \? \[\{ code: null, a: null, note: true/, "the note is the first pick on COMMENTS");
  assert.match(method("note"), /this\.pickable\(/, "the note is picked like a comment, with ▶ and a click");
});

test("review: a space heading has the route's letter box, more room above it, and its count", () => {
  const results = method("results");
  assert.match(results, /\.pt\(10\)/, "10 px above a heading, so it sits with its own rows");
  assert.match(results, /w\(17\)\.h\(17\)[\s\S]{0,120}border_1\(\)\.border_color\(C\.fg\)/, "the letter in a box, as on the route");
  assert.match(results, /resultCountWords\(g\.rows\.length\)/);
});
