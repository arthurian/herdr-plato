// The words PLATO shows: Herdr's nouns (space, tab, pane) for things, PLATO words for keys.
// These tests fail on a railway word in any string literal of a mod's code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { helpScreens } from "../logic.js";

const MODS = new URL("../../", import.meta.url);
const BANNED = /\b(stations?|platforms?|vacant|vacancy|vacancies|roundel|tracks?|yard|switchyard)\b/i;

// Source lines that hold internal tokens, not words a person reads. None are left.
const ALLOW = [];

/** Every string literal in JavaScript source, with its line: { line, text }. Comments are
 *  skipped. A template literal's own text is one literal, and the strings inside its
 *  ${...} parts are found too. */
export function literals(src) {
  const out = [];
  let i = 0, line = 1;
  const step = () => { if (src[i] === "\n") line++; i++; };
  function quoted(q) {
    const at = line; let text = ""; step();
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") { text += src[i]; step(); }
      text += src[i]; step();
    }
    step();
    out.push({ line: at, text });
  }
  function template() {
    const at = line; let text = ""; step();
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { text += src[i]; step(); text += src[i]; step(); continue; }
      if (src[i] === "$" && src[i + 1] === "{") { text += "${}"; step(); step(); code(1); continue; }
      text += src[i]; step();
    }
    step();
    out.push({ line: at, text });
  }
  function code(depth) {
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") step(); continue; }
      if (c === "/" && n === "*") { step(); step(); while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) step(); step(); step(); continue; }
      if (c === '"' || c === "'") { quoted(c); continue; }
      if (c === "`") { template(); continue; }
      if (c === "{") depth++;
      if (c === "}" && --depth === 0) { step(); return; }
      step();
    }
  }
  code(Infinity);
  return out;
}

/** The railway words in a mod's code, as "file:line: literal". */
function hits(mod) {
  const dir = new URL(`${mod}/`, MODS);
  const found = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    const src = readFileSync(new URL(f, dir), "utf8");
    const lines = src.split("\n");
    for (const { line, text } of literals(src)) {
      if (!BANNED.test(text)) continue;
      if (ALLOW.some((a) => lines[line - 1].includes(a))) continue;
      found.push(`${f}:${line}: ${text}`);
    }
  }
  return found;
}

const mods = readdirSync(MODS).filter((m) => existsSync(new URL(`${m}/mod.json`, MODS))).sort();

for (const mod of mods) {
  test(`words: ${mod}`, () => {
    const found = hits(mod);
    assert.deepEqual(found, [], `railway words in ${mod}:\n${found.join("\n")}`);
  });
}

// The code's own names: slot, stop, code, free, map, column and badge. A railway word
// anywhere in a mod's code fails, inside a camelCase name too. Names that come from
// Herdr or GPUI do not count.
const RAILWAY = /station|platform|vacan|roundel|track|yard/i;
const HERDR_NAMES = [/\b(m|mods|modifiers|e\.modifiers)\??\.platform\b/g, /platform: (true|false)/g, /track_focus/g, /track_scroll/g];

/** The railway words in a mod's code and tests, as "file:line: text". */
function names(mod) {
  const dir = new URL(`${mod}/`, MODS);
  const files = readdirSync(dir).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => f);
  if (existsSync(new URL("test/", dir))) {
    files.push(...readdirSync(new URL("test/", dir)).filter((f) => f.endsWith(".mjs") && f !== "words.test.mjs").map((f) => `test/${f}`));
  }
  const found = [];
  for (const f of files.sort()) {
    readFileSync(new URL(f, dir), "utf8").split("\n").forEach((text, i) => {
      const plain = HERDR_NAMES.reduce((t, re) => t.replace(re, ""), text);
      if (RAILWAY.test(plain)) found.push(`${f}:${i + 1}: ${text.trim()}`);
    });
  }
  return found;
}

for (const mod of mods) {
  test(`names: ${mod}`, () => {
    const found = names(mod);
    assert.deepEqual(found, [], `railway names in ${mod} (${found.length}):\n${found.join("\n")}`);
  });
}

test("words: HELP writes 'Space bar' for the key, so it reads apart from the noun space", () => {
  for (const screen of helpScreens()) {
    for (const [name, , text] of screen.rows) {
      if (/\bSpace\b/.test(text)) assert.match(text, /\bSpace bar\b/, `${screen.name} ${name}: ${text}`);
    }
  }
});
