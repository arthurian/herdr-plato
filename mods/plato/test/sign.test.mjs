import { test } from "node:test";
import assert from "node:assert/strict";
import { signOnTarget, folderPath, tildePath, shortPath, parseDue, dueWords, signOffPlan, landing, editLine, closeUpPlan, purposeArgs, dueCommand, parseDueCommand, enterKey } from "../sign.js";

const NOW = new Date(2026, 10, 19, 15, 44).getTime(); // Thu 19 Nov 2026, local time
const L = (...pairs) => ({ version: 1, slots: pairs.map(([letter, space]) => ({ letter, space })) });

test("signOnTarget: a plain space name, or a folder whose last part names the space", () => {
  assert.deepEqual(signOnTarget("  herdr-docs ", "/Users/me"), { name: "herdr-docs", path: null });
  assert.deepEqual(signOnTarget("~/dev/herdr-docs/", "/Users/me"), { name: "herdr-docs", path: "/Users/me/dev/herdr-docs" });
  assert.deepEqual(signOnTarget("/tmp/x/plato-line-test-1", "/Users/me"), { name: "plato-line-test-1", path: "/tmp/x/plato-line-test-1" });
  assert.deepEqual(signOnTarget("/var/T//scratch/x", "/Users/me"), { name: "x", path: "/var/T/scratch/x" });
  assert.deepEqual(signOnTarget("", "/Users/me"), { name: "", path: null });
});

test("tildePath: the home folder as ~, only at a / boundary", () => {
  assert.equal(tildePath("/Users/al/x", "/Users/al"), "~/x");
  assert.equal(tildePath("/Users/al", "/Users/al"), "~");
  assert.equal(tildePath("/Users/alice/x", "/Users/al"), "/Users/alice/x");
  assert.equal(tildePath("/tmp/x", "/Users/al"), "/tmp/x");
});

test("shortPath: whole when it fits, else the start and as many last parts as fit", () => {
  assert.equal(shortPath("~/code/dune", 40), "~/code/dune");
  assert.equal(shortPath("~/work/repos/github.com/acme/dune", 24), "~/…/github.com/acme/dune");
  assert.equal(shortPath("~/work/repos/github.com/acme/dune", 12), "~/…/dune");
  assert.equal(shortPath("/srv/projects/teams/acme/dune", 16), "/…/acme/dune");
  assert.equal(shortPath("", 10), "");
  // a folder name longer than max still shows whole
  assert.equal(shortPath("~/a/a-very-long-folder-name", 10), "~/…/a-very-long-folder-name");
});

test("folderPath: blank, home, absolute and relative paths", () => {
  assert.equal(folderPath("", "/Users/me"), null);
  assert.equal(folderPath("   ", "/Users/me"), null);
  assert.equal(folderPath("~", "/Users/me"), "/Users/me");
  assert.equal(folderPath("~/dev/x/", "/Users/me"), "/Users/me/dev/x");
  assert.equal(folderPath("/var/T//scratch/x", "/Users/me"), "/var/T/scratch/x");
  assert.equal(folderPath("/", "/Users/me"), "/");
  assert.equal(folderPath("dev/herdr docs", "/Users/me"), "/Users/me/dev/herdr docs");
});

test("parseDue: blank is no date; ISO, month/day, day of month, weekday and +days", () => {
  assert.deepEqual(parseDue("", NOW), { due: null });
  assert.deepEqual(parseDue("2026-11-27", NOW), { due: "2026-11-27" });
  assert.deepEqual(parseDue("11/27", NOW), { due: "2026-11-27" });
  assert.deepEqual(parseDue("1-5", NOW), { due: "2027-01-05" });
  assert.deepEqual(parseDue("27", NOW), { due: "2026-11-27" });
  assert.deepEqual(parseDue("3", NOW), { due: "2026-12-03" });
  assert.deepEqual(parseDue("fri", NOW), { due: "2026-11-20" });
  assert.deepEqual(parseDue("Thursday", NOW), { due: "2026-11-26" });
  assert.deepEqual(parseDue("Fri 27", NOW), { due: "2026-11-27" });
  assert.deepEqual(parseDue("+5", NOW), { due: "2026-11-24" });
  assert.equal(parseDue("2026-02-30", NOW).error, "no such date");
  assert.ok(parseDue("soon", NOW).error);
});

test("dueWords: the date and how far off it is", () => {
  assert.equal(dueWords(null, NOW), "");
  assert.equal(dueWords("2026-11-27", NOW), "Fri 27 Nov · 8 days");
  assert.equal(dueWords("2026-11-19", NOW), "Thu 19 Nov · today");
  assert.equal(dueWords("2026-11-20", NOW), "Fri 20 Nov · tomorrow");
  assert.equal(dueWords("2026-11-16", NOW), "Mon 16 Nov · 3 days ago");
});

