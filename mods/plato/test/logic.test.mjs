import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectFolder, notesCwd, parseListing, treeRows, viewerKind, dirsToRefresh,
  isHidden, findNode, keysetPad, focusCommands, ROUTE_PX, ROUTE_SLIM_PX, pageFor, helpScreens, helpKey, dialogAction, closeAction,
} from "../logic.js";

// ---- FILES and the viewer ----

test("projectFolder: git root, else cwd, else last", () => {
  assert.equal(projectFolder(null, null, "/p"), "/p");
  assert.equal(projectFolder("/repo", "/repo/src", null), "/repo");
  assert.equal(projectFolder(null, "/x", "/p"), "/x");
});

test("notesCwd uses a terminal pane of the active tab when no terminal has focus", () => {
  const panes = [{ tab: "T2", cwd: null, mod: "plato" }, { tab: "T1", cwd: "/a" }, { tab: "T2", cwd: "/b" }];
  assert.equal(notesCwd({ tab: "T2", cwd: null }, panes), "/b");
  assert.equal(notesCwd({ tab: "T2", cwd: "/c" }, panes), "/c");
  assert.equal(notesCwd({ tab: "T9", cwd: null }, panes), null);
});

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

// ---- FOCUS and the SIGNAL line ----

test("isHidden finds a node by id anywhere in the layout tree", () => {
  const tree = { id: "root", children: [{ id: "banner" }, { id: "middle", children: [{ id: "route" }, { id: "right", hidden: true }] }] };
  assert.equal(isHidden(tree, "right"), true);
  assert.equal(isHidden(tree, "route"), false);
  assert.equal(isHidden(tree, "nope"), false);
  assert.equal(isHidden(null, "right"), false);
});

test("keysetPad: the route on the left, the right column on the right, so the keys center on the terminal", () => {
  const tree = (o = {}) => ({ id: "root", children: [
    { id: "main-row", children: [
      { id: "plato-main", type: "stack", active: o.active ?? "line-view", children: [
        { id: "line-view", children: [{ id: "route", size: { px: o.route ?? 260 } }, { id: "work" }] },
        { id: "map-view" },
      ] },
      { id: "right", size: { px: 280 }, hidden: Boolean(o.focus) },
    ] },
    { id: "keyset", size: { px: 32 } },
  ] });
  assert.equal(findNode(tree(), "route").size.px, 260);
  assert.equal(findNode(tree(), "nope"), null);
  assert.deepEqual(keysetPad(tree()), { left: 260, right: 280 });
  // FOCUS: the route narrowed to its squares, the right column hidden
  assert.deepEqual(keysetPad(tree({ route: 56, focus: true })), { left: 56, right: 0 });
  // the map replaces the route and the terminal: center under the map
  assert.deepEqual(keysetPad(tree({ active: "map-view" })), { left: 0, right: 280 });
  assert.deepEqual(keysetPad(null), { left: 0, right: 0 });
});

test("focusCommands hides the right column and narrows the route, or undoes both", () => {
  assert.deepEqual(focusCommands(false), [["layout.hide", { id: "right" }], ["layout.resize", { id: "route", px: ROUTE_SLIM_PX }]]);
  assert.deepEqual(focusCommands(true), [["layout.show", { id: "right" }], ["layout.resize", { id: "route", px: ROUTE_PX }]]);
});

