// Shared state: every key is named once in shared.js, with the files that write and read it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as SHARED from "../shared.js";

const DIR = new URL("../", import.meta.url);
const { ACCESS } = SHARED;
const NAMES = Object.keys(SHARED).filter((n) => n !== "ACCESS");

/** A file's code without its comments, so a key named in a comment does not count. */
function code(name) {
  return readFileSync(new URL(`${name}.js`, DIR), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every shared() and setShared() call in the mod: { file, kind, arg }. arg is the
 *  identifier the call starts with, or null when it starts with anything else (a string). */
function calls() {
  const out = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".js") && f !== "shared.js")) {
    const file = f.slice(0, -3);
    for (const m of code(file).matchAll(/\b(setShared|shared)\(\s*([A-Za-z_$][\w$]*)?/g)) {
      out.push({ file, kind: m[1] === "setShared" ? "writers" : "readers", arg: m[2] ?? null });
    }
  }
  return out;
}

test("shared: every name in shared.js has its writers and readers in ACCESS, and every key is a distinct plato.* key", () => {
  assert.deepEqual(NAMES.filter((n) => !ACCESS[n]).sort(), [], "add these names to ACCESS");
  assert.deepEqual(Object.keys(ACCESS).filter((n) => !NAMES.includes(n)).sort(), [], "these ACCESS entries name nothing in shared.js");
  const keys = NAMES.map((n) => (typeof SHARED[n] === "function" ? SHARED[n]("x") : SHARED[n]));
  for (const k of keys) assert.match(k, /^plato\./);
  assert.equal(new Set(keys).size, keys.length, "two names give the same key");
});

test("shared: every shared() and setShared() call uses a name from shared.js, imported from there", () => {
  for (const { file, arg } of calls()) {
    assert.ok(arg && NAMES.includes(arg), `${file}.js: a shared call with a key not from shared.js (${arg ?? "a string"})`);
    assert.match(code(file), new RegExp(`import \\{[^}]*\\b${arg}\\b[^}]*\\} from "\\./shared\\.js"`), `${file}.js uses ${arg} without importing it from shared.js`);
  }
});

test("shared: only the listed files write or read each key", () => {
  for (const { file, kind, arg } of calls()) {
    if (!ACCESS[arg]) continue;
    assert.ok(ACCESS[arg][kind].includes(file), `${file}.js ${kind === "writers" ? "writes" : "reads"} ${arg}, but ACCESS does not list it`);
  }
});

test("shared: every file ACCESS lists really writes or reads that key", () => {
  const seen = new Set(calls().map(({ file, kind, arg }) => `${arg} ${kind} ${file}`));
  for (const [name, { writers, readers }] of Object.entries(ACCESS)) {
    for (const f of writers) assert.ok(seen.has(`${name} writers ${f}`), `ACCESS says ${f}.js writes ${name}, but it does not`);
    for (const f of readers) assert.ok(seen.has(`${name} readers ${f}`), `ACCESS says ${f}.js reads ${name}, but it does not`);
  }
});
