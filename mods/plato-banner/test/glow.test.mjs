import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOWS, nextGlow, glowWord } from "../glow.js";
test("the glow cycle names the six themes in order", () => {
  assert.deepEqual(GLOWS.map(([, name]) => name), ["plato", "plato-amber", "plato-green", "plato-white", "plato-nord", "plato-mocha"]);
});

test("nextGlow steps orange, amber, green, white, nord, mocha, then orange", () => {
  assert.equal(nextGlow("#ff8a1f"), "plato-amber");
  assert.equal(nextGlow("#FFB000"), "plato-green");
  assert.equal(nextGlow("#4fd06a"), "plato-white");
  assert.equal(nextGlow("#dcdcd2"), "plato-nord");
  assert.equal(nextGlow("#88c0d0"), "plato-mocha");
  assert.equal(nextGlow("#cba6f7"), "plato");
  assert.equal(nextGlow("#123456"), "plato-amber");
});

test("glowWord names the glow from its accent color", () => {
  assert.equal(glowWord("#ff8a1f"), "orange");
  assert.equal(glowWord("#FFB000"), "amber");
  assert.equal(glowWord("#4fd06a"), "green");
  assert.equal(glowWord("#dcdcd2"), "white");
  assert.equal(glowWord("#88C0D0"), "nord");
  assert.equal(glowWord("#cba6f7"), "mocha");
  assert.equal(glowWord("#123456"), "");
});
