import { test } from "node:test";
import assert from "node:assert/strict";
import { signOnTarget, folderCandidates, shortPath, wrapPath, parseDue, dueWords, signOffPlan, landing, editLine, closeUpPlan } from "../sign.js";

const NOW = new Date(2026, 10, 19, 15, 44).getTime(); // Thu 19 Nov 2026, local time
const L = (...pairs) => ({ version: 1, slots: pairs.map(([letter, space]) => ({ letter, space })) });

test("signOnTarget: a plain space name, or a folder whose last part names the space", () => {
  assert.deepEqual(signOnTarget("  herdr-docs ", "/Users/me"), { name: "herdr-docs", path: null });
  assert.deepEqual(signOnTarget("~/dev/herdr-docs/", "/Users/me"), { name: "herdr-docs", path: "/Users/me/dev/herdr-docs" });
  assert.deepEqual(signOnTarget("/tmp/x/plato-line-test-1", "/Users/me"), { name: "plato-line-test-1", path: "/tmp/x/plato-line-test-1" });
  assert.deepEqual(signOnTarget("/var/T//scratch/x", "/Users/me"), { name: "x", path: "/var/T/scratch/x" });
  assert.deepEqual(signOnTarget("", "/Users/me"), { name: "", path: null });
});

test("folderCandidates: beside the open spaces' folders first, then home; no built-in folders", () => {
  assert.deepEqual(folderCandidates("docs", "/h", ["/h/work/repos/a", "/h/work/repos/b", "", "/h/work"]), [
    "/h/work/repos/docs", "/h/docs",
  ]);
  assert.deepEqual(folderCandidates("docs", "/h", []), ["/h/docs"]);
  assert.deepEqual(folderCandidates("", "/h", []), []);
  assert.deepEqual(folderCandidates("a/b", "/h", []), []);
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

test("shortPath: whole when it fits, else the start and as many last parts as fit", () => {
  assert.equal(shortPath("~/code/dune", 40), "~/code/dune");
  assert.equal(shortPath("~/work/repos/github.com/acme/dune", 24), "~/…/github.com/acme/dune");
  assert.equal(shortPath("~/work/repos/github.com/acme/dune", 12), "~/…/dune");
  assert.equal(shortPath("/srv/projects/teams/acme/dune", 16), "/…/acme/dune");
  assert.equal(shortPath("", 10), "");
  // a folder name longer than max still shows whole
  assert.equal(shortPath("~/a/a-very-long-folder-name", 10), "~/…/a-very-long-folder-name");
});

test("wrapPath: a break chance after each / and nothing else changed", () => {
  assert.equal(wrapPath("~/a/b"), "~/\u200ba/\u200bb");
  assert.equal(wrapPath("~/a/b").replace(/\u200b/g, ""), "~/a/b");
  assert.equal(wrapPath(""), "");
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