test("pageFor signals a blocked agent only in focus mode, never the one you are on", () => {
  const a = [
    { address: "t1", pane: "p1", status: "blocked", space_name: "meridian" },
    { address: "t2", pane: "p2", status: "working", space_name: "compass" },
    { address: "t3", pane: "p3", status: "blocked", space_name: "harbor" },
  ];
  const all = [
    { pane: "p1", code: "f1", spaceName: "meridian", label: "docs" },
    { pane: "p3", code: "d2", spaceName: "harbor", label: "schema" },
  ];
  assert.equal(pageFor(a, "t2", false, all), null);
  assert.deepEqual(pageFor(a, "t2", true, all), { address: "t1", text: "f1 meridian · docs needs you", more: 1 });
  assert.deepEqual(pageFor(a, "t1", true, all), { address: "t3", text: "d2 harbor · schema needs you", more: 0 });
  assert.equal(pageFor([a[1]], "t9", true, all), null);
  // the one that has waited longest comes first, as for NEXT1, whatever the list order
  const later = [{ ...a[0], seq: 9 }, { ...a[2], seq: 3 }];
  assert.equal(pageFor(later, "t2", true, all).address, "t3");
  // a pane the line does not know yet: the space name alone
  assert.deepEqual(pageFor([a[0]], "t9", true, []), { address: "t1", text: "meridian needs you", more: 0 });
});

// ---- HELP and CLOSE ----

test("helpScreens: KEYS with one short line each, then WORDS; no lesson or page", () => {
  const [keys, words] = helpScreens();
  assert.deepEqual([keys.name, words.name], ["KEYS", "WORDS"]);
  const names = keys.rows.map((r) => r[0]);
  for (const n of ["NEXT", "BACK", "NEXT1", "BACK1", "MAP", "JUMP", "ALL", "PICKER", "SIGN-ON", "SIGN-OFF", "CLOSE UP", "RENAME", "RENAME TAB", "LAB", "TERM", "GLOW", "FOCUS", "HELP", "CLOSE"]) assert.ok(names.includes(n), n);
  assert.ok(keys.rows.every((r) => r[2].length <= 50), "each key fits on one line");
  assert.match(keys.rows.find((r) => r[0] === "TERM")[2], /command palette/);
  assert.deepEqual(keys.rows.find((r) => r[0] === "PICKER")[1], { action: "mod.open:picker" });
  assert.deepEqual(keys.rows.find((r) => r[0] === "RENAME")[1], { action: "space.rename" });
  assert.deepEqual(words.rows.map((r) => r[0]), ["letter", "code", "free letter", "WAITING", "the route", "SIGNAL", "in the map", "JUMP"]);
  assert.ok(![...keys.rows, ...words.rows].some((r) => /lesson|page/i.test(r[2])));
});

test("helpKey: → and Enter go on, ← back, a number straight there, Esc closes", () => {
  assert.deepEqual(helpKey(0, "right", 2), { i: 1 });
  assert.deepEqual(helpKey(0, "enter", 2), { i: 1 });
  assert.deepEqual(helpKey(1, "right", 2), { i: 1 }); // stays on the last
  assert.deepEqual(helpKey(1, "left", 2), { i: 0 });
  assert.deepEqual(helpKey(0, "left", 2), { i: 0 });
  assert.deepEqual(helpKey(0, "2", 2), { i: 1 });
  assert.equal(helpKey(0, "3", 2), null);
  assert.deepEqual(helpKey(1, "escape", 2), { close: true });
  assert.equal(helpKey(0, "x", 2), null);
});

test("dialogAction closes a live dialog, and opens a new one over a stale record", () => {
  assert.deepEqual(dialogAction("ov7", 9000, 10000), { close: "ov7" });
  assert.deepEqual(dialogAction("ov7", 1000, 10000), { open: true }); // closed without a word
  assert.deepEqual(dialogAction("ov7", null, 10000), { open: true });
  assert.deepEqual(dialogAction(null, 9000, 10000), { open: true });
});

test("closeAction closes live PLATO dialogs first, else the tab, even over a stale record", () => {
  assert.deepEqual(closeAction([{ name: "help", id: "o9", aliveAt: 9000 }], 10000), { close: [["help", "o9"]] });
  assert.deepEqual(closeAction([{ name: "help", id: "o9", aliveAt: 1000 }], 10000), { tab: true });
  assert.deepEqual(closeAction([{ name: "help", id: null, aliveAt: null }], 10000), { tab: true });
  assert.deepEqual(closeAction(undefined, 10000), { tab: true });
});
