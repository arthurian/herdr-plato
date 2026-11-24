import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLOWS, nextGlow, glowWord } from "../glow.js";
test("the glow cycle names the eight themes in order: modern first, then classic", () => {
  assert.deepEqual(GLOWS.map(([, name]) => name), ["plato-tokyo", "plato-kanagawa", "plato-mocha", "plato-nord", "plato", "plato-amber", "plato-green", "plato-white"]);
});

test("the layout's default theme is the first glow", () => {
  const layout = JSON.parse(readFileSync(new URL("../../../layouts/plato.json", import.meta.url), "utf8"));
  assert.equal(layout.theme, GLOWS[0][1]);
});

test("nextGlow steps tokyo, kanagawa, mocha, nord, orange, amber, green, white, then tokyo", () => {
  assert.equal(nextGlow("#7aa2f7"), "plato-kanagawa");
  assert.equal(nextGlow("#DCD7BA"), "plato-mocha");
  assert.equal(nextGlow("#cba6f7"), "plato-nord");
  assert.equal(nextGlow("#88c0d0"), "plato");
  assert.equal(nextGlow("#ff8a1f"), "plato-amber");
  assert.equal(nextGlow("#FFB000"), "plato-green");
  assert.equal(nextGlow("#4fd06a"), "plato-white");
  assert.equal(nextGlow("#dcdcd2"), "plato-tokyo");
  assert.equal(nextGlow("#123456"), "plato-kanagawa");
});

test("glowWord names the glow from its accent color", () => {
  assert.equal(glowWord("#ff8a1f"), "orange");
  assert.equal(glowWord("#FFB000"), "amber");
  assert.equal(glowWord("#4fd06a"), "green");
  assert.equal(glowWord("#dcdcd2"), "white");
  assert.equal(glowWord("#88C0D0"), "nord");
  assert.equal(glowWord("#cba6f7"), "mocha");
  assert.equal(glowWord("#7aa2f7"), "tokyo");
  assert.equal(glowWord("#dcd7ba"), "kanagawa");
  assert.equal(glowWord("#123456"), "");
});
