import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGit, gitWords, stepWords, gitDue } from "../stripdata.js";

const OID = "2452e65abcdef0123456789abcdef0123456789a";

test("parseGit: a branch with changes", () => {
  const out = `# branch.oid ${OID}\n# branch.head feat/x\n# branch.upstream private/feat/x\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b strip.js\n? new.txt\n`;
  assert.deepEqual(parseGit(out), { head: "feat/x", oid: OID, ahead: 2, behind: 1, changed: 2 });
});

test("parseGit: no upstream", () => {
  const g = parseGit(`# branch.oid ${OID}\n# branch.head main\n`);
  assert.equal(g.ahead, 0);
  assert.equal(g.behind, 0);
  assert.equal(g.changed, 0);
});

test("parseGit: not a repo", () => {
  assert.equal(parseGit("fatal: not a git repository (or any of the parent directories): .git\n"), null);
  assert.equal(parseGit(""), null);
  assert.equal(parseGit(null), null);
});

test("parseGit: every kind of change counts once", () => {
  const out = `# branch.oid ${OID}\n# branch.head main\n1 M. N... x\n2 R. N... y\nu UU N... z\n? a.txt\n! ignored.log\n`;
  assert.equal(parseGit(out).changed, 4);
});

test("gitWords", () => {
  assert.deepEqual(gitWords("feat/x", { ahead: 2, behind: 0, changed: 3 }), { name: "⎇ feat/x", marks: "●3 ↑2" });
  assert.deepEqual(gitWords("feat/x", { ahead: 0, behind: 1, changed: 0 }), { name: "⎇ feat/x", marks: "↓1" });
  assert.deepEqual(gitWords("main", { ahead: 0, behind: 0, changed: 0 }), { name: "⎇ main", marks: "" });
  assert.deepEqual(gitWords(null, { head: "(detached)", oid: "2452e65abcdef", ahead: 0, behind: 0, changed: 0 }), { name: "⎇ 2452e65", marks: "" });
  assert.deepEqual(gitWords("main", null), { name: "⎇ main", marks: "" });
  assert.equal(gitWords(null, null), null);
});

const L = { "plato.step": "Bash: npm test", "plato.step_at": "1000", "plato.tasks": "3/7" };

test("stepWords: working shows only the progress", () => {
  assert.deepEqual(stepWords(L, "working"), { text: "", tasks: "3/7", dim: false });
  assert.equal(stepWords({ "plato.step": "Bash: npm test", "plato.step_at": "1000" }, "working"), null);
});

test("stepWords: needs you", () => {
  assert.deepEqual(stepWords(L, "blocked"), { text: "▸ asks: Bash: npm test", tasks: "3/7", dim: false });
});

test("stepWords: idle and done show only the progress, dim", () => {
  for (const s of ["idle", "done", null]) assert.deepEqual(stepWords(L, s), { text: "", tasks: "3/7", dim: true });
});

test("stepWords: an older turn", () => {
  assert.equal(stepWords({ ...L, "plato.last_at": "1001" }, "working"), null);
  assert.equal(stepWords({ ...L, "plato.last_at": "1000" }, "blocked").text, "▸ asks: Bash: npm test");
});

test("stepWords: no step", () => {
  assert.equal(stepWords({}, "working"), null);
  assert.equal(stepWords(null, "working"), null);
  assert.equal(stepWords({ "plato.step": "Read a.md", "plato.step_at": "1000" }, "blocked").tasks, "");
});

test("stepWords: any agent's words", () => {
  assert.equal(stepWords({ "plato.step": "reading the diff\nnow", "plato.step_at": "1000" }, "blocked").text, "▸ asks: reading the diff now");
  const long = "x".repeat(80);
  assert.equal(stepWords({ "plato.step": long, "plato.step_at": "1000" }, "blocked").text, `▸ asks: ${"x".repeat(60)}`);
});

test("stepWords: no plato.last_at", () => {
  assert.equal(stepWords({ "plato.step": "Read a.md", "plato.step_at": "1000" }, "blocked").text, "▸ asks: Read a.md");
});

test("stepWords: control characters never reach the strip", () => {
  const w = stepWords({ "plato.step": "Bash: echo \u001b[31m red\u0007", "plato.step_at": "1000", "plato.tasks": "3/7\u001b" }, "blocked");
  assert.doesNotMatch(w.text, /[\u0000-\u001f\u007f]/); // eslint-disable-line no-control-regex
  assert.equal(w.text, "▸ asks: Bash: echo [31m red");
  assert.equal(w.tasks, "3/7");
});

test("gitDue: when the strip reads git again", () => {
  const now = 100000;
  const idle = { busy: false, key: "a", at: now - 1000 };
  assert.equal(gitDue(idle, "a", now), false); // the same folder, read 1 s ago
  assert.equal(gitDue(idle, "b", now), true); // the folder or branch changed
  assert.equal(gitDue({ ...idle, at: now - 10000 }, "a", now), true); // 10 s passed
  assert.equal(gitDue({ busy: true, key: "a", at: now - 1000 }, "b", now), false); // one read at a time
  assert.equal(gitDue({ busy: true, key: "a", at: now - 15000 }, "a", now), true); // a read that never ended is given up
  assert.equal(gitDue(idle, null, now), false); // no folder
});
