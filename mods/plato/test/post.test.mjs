// plato-post (bin/plato-post), run with HERDR_APP_HOME set to a temporary folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../../bin/plato-post", import.meta.url));
const NOW = "1795498636";

/** Run the script with a fresh app home; its output, exit code, home and the files under posts/. */
function run(args, { input, env = { HC_TERMINAL_ID: "t8k" } } = {}) {
  const home = mkdtempSync(join(tmpdir(), "plato-post-"));
  return again(home, args, { input, env });
}

function again(home, args, { input, env = { HC_TERMINAL_ID: "t8k" } } = {}) {
  const r = spawnSync("sh", [SCRIPT, ...args], {
    input,
    env: { PATH: process.env.PATH, HERDR_APP_HOME: home, ...env },
    encoding: "utf8",
  });
  const posts = join(home, "plato-data", "posts");
  const files = existsSync(posts)
    ? readdirSync(posts).flatMap((d) => readdirSync(join(posts, d)).map((f) => join(posts, d, f)))
    : [];
  return { stdout: r.stdout, stderr: r.stderr, code: r.status, home, files };
}

const done = (r) => rmSync(r.home, { recursive: true, force: true });

test("post: a report is written with its header and printed path", () => {
  const r = run(["report", "Fixed the login bug."], { env: { HC_TERMINAL_ID: "t8k", PLATO_POST_NOW: NOW } });
  assert.equal(r.code, 0);
  assert.equal(r.files.length, 1);
  assert.equal(r.stdout, `${r.files[0]}\n`);
  assert.equal(basename(r.files[0]), `${NOW}-t8k-report.md`);
  assert.equal(readFileSync(r.files[0], "utf8"), `kind: report\nterminal: t8k\ntime: ${NOW}\n\nFixed the login bug.\n`);
  done(r);
});

test("post: text from standard input", () => {
  const r = run(["note"], { input: "Line one\nLine two" });
  assert.equal(r.code, 0);
  const body = readFileSync(r.files[0], "utf8").split("\n\n").slice(1).join("\n\n");
  assert.equal(body.trimEnd(), "Line one\nLine two");
  assert.match(basename(r.files[0]), /-t8k-note\.md$/);
  done(r);
});

test("post: two posts in the same second both land", () => {
  const env = { HC_TERMINAL_ID: "t8k", PLATO_POST_NOW: NOW };
  const a = run(["report", "One"], { env });
  const b = again(a.home, ["report", "Two"], { env });
  assert.equal(b.code, 0);
  assert.equal(b.files.length, 2);
  assert.deepEqual(b.files.map((f) => basename(f)).sort(), [`${NOW}-t8k-report-2.md`, `${NOW}-t8k-report.md`]);
  assert.match(readFileSync(b.stdout.trim(), "utf8"), /Two/);
  done(a);
});

test("post: text over the limit is refused", () => {
  const r = run(["report", "x".repeat(281)]);
  assert.equal(r.code, 1);
  assert.equal(r.files.length, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /280/);
  assert.equal(r.stderr.trim().split("\n").length, 1);
  done(r);
});

test("post: comment and note limits", () => {
  const a = run(["comment", "You " + "x".repeat(396)]);
  assert.equal(a.code, 0);
  const b = again(a.home, ["comment", "You " + "x".repeat(397)]);
  assert.equal(b.code, 1);
  assert.match(b.stderr, /400/);
  const c = again(a.home, ["note", "x".repeat(1500)]);
  assert.equal(c.code, 0);
  const d = again(a.home, ["note", "x".repeat(1501)]);
  assert.equal(d.code, 1);
  assert.match(d.stderr, /1500/);
  done(a);
});

