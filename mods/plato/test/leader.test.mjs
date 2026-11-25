import { test } from "node:test";
import assert from "node:assert/strict";
import { LEADER, PANEL_MS, leaderKey, leaderGroups, chordOf } from "../leader.js";
import { commandFor, ownerOf } from "../commands.js";

const runs = (r) => r?.run?.cmd ?? r?.run?.action;

test("leader: letters", () => {
  assert.equal(runs(leaderKey("d", {})), "due");
  assert.equal(runs(leaderKey("j", {})), "jump");
  assert.equal(runs(leaderKey("s", {})), "signon");
  assert.equal(runs(leaderKey("z", {})), "pane.zoom");
  assert.equal(runs(leaderKey("r", {})), "review");
  assert.equal(runs(leaderKey("R", {})), "renametab");
  assert.equal(runs(leaderKey("h", {})), "help");
  assert.equal(PANEL_MS, 500);
});

test("leader: shift keys", () => {
  assert.equal(runs(leaderKey("n", { shift: true })), "next1");
  assert.equal(runs(leaderKey("N", {})), "next1");
  assert.equal(runs(leaderKey("p", { shift: true })), "back1");
  assert.equal(runs(leaderKey("n", {})), "next");
  assert.equal(runs(leaderKey("p", {})), "back");
  assert.equal(runs(leaderKey("o", {})), "folder");
  assert.deepEqual(leaderKey("q", {}), { undefined: "q" });
  assert.equal(runs(leaderKey("/", { shift: true })), "help");
  assert.equal(runs(leaderKey("?", {})), "help");
  assert.equal(runs(leaderKey("?", { shift: true })), "help");
});

test("leader: cancel", () => {
  assert.deepEqual(leaderKey("escape", {}), { cancel: true });
  assert.deepEqual(leaderKey("g", { control: true }), { cancel: true });
});

test("leader: undefined", () => {
  assert.deepEqual(leaderKey("q", {}), { undefined: "q" });
  assert.deepEqual(leaderKey("b", {}), { undefined: "b" });
  assert.deepEqual(leaderKey("d", { shift: true }), { undefined: "D" });
  assert.deepEqual(leaderKey("d", { control: true }), { undefined: "⌃D" });
});

test("leader: held ⌘", () => {
  assert.deepEqual(leaderKey("d", { platform: true }), { undefined: "⌘D" });
  assert.deepEqual(leaderKey("n", { platform: true }), { undefined: "⌘N" });
});

test("leader: modifier alone", () => {
  assert.equal(leaderKey("shift", { shift: true }), null);
  assert.equal(leaderKey("alt", { alt: true }), null);
  assert.equal(leaderKey("control", { control: true }), null);
});

test("leader: one row per key", () => {
  const seen = new Set();
  for (const r of LEADER) {
    for (const k of [r.key, r.also].filter(Boolean)) {
      assert.ok(!seen.has(k), `two rows take "${k}"`);
      seen.add(k);
    }
    if (r.cmd) assert.ok(r.cmd === "term" || ownerOf(commandFor(r.cmd).replace(/^plato\./, "")), `${r.name}: no role takes ${commandFor(r.cmd)}`);
    else if (!r.cancel) assert.match(r.action, /^[a-z]+\.[a-z_]+$/, `${r.name} has no command`);
  }
});

test("leader: the groups in the panel's order", () => {
  const g = leaderGroups();
  assert.deepEqual(g.map((x) => x.title), ["MOVE", "VIEW", "SPACE AND TAB", "MORE"]);
  assert.deepEqual(g[0].rows.map((r) => r.key), ["n", "p", "N", "P", "j"]);
  assert.deepEqual(g[2].rows.map((r) => r.key), ["s", "l", "e", "d", "k", "u", "R"]);
  assert.deepEqual(g[3].rows.map((r) => r.name), ["FOLDER", "TERM", "HELP", "CANCEL"]);
});

test("leader: a chord Herdr binds passes to Herdr, with no notice", () => {
  const bound = (c) => c === chordOf("d", { platform: true }) || c === chordOf("g", { platform: true, shift: true });
  assert.deepEqual(leaderKey("d", { platform: true }, bound), { pass: true });
  assert.deepEqual(leaderKey("g", { platform: true, shift: true }, bound), { pass: true });
  assert.deepEqual(leaderKey("q", { platform: true }, bound), { undefined: "⌘Q" });
  assert.deepEqual(leaderKey("g", { control: true }, bound), { cancel: true });
});

test("leader: chordOf reads keys.json chords and key events the same way", () => {
  assert.equal(chordOf("cmd-shift-g"), chordOf("g", { platform: true, shift: true }));
  assert.equal(chordOf("shift-cmd-g"), chordOf("cmd-shift-g"));
  assert.equal(chordOf("cmd-alt-w"), chordOf("w", { alt: true, platform: true }));
  assert.equal(chordOf("ctrl-g"), chordOf("g", { control: true }));
  assert.equal(chordOf("cmd--"), chordOf("-", { platform: true }));
  assert.notEqual(chordOf("cmd-k"), chordOf("k", {}));
});

test("leader: RENAME TAB goes to the route, which renames the tab you are at", () => {
  const r = leaderKey("R", {}).run;
  assert.equal(r.cmd, "renametab");
  assert.equal(commandFor("renametab"), "plato.rename-tab");
  assert.equal(ownerOf("rename-tab"), "route");
});

test("leader: r runs REVIEW, R runs RENAME TAB, and no two rows share a key", () => {
  assert.equal(LEADER.find((r) => r.key === "r").cmd, "review");
  assert.equal(LEADER.find((r) => r.key === "R").cmd, "renametab");
  const keys = LEADER.flatMap((r) => [r.key, r.also]).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length);
});
