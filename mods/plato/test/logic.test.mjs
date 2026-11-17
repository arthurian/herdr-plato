import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calMonth, statusWord, spaceLetter, letterIndex, pickNext, rowTitle, projectFolder,
} from "../logic.js";

test("calMonth: November 2026 starts on Sunday and marks today", () => {
  const m = calMonth(2026, 10, { y: 2026, m: 10, d: 16 });
  assert.equal(m.title, "November 2026");
  assert.equal(m.header, "Su Mo Tu We Th Fr Sa");
  assert.deepEqual(m.weeks[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(m.weeks.length, 5);
  assert.equal(m.today, 16);
});

test("calMonth: August 2026 starts on Saturday and has six weeks", () => {
  const m = calMonth(2026, 7, null);
  assert.deepEqual(m.weeks[0], [null, null, null, null, null, null, 1]);
  assert.equal(m.weeks.length, 6);
  assert.equal(m.today, null);
  for (const w of m.weeks) assert.equal(w.length, 7);
});

test("calMonth: February 2028 has 29 days", () => {
  const days = calMonth(2028, 1, null).weeks.flat().filter((d) => d !== null);
  assert.equal(Math.max(...days), 29);
});

test("calMonth: today in another month is not marked", () => {
  assert.equal(calMonth(2026, 10, { y: 2026, m: 9, d: 16 }).today, null);
});

test("statusWord maps blocked to needs you", () => {
  assert.equal(statusWord("blocked"), "needs you");
  assert.equal(statusWord("working"), "working");
  assert.equal(statusWord("done"), "done");
  assert.equal(statusWord("idle"), "idle");
  assert.equal(statusWord("unknown"), "");
});

test("spaceLetter and letterIndex", () => {
  assert.equal(spaceLetter(0), "a");
  assert.equal(spaceLetter(25), "z");
  assert.equal(spaceLetter(26), null);
  assert.equal(letterIndex("c"), 2);
  assert.equal(letterIndex("A"), -1);
  assert.equal(letterIndex("enter"), -1);
});

test("pickNext prefers blocked, wraps, then done, else null", () => {
  const a = [{ address: "t1", status: "done" }, { address: "t2", status: "working" }, { address: "t3", status: "blocked" }];
  assert.equal(pickNext(a, "t3"), "t1");
  assert.equal(pickNext(a, "t1"), "t3");
  assert.equal(pickNext([{ address: "t1", status: "done" }, { address: "t2", status: "idle" }], null), "t1");
  const b = [{ address: "t1", status: "blocked" }, { address: "t2", status: "blocked" }];
  assert.equal(pickNext(b, "t1"), "t2");
  assert.equal(pickNext(b, "t2"), "t1");
  assert.equal(pickNext([{ address: "t1", status: "idle" }], null), null);
});

test("rowTitle falls back to the program name", () => {
  assert.equal(rowTitle({ title: "  ", program: { name: "Claude Code" } }), "Claude Code");
  assert.equal(rowTitle({ title: "fix login", program: { name: "x" } }), "fix login");
});

test("projectFolder: git root, else cwd, else last", () => {
  assert.equal(projectFolder(null, null, "/p"), "/p");
  assert.equal(projectFolder("/repo", "/repo/src", null), "/repo");
  assert.equal(projectFolder(null, "/x", "/p"), "/x");
});



import { notesCwd, backAction, paneInSpace } from "../logic.js";

test("pickNext skips the current agent and moves on to a done one", () => {
  const a = [{ address: "t1", status: "done" }, { address: "t3", status: "blocked" }];
  assert.equal(pickNext(a, "t3"), "t1");
  assert.equal(pickNext([{ address: "t3", status: "blocked" }], "t3"), null);
});


test("notesCwd uses a terminal pane of the active tab when no terminal has focus", () => {
  const panes = [{ tab: "T2", cwd: null, mod: "plato" }, { tab: "T1", cwd: "/a" }, { tab: "T2", cwd: "/b" }];
  assert.equal(notesCwd({ tab: "T2", cwd: null }, panes), "/b");
  assert.equal(notesCwd({ tab: "T2", cwd: "/c" }, panes), "/c");
  assert.equal(notesCwd({ tab: "T9", cwd: null }, panes), null);
});

test("backAction focuses a live agent with agent.focus, else falls back", () => {
  const agents = [{ address: "t5" }];
  const panes = [{ terminal: "t7", pane: "p7" }];
  assert.deepEqual(backAction("t5", agents, panes), ["agent.focus", { terminal: "t5" }]);
  assert.deepEqual(backAction("t7", agents, panes), ["pane.focus", { pane: "p7" }]);
  assert.deepEqual(backAction("t9", agents, panes), ["agent.prev", {}]);
  assert.deepEqual(backAction(null, agents, panes), ["agent.prev", {}]);
});

test("paneInSpace finds a terminal pane in the space's active tab", () => {
  const space = { tabs: [{ id: "A", active: false }, { id: "B", active: true }] };
  const panes = [{ tab: "A", pane: "pa", terminal: "t1" }, { tab: "B", pane: "pm", terminal: null }, { tab: "B", pane: "pb", terminal: "t2" }];
  assert.equal(paneInSpace(space, panes), "pb");
  assert.equal(paneInSpace({ tabs: [] }, panes), null);
});


import { parseListing, treeRows, viewerKind, dirsToRefresh } from "../logic.js";

test("parseListing sorts folders first and hides dot files and node_modules", () => {
  const out = "b.txt\nsrc/\n.git/\nnode_modules/\nA.md\ndocs/\n.env\n";
  assert.deepEqual(parseListing(out), [
    { name: "docs", dir: true }, { name: "src", dir: true },
    { name: "A.md", dir: false }, { name: "b.txt", dir: false },
  ]);
});

test("treeRows flattens open folders with depth", () => {
  const listings = {
    "": [{ name: "docs", dir: true }, { name: "src", dir: true }, { name: "a.md", dir: false }],
    docs: [{ name: "x.md", dir: false }],
    src: [{ name: "y.js", dir: false }],
  };
  const rows = treeRows(listings, new Set(["docs"]));
  assert.deepEqual(rows.map((r) => [r.path, r.depth, r.dir, r.open]), [
    ["docs", 0, true, true], ["docs/x.md", 1, false, false],
    ["src", 0, true, false], ["a.md", 0, false, false],
  ]);
});

test("treeRows shows an open folder whose listing is still loading as empty", () => {
  assert.deepEqual(treeRows({ "": [{ name: "d", dir: true }] }, new Set(["d"])).map((r) => r.path), ["d"]);
});

test("viewerKind picks markdown, text or binary", () => {
  assert.equal(viewerKind("/r/README.md", "# hi"), "markdown");
  assert.equal(viewerKind("/r/a.js", "let x = 1;"), "text");
  assert.equal(viewerKind("/r/logo.png", "PNG\u0000\u0001"), "binary");
  assert.equal(viewerKind("/r/x.bin", null), "binary");
});

test("dirsToRefresh returns shown folders whose contents changed", () => {
  const shown = new Set(["", "docs"]);
  assert.deepEqual(dirsToRefresh(["/r/docs/x.md"], "/r", shown), ["docs"]);
  assert.deepEqual(dirsToRefresh(["/r/new.txt"], "/r", shown), [""]);
  assert.deepEqual(dirsToRefresh(["/r/src/y.js"], "/r", shown), []);
  assert.deepEqual(dirsToRefresh(["/r"], "/r", shown).sort(), ["", "docs"]);
});

import { letterCommands } from "../logic.js";

test("letterCommands selects the space and focuses a pane in that space, not the old one", () => {
  const spaces = [
    { id: "S1", tabs: [{ id: "T1", active: true }] },
    { id: "S2", tabs: [{ id: "T2", active: true }] },
  ];
  const panes = [{ tab: "T1", pane: "old", terminal: "t1" }, { tab: "T2", pane: "new", terminal: "t2" }];
  assert.deepEqual(letterCommands("b", spaces, panes), [["space.select", { id: "S2" }], ["pane.focus", { pane: "new" }]]);
  assert.deepEqual(letterCommands("z", spaces, panes), []);
  assert.deepEqual(letterCommands("enter", spaces, panes), []);
});








import { calHeight } from "../logic.js";

test("calHeight fits the panel to the number of weeks", () => {
  assert.equal(calHeight(5), 172);
  assert.equal(calHeight(6), 191);
  assert.equal(calHeight(4), 153);
});

import { cyclePane } from "../logic.js";

test("cyclePane steps through terminal panes of the space in tab order and wraps", () => {
  const space = { tabs: [{ id: "A" }, { id: "B" }] };
  const panes = [
    { tab: "B", pane: "b1", terminal: "t3" },
    { tab: "A", pane: "a1", terminal: "t1" },
    { tab: "A", pane: "m", terminal: null, mod: "plato" },
    { tab: "A", pane: "a2", terminal: "t2" },
    { tab: "X", pane: "x1", terminal: "t9" },
  ];
  assert.equal(cyclePane(space, panes, "a1", 1), "a2");
  assert.equal(cyclePane(space, panes, "a2", 1), "b1");
  assert.equal(cyclePane(space, panes, "b1", 1), "a1");
  assert.equal(cyclePane(space, panes, "a1", -1), "b1");
  assert.equal(cyclePane(space, panes, "m", 1), "a1");
  assert.equal(cyclePane({ tabs: [] }, panes, "a1", 1), null);
});

import { talkRows } from "../logic.js";

test("talkRows lists every terminal pane of the space in tab order, agents with status, shells as shell", () => {
  const space = { tabs: [{ id: "A", named: false, name: "1" }, { id: "B", named: true, name: "dev server" }] };
  const panes = [
    { tab: "B", pane: "b1", terminal: "t3", title: "t3", cwd: "/Users/x/proj", program: { name: "zsh" } },
    { tab: "A", pane: "a1", terminal: "t1", title: "x", program: { name: "Claude Code" } },
    { tab: "A", pane: "m", terminal: null, mod: "plato", title: "plato", program: { name: "plato" } },
  ];
  const agents = [{ address: "t1", status: "blocked", title: "Fix stop", program: { name: "Claude Code" }, focused: true }];
  assert.deepEqual(talkRows(space, panes, agents), [
    { pane: "a1", terminal: "t1", agent: true, word: "needs you", status: "blocked", title: "Fix stop", focused: true, peek: false, tab: "A", tabName: null },
    { pane: "b1", terminal: "t3", agent: false, word: "shell", status: null, title: "zsh · proj", focused: false, peek: true, tab: "B", tabName: "dev server" },
  ]);
});

test("talkRows shell title without a folder is the program name", () => {
  const rows = talkRows({ tabs: [{ id: "A" }] }, [{ tab: "A", pane: "p", terminal: "t1", title: "t1", cwd: null, program: { name: "zsh" } }], []);
  assert.equal(rows[0].title, "zsh");
});




import { pasteText } from "../logic.js";

test("pasteText appends clipboard text as one line", () => {
  assert.equal(pasteText("note: ", "line one\nline two\r\n"), "note: line one line two ");
  assert.equal(pasteText("a", undefined), "a");
  assert.equal(pasteText("", "\ttabbed  text"), " tabbed text");
});

import { editLine } from "../logic.js";

const L = (text, cursor) => ({ text, cursor });
const k = (key, mods = {}, char, clip) => ({ key, mods, char, clip });

test("editLine moves the cursor by character, word and line", () => {
  assert.deepEqual(editLine(L("abc", 3), k("left")), L("abc", 2));
  assert.deepEqual(editLine(L("abc", 0), k("left")), L("abc", 0));
  assert.deepEqual(editLine(L("abc", 1), k("right")), L("abc", 2));
  assert.deepEqual(editLine(L("abc", 3), k("right")), L("abc", 3));
  assert.deepEqual(editLine(L("one two three", 13), k("left", { alt: true })), L("one two three", 8));
  assert.deepEqual(editLine(L("one two three", 8), k("left", { alt: true })), L("one two three", 4));
  assert.deepEqual(editLine(L("one two three", 0), k("right", { alt: true })), L("one two three", 3));
  assert.deepEqual(editLine(L("one two", 4), k("left", { platform: true })), L("one two", 0));
  assert.deepEqual(editLine(L("one two", 1), k("right", { platform: true })), L("one two", 7));
  assert.deepEqual(editLine(L("one two", 4), k("home")), L("one two", 0));
  assert.deepEqual(editLine(L("one two", 1), k("end")), L("one two", 7));
});

test("editLine types, pastes and deletes at the cursor", () => {
  assert.deepEqual(editLine(L("ac", 1), k("b", {}, "b")), L("abc", 2));
  assert.deepEqual(editLine(L("ad", 1), k("v", { platform: true }, undefined, "b\nc")), L("ab cd", 4));
  assert.deepEqual(editLine(L("abc", 2), k("backspace")), L("ac", 1));
  assert.deepEqual(editLine(L("abc", 0), k("backspace")), L("abc", 0));
  assert.deepEqual(editLine(L("abc", 1), k("delete")), L("ac", 1));
  assert.deepEqual(editLine(L("abc", 3), k("delete")), L("abc", 3));
  assert.deepEqual(editLine(L("one two", 7), k("backspace", { alt: true })), L("one ", 4));
  assert.deepEqual(editLine(L("one two", 4), k("backspace", { platform: true })), L("two", 0));
});

test("editLine ignores control and command keys it does not know", () => {
  assert.equal(editLine(L("abc", 1), k("z", { control: true }, "z")), null);
  assert.equal(editLine(L("abc", 1), k("z", { platform: true }, "z")), null);
  assert.equal(editLine(L("abc", 1), k("up")), null);
});

test("editLine supports readline keys", () => {
  const c = { control: true }, a = { alt: true };
  assert.deepEqual(editLine(L("one two", 4), k("a", c)), L("one two", 0));
  assert.deepEqual(editLine(L("one two", 1), k("e", c)), L("one two", 7));
  assert.deepEqual(editLine(L("abc", 2), k("b", c)), L("abc", 1));
  assert.deepEqual(editLine(L("abc", 1), k("f", c)), L("abc", 2));
  assert.deepEqual(editLine(L("one two", 7), k("b", a, "∫")), L("one two", 4));
  assert.deepEqual(editLine(L("one two", 0), k("f", a, "ƒ")), L("one two", 3));
  assert.deepEqual(editLine(L("abc", 1), k("d", c)), L("ac", 1));
  assert.deepEqual(editLine(L("abc", 2), k("h", c)), L("ac", 1));
  assert.deepEqual(editLine(L("one two", 3), k("k", c)), L("one", 3));
  assert.deepEqual(editLine(L("one two", 4), k("u", c)), L("two", 0));
  assert.deepEqual(editLine(L("one two", 7), k("w", c)), L("one ", 4));
  assert.deepEqual(editLine(L("one two", 0), k("d", a, "∂")), L(" two", 0));
});



import { nextGlow } from "../logic.js";

test("nextGlow steps orange, amber, green, white, then orange again", () => {
  assert.equal(nextGlow("#ff8a1f"), "plato-amber");
  assert.equal(nextGlow("#FFB000"), "plato-green");
  assert.equal(nextGlow("#4fd06a"), "plato-white");
  assert.equal(nextGlow("#dcdcd2"), "plato");
  assert.equal(nextGlow("#123456"), "plato-amber");
  assert.equal(nextGlow(undefined), "plato-amber");
});

import { isHidden, focusCommands } from "../logic.js";

test("isHidden finds a node by id anywhere in the layout tree", () => {
  const tree = { id: "root", children: [{ id: "banner" }, { id: "classroom", children: [{ id: "left", hidden: true }, { id: "main" }, { id: "right" }] }] };
  assert.equal(isHidden(tree, "left"), true);
  assert.equal(isHidden(tree, "right"), false);
  assert.equal(isHidden(tree, "nope"), false);
  assert.equal(isHidden(null, "left"), false);
});

test("focusCommands hides both columns, or shows them when focus is on", () => {
  assert.deepEqual(focusCommands(false), [["layout.hide", { id: "left" }], ["layout.hide", { id: "right" }]]);
  assert.deepEqual(focusCommands(true), [["layout.show", { id: "left" }], ["layout.show", { id: "right" }]]);
});

import { indexNav } from "../logic.js";

test("indexNav moves the highlight with ctrl-n/ctrl-p and arrows, wrapping, and Enter goes", () => {
  const c = { control: true };
  assert.deepEqual(indexNav({ key: "n", mods: c }, 1, 5), { hi: 2 });
  assert.deepEqual(indexNav({ key: "n", mods: c }, 4, 5), { hi: 0 });
  assert.deepEqual(indexNav({ key: "p", mods: c }, 0, 5), { hi: 4 });
  assert.deepEqual(indexNav({ key: "down", mods: {} }, 1, 5), { hi: 2 });
  assert.deepEqual(indexNav({ key: "up", mods: {} }, 1, 5), { hi: 0 });
  assert.deepEqual(indexNav({ key: "enter", mods: {} }, 3, 5), { go: 3 });
  assert.equal(indexNav({ key: "n", mods: {} }, 1, 5), null);
  assert.equal(indexNav({ key: "x", mods: c }, 1, 5), null);
  assert.equal(indexNav({ key: "n", mods: c }, 0, 0), null);
});

import { pageFor } from "../logic.js";

test("pageFor pages a blocked agent only in focus mode, never the one you are on", () => {
  const a = [
    { address: "t1", status: "blocked", space_name: "biology", title: "Fix stop", program: { name: "Claude Code" } },
    { address: "t2", status: "working", space_name: "physics", title: "x", program: { name: "Claude Code" } },
    { address: "t3", status: "blocked", space_name: "music", title: " ", program: { name: "Claude Code" } },
  ];
  assert.equal(pageFor(a, "t2", false), null);
  assert.deepEqual(pageFor(a, "t2", true), { address: "t1", text: "biology · Fix stop needs you", more: 1 });
  assert.deepEqual(pageFor(a, "t1", true), { address: "t3", text: "music · Claude Code needs you", more: 0 });
  assert.equal(pageFor([a[1]], "t9", true), null);
});

import { helpPage, currentPlace } from "../logic.js";

test("helpPage gives each place its own title and keys", () => {
  const names = (p) => helpPage(p).rows.map((r) => r[0]);
  assert.match(helpPage("classroom").title, /PLATO keys/);
  assert.ok(names("classroom").includes("DATA") && names("classroom").includes("GLOW") && names("classroom").includes("MONITOR"));
  assert.match(helpPage("focus").title, /focus/i);
  assert.ok(names("focus").includes("FOCUS") && names("focus").includes("PAGE"));
  assert.match(helpPage("index").title, /INDEX/);
  assert.deepEqual(names("index"), ["letter", "ctrl-n / ↓", "ctrl-p / ↑", "Enter", "EDIT", "Esc"]);
  assert.match(helpPage("edit").title, /EDIT/);
  assert.ok(names("classroom").includes("EDIT"));
  assert.match(helpPage("data").title, /DATA/);
  assert.ok(names("data").includes("ctrl-a / ctrl-e") && names("data").includes("cmd-v") && names("data").includes("Tab / ↓"));
  assert.match(helpPage("monitor").title, /MONITOR/);
  assert.deepEqual(names("monitor"), ["1 to 9", "EDIT", "Esc", "click"]);
  assert.ok(names("focus").includes("MONITOR"));
  assert.deepEqual(helpPage("nowhere"), helpPage("classroom"));
});

test("currentPlace uses a fresh stored place, else focus or classroom", () => {
  assert.equal(currentPlace({ place: "index", at: 1000 }, 5000, false), "index");
  assert.equal(currentPlace({ place: "data", at: 1000 }, 1000 + 61000, false), "classroom");
  assert.equal(currentPlace(null, 5000, true), "focus");
  assert.equal(currentPlace(undefined, 5000, false), "classroom");
});

import { monitorTarget } from "../logic.js";

test("monitorTarget maps a row number to a terminal to peek at, skipping your own row", () => {
  const rows = [
    { terminal: "t1", peek: true },
    { terminal: "t2", peek: false },
    { terminal: "t3", peek: true },
  ];
  assert.equal(monitorTarget("1", rows), "t1");
  assert.equal(monitorTarget("3", rows), "t3");
  assert.equal(monitorTarget("2", rows), null);
  assert.equal(monitorTarget("4", rows), null);
  assert.equal(monitorTarget("0", rows), null);
  assert.equal(monitorTarget("a", rows), null);
});

import { dialogAction } from "../logic.js";

test("dialogAction closes an open dialog instead of stacking another", () => {
  assert.deepEqual(dialogAction("ov7"), { close: "ov7" });
  assert.deepEqual(dialogAction(null), { open: true });
  assert.deepEqual(dialogAction(undefined), { open: true });
});

import { LESSON, lessonStep } from "../lesson.js";

test("the PLATO lesson has eight one-screen pages, each with a source", () => {
  assert.equal(LESSON.length, 8);
  for (const p of LESSON) {
    assert.ok(p.title && p.source, p.title);
    assert.ok(p.lines.length >= 3 && p.lines.length <= 12, `${p.title}: ${p.lines.length} lines`);
  }
  assert.match(LESSON[LESSON.length - 1].title, /layout/i);
});


test("lessonStep pages forward and back and stays in range", () => {
  assert.equal(lessonStep(0, "enter", 8), 1);
  assert.equal(lessonStep(0, "right", 8), 1);
  assert.equal(lessonStep(3, "left", 8), 2);
  assert.equal(lessonStep(3, "backspace", 8), 2);
  assert.equal(lessonStep(0, "left", 8), 0);
  assert.equal(lessonStep(7, "enter", 8), 7);
  assert.equal(lessonStep(2, "x", 8), null);
});

import { renameCommand, editStart } from "../logic.js";

test("renameCommand renames a space or a tab, and an empty name restores the automatic one", () => {
  assert.deepEqual(renameCommand("space", "S1", "  biology  "), ["space.rename", { id: "S1", name: "biology" }]);
  assert.deepEqual(renameCommand("tab", "T2", "dev server"), ["tab.rename", { id: "T2", name: "dev server" }]);
  assert.deepEqual(renameCommand("space", "S1", "   "), ["space.rename", { id: "S1", name: "" }]);
});

test("editStart begins with the name you gave, or empty for an automatic name", () => {
  assert.deepEqual(editStart({ named: true, name: "biology" }), { text: "biology", cursor: 7 });
  assert.deepEqual(editStart({ named: false, name: "physics" }), { text: "", cursor: 0 });
  assert.deepEqual(editStart(undefined), { text: "", cursor: 0 });
});

import { currentTabRow } from "../logic.js";

test("currentTabRow picks the focused row, else the first row of the active tab", () => {
  const rows = [{ pane: "a", tab: "T1", focused: false }, { pane: "b", tab: "T2", focused: true }, { pane: "c", tab: "T2", focused: false }];
  assert.equal(currentTabRow(rows, "T1").pane, "b");
  const none = rows.map((r) => ({ ...r, focused: false }));
  assert.equal(currentTabRow(none, "T2").pane, "b");
  assert.equal(currentTabRow(none, "T9"), null);
});

import { checkpointAdd, goalSet, latestNext, checkpointBlock, goalBlock, nextField, NOTES_MAX } from "../logic.js";

test("checkpointAdd numbers responses, skips empty ones, and keeps the latest 63", () => {
  let f = checkpointAdd(null, { worked: "draft", noticed: "", next: "verify" }, 100);
  assert.deepEqual(f, { goal: null, responses: [{ n: 1, at: 100, worked: "draft", noticed: "", next: "verify" }] });
  f = checkpointAdd(f, { worked: "  ", noticed: "", next: "" }, 200);
  assert.equal(f.responses.length, 1);
  f = checkpointAdd(f, { worked: "", noticed: "slow", next: "" }, 300);
  assert.equal(f.responses[1].n, 2);
  assert.equal(NOTES_MAX, 63);
  let g = null;
  for (let i = 0; i < 70; i++) g = checkpointAdd(g, { worked: `w${i}`, noticed: "", next: "" }, i);
  assert.equal(g.responses.length, 63);
  assert.equal(g.responses[62].n, 70);
});

test("goalSet sets, keeps or clears the goal", () => {
  const f = goalSet(null, "  ship it  ", 5);
  assert.deepEqual(f.goal, { text: "ship it", at: 5 });
  assert.deepEqual(goalSet(f, "", 6).goal, null);
  assert.deepEqual(f.responses, []);
});

test("latestNext gives the newest non-empty Next", () => {
  const f = { goal: null, responses: [{ n: 1, next: "a" }, { n: 2, next: "" }, { n: 3, next: "c" }, { n: 4, next: " " }] };
  assert.equal(latestNext(f), "c");
  assert.equal(latestNext(null), null);
});

test("checkpointBlock and goalBlock write markdown blocks, leaving out empty fields", () => {
  const at = new Date(2026, 10, 17, 14, 30).getTime();
  assert.equal(checkpointBlock("physics", 4, at, { worked: "draft", noticed: "", next: "verify" }),
    "\n### physics · #4 · 2026-11-17 14:30\n- Worked: draft\n- Next: verify\n");
  assert.equal(goalBlock("physics", at, "ship it"), "\n### physics · goal · 2026-11-17 14:30\n- Goal: ship it\n");
});

test("nextField moves with Tab and Shift-Tab and wraps", () => {
  assert.equal(nextField(0, 4, false), 1);
  assert.equal(nextField(3, 4, false), 0);
  assert.equal(nextField(0, 4, true), 3);
});

import { monthsAround } from "../logic.js";

test("monthsAround gives the month before, this month and the month after, across years", () => {
  assert.deepEqual(monthsAround(2026, 10, 0), [{ y: 2026, m: 9 }, { y: 2026, m: 10 }, { y: 2026, m: 11 }]);
  assert.deepEqual(monthsAround(2026, 11, 0), [{ y: 2026, m: 10 }, { y: 2026, m: 11 }, { y: 2027, m: 0 }]);
  assert.deepEqual(monthsAround(2026, 0, -1), [{ y: 2025, m: 10 }, { y: 2025, m: 11 }, { y: 2026, m: 0 }]);
});

import { closeAction } from "../logic.js";

test("closeAction closes open PLATO dialogs first, else the tab", () => {
  const open = { "plato.dialog.peek": "o9", "plato.dialog.help": null, "plato.dialog.data": "o4", "plato.notes": {}, other: "x" };
  assert.deepEqual(closeAction(open), { close: [["peek", "o9"], ["data", "o4"]] });
  assert.deepEqual(closeAction({ "plato.dialog.help": null }), { tab: true });
  assert.deepEqual(closeAction(undefined), { tab: true });
});

import { goToCommand } from "../logic.js";

test("goToCommand focuses an agent by address, a shell by its pane, else nothing", () => {
  const agents = [{ address: "t5" }];
  const panes = [{ terminal: "t7", pane: "p7" }];
  assert.deepEqual(goToCommand("t5", agents, panes), ["agent.focus", { terminal: "t5" }]);
  assert.deepEqual(goToCommand("t7", agents, panes), ["pane.focus", { pane: "p7" }]);
  assert.equal(goToCommand("t9", agents, panes), null);
  assert.equal(goToCommand(null, agents, panes), null);
});

import { notesFilePath } from "../logic.js";

test("notesFilePath: no setting or an empty one means no file; ~ means the home folder", () => {
  assert.equal(notesFilePath(undefined, "/Users/a"), null);
  assert.equal(notesFilePath("", "/Users/a"), null);
  assert.equal(notesFilePath("   ", "/Users/a"), null);
  assert.equal(notesFilePath("~/Documents/n.md", "/Users/a"), "/Users/a/Documents/n.md");
  assert.equal(notesFilePath(" ~/n.md ", "/Users/a"), "/Users/a/n.md");
  assert.equal(notesFilePath("/tmp/n.md", "/Users/a"), "/tmp/n.md");
  assert.equal(notesFilePath("notes/n.md", "/Users/a"), "/Users/a/notes/n.md");
});