test("post: an unknown kind is refused, and letter and editorial are gone", () => {
  const r = run(["memo", "hi"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /kind must be report, comment or note/);
  for (const k of ["letter", "editorial"]) assert.equal(again(r.home, [k, "hi"]).code, 1, k);
  assert.equal(r.files.length, 0);
  assert.notEqual(r.stderr, "");
  done(r);
});

test("post: empty or blank text is refused", () => {
  const a = run(["report", "   "]);
  assert.equal(a.code, 1);
  assert.equal(a.files.length, 0);
  const b = again(a.home, ["report"], { input: "\n \n" });
  assert.equal(b.code, 1);
  assert.equal(b.files.length, 0);
  done(a);
});

test("post: no terminal outside Herdr", () => {
  const r = run(["report", "Done."], { env: {} });
  assert.equal(r.code, 0);
  assert.match(basename(r.files[0]), /-none-report\.md$/);
  assert.match(readFileSync(r.files[0], "utf8"), /^kind: report\nterminal: none\n/);
  done(r);
});

test("post: --day files the post under that day", () => {
  const r = run(["report", "Done.", "--day", "2026-11-23"]);
  assert.equal(r.code, 0);
  assert.equal(basename(dirname(r.files[0])), "2026-11-23");
  const s = again(r.home, ["--day", "2026-11-22", "comment", "You said hi."]);
  assert.equal(basename(dirname(s.stdout.trim())), "2026-11-22");
  const bad = again(r.home, ["report", "x", "--day", "yesterday"]);
  assert.equal(bad.code, 1);
  done(r);
});

test("post: characters, not bytes, are counted", () => {
  const r = run(["report", "é".repeat(280)]);
  assert.equal(r.code, 0);
  const s = again(r.home, ["report", "é".repeat(281)]);
  assert.equal(s.code, 1);
  done(r);
});

test("post: --help lists the kinds and limits", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const w of ["report", "comment", "note", "280", "400", "1500"]) assert.ok(r.stdout.includes(w), w);
  assert.equal(r.files.length, 0);
  done(r);
});

test("post: one comment an hour from a terminal", () => {
  const at = (secs, term = "t8k") => ({ env: { HC_TERMINAL_ID: term, PLATO_POST_NOW: String(Number(NOW) + secs) } });
  const a = run(["comment", "You one"], at(0));
  assert.equal(a.code, 0);
  const b = again(a.home, ["comment", "You two"], at(12 * 60));
  assert.equal(b.code, 1);
  assert.equal(b.files.length, 1);
  assert.match(b.stderr, /one comment an hour: t8k sent one 0h12 ago, so the next can go in 0h48/);
  assert.equal(again(a.home, ["comment", "You other tab"], at(60, "t9z")).code, 0, "another terminal has its own limit");
  assert.equal(again(a.home, ["report", "Still fine"], at(120)).code, 0, "reports are not limited");
  assert.equal(again(a.home, ["comment", "You no tab"], at(180, "")).code, 0, "no terminal, no limit");
  assert.equal(again(a.home, ["comment", "You later"], at(3600)).code, 0, "an hour later");
  assert.equal(again(a.home, ["comment", "You too soon"], at(3600 + 1800)).code, 1);
  done(a);
});

test("post: a comment starts with You or Your", () => {
  const r = run(["comment", "The PR stack merges in order."]);
  assert.equal(r.code, 1);
  assert.equal(r.files.length, 0);
  assert.match(r.stderr, /a comment starts with "You" or "Your"/);
  for (const [term, text] of [["t1", "Your status file saved a search."], ["t2", "  You approved it twice."], ["t3", "You, again."]]) {
    assert.equal(again(r.home, ["comment", text], { env: { HC_TERMINAL_ID: term } }).code, 0, text);
  }
  for (const [term, text] of [["t4", "Youth is fine."], ["t5", "you approved it twice."], ["t6", "Yours is fine."]]) {
    assert.equal(again(r.home, ["comment", text], { env: { HC_TERMINAL_ID: term } }).code, 1, text);
  }
  for (const [term, text] of [["t7", "\n\tYou paused twice."], ["t8", "You'd approved it."], ["t9", "You\u2019re asked twice."], ["t10", "You\napproved it twice."]]) {
    assert.equal(again(r.home, ["comment", text], { env: { HC_TERMINAL_ID: term } }).code, 0, JSON.stringify(text));
  }
  const piped = again(r.home, ["comment"], { input: "\nYou approved it twice.\nA rule would stop it.\n", env: { HC_TERMINAL_ID: "t11" } });
  assert.equal(piped.code, 0, "multi-line text from standard input");
  assert.equal(again(r.home, ["comment"], { input: "The stack.\nYou merge it.\n", env: { HC_TERMINAL_ID: "t12" } }).code, 1, "only the start counts");
  assert.equal(again(r.home, ["report", "The PR stack merges in order."]).code, 0, "reports may start with anything");
  done(r);
});

test("post: the hour counts across days", () => {
  const a = run(["comment", "You late", "--day", "2026-11-23"], { env: { HC_TERMINAL_ID: "t8k", PLATO_POST_NOW: NOW } });
  const b = again(a.home, ["comment", "You early"], { env: { HC_TERMINAL_ID: "t8k", PLATO_POST_NOW: String(Number(NOW) + 1800) } });
  assert.equal(b.code, 1);
  done(a);
});