test("signOffPlan: the last space comes off with the free slots before it", () => {
  const p = signOffPlan(L(["a", "s1"], ["b", "s2"], ["c", "s3"], ["d", null], ["e", "s5"]), "s5");
  assert.deepEqual(p, { letter: "e", middle: false, comesOff: ["d", "e"], leaves: "a–c", moves: [] });
});

test("signOffPlan: a middle space leaves a free slot; U would move the later ones up", () => {
  const p = signOffPlan(L(["a", "s1"], ["b", "s2"], ["c", "s3"], ["d", "s4"], ["e", "s5"]), "s3");
  assert.equal(p.middle, true);
  assert.deepEqual(p.comesOff, []);
  assert.equal(p.leaves, "a–e");
  assert.deepEqual(p.moves, [["d", "c"], ["e", "d"]]);
});

test("signOffPlan: closing up also drops older free slots", () => {
  const p = signOffPlan(L(["a", "s1"], ["b", null], ["c", "s3"], ["d", "s4"]), "s3");
  assert.deepEqual(p.moves, [["d", "b"]]);
});

test("signOffPlan: the only space leaves an empty line; an unknown space has no plan", () => {
  assert.deepEqual(signOffPlan(L(["a", "s1"]), "s1"), { letter: "a", middle: false, comesOff: ["a"], leaves: null, moves: [] });
  assert.equal(signOffPlan(L(["a", "s1"]), "s9"), null);
});

test("landing: the first stop of the next space, wrapping; null when alone", () => {
  const list = [
    { space: "s1", code: "a1" }, { space: "s2", code: "b1" }, { space: "s2", code: "b2" }, { space: "s3", code: "c1" },
  ];
  assert.equal(landing(list, "s2").code, "c1");
  assert.equal(landing(list, "s3").code, "a1");
  assert.equal(landing([{ space: "s1", code: "a1" }], "s1"), null);
});

test("editLine: typing, moving and deleting on the name line", () => {
  let s = { text: "", cursor: 0 };
  for (const ch of "docs") s = editLine(s, { key: ch, char: ch });
  assert.deepEqual(s, { text: "docs", cursor: 4 });
  s = editLine(s, { key: "left" });
  s = editLine(s, { key: "backspace" });
  assert.deepEqual(s, { text: "dos", cursor: 2 });
  assert.deepEqual(editLine(s, { key: "u", mods: { control: true } }), { text: "s", cursor: 0 });
  assert.equal(editLine(s, { key: "enter" }), null);
});

test("closeUpPlan: the free letters that come off, and each later space's move with its name", () => {
  const line = { version: 1, slots: [
    { letter: "a", space: "s1", name: "atlas" }, { letter: "b", space: null }, { letter: "c", space: "s3", name: "orbit" },
    { letter: "d", space: null }, { letter: "e", space: "s5", name: "quarry" },
  ] };
  assert.deepEqual(closeUpPlan(line), { free: ["b", "d"], moves: [["c", "b", "orbit"], ["e", "c", "quarry"]] });
});

test("closeUpPlan: nothing to do on a line with no free letters, or none at all", () => {
  assert.deepEqual(closeUpPlan(L(["a", "s1"], ["b", "s2"])), { free: [], moves: [] });
  assert.deepEqual(closeUpPlan(null), { free: [], moves: [] });
});

test("purposeArgs: hc label for your purpose, on one line; blank clears it", () => {
  assert.deepEqual(purposeArgs("t3v", "  Ship the\nv2 API "), ["label", "t3v", "plato.purpose_yours=Ship the v2 API"]);
  assert.deepEqual(purposeArgs("t3v", "   "), ["label", "t3v", "plato.purpose_yours="]);
  assert.deepEqual(purposeArgs("t3v", null), ["label", "t3v", "plato.purpose_yours="]);
});

test("dueCommand and parseDueCommand: SET DUE's request to the route, a date or none", () => {
  assert.equal(dueCommand("c", "2026-11-27"), "due:c=2026-11-27");
  assert.equal(dueCommand("c", null), "due:c=");
  assert.deepEqual(parseDueCommand("due:c=2026-11-27"), { letter: "c", due: "2026-11-27" });
  assert.deepEqual(parseDueCommand("due:c="), { letter: "c", due: null });
  assert.equal(parseDueCommand("due"), null);
  assert.equal(parseDueCommand("due:c=friday"), null, "only an ISO date or blank");
  assert.equal(parseDueCommand("due:C=2026-11-27"), null);
});

test("enterKey: Enter in a sign dialog; with cmd held it is a layout key, which the route hands over", () => {
  assert.equal(enterKey({}), "next");
  assert.equal(enterKey({ alt: true }), "back");
  assert.equal(enterKey({ control: true }), "next1");
  // cmd-shift-enter is BACK in keys.json: the route passes it to the open dialog. Acting on it
  // here too closed the dialog, and then the route, seeing no dialog, moved to another tab.
  assert.equal(enterKey({ platform: true, alt: true }), null);
  assert.equal(enterKey({ platform: true }), null);
  assert.equal(enterKey({ platform: true, shift: true }), null);
});
