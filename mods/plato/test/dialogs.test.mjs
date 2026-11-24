// Every PLATO dialog follows the same two rules, so a new one cannot bring back the double
// moves: the cmd-enter chords are layout keys (NEXT, BACK, NEXT1, BACK1), which the route
// handles or hands over, so a dialog never acts on Enter with cmd held; and each dialog reports
// alive (keys.js alive()), so the route knows it is open even after Herdr closes it on Esc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../", import.meta.url);
const DIALOGS = ["signpage", "lookpage", "jumppage", "help", "menu", "keyspage"];

test("dialogs: the list holds every role drawn as a dialog or popup with its own keys", () => {
  // A role with a focus handle of its own and an Enter key is a dialog; add new ones above.
  const roles = readdirSync(DIR).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).filter((name) => {
    const src = readFileSync(new URL(`${name}.js`, DIR), "utf8");
    return /track_focus/.test(src) && /"enter"/.test(src) && name !== "route";
  });
  assert.deepEqual(roles.filter((r) => !DIALOGS.includes(r)), []);
});

for (const name of DIALOGS) {
  const src = readFileSync(new URL(`${name}.js`, DIR), "utf8");
  test(`dialogs: ${name}.js never acts on Enter with cmd held`, () => {
    for (const line of src.split("\n").filter((l) => /if \(e\.key === "enter"/.test(l))) {
      assert.match(line, /ownEnter\(|enterKey\(/, `Enter without ownEnter(): ${line.trim()}`);
    }
    if (name === "help") assert.match(src, /if \(!ownEnter\(e\.modifiers\)\) return;/, "HELP passes cmd chords on before helpKey");
  });
  test(`dialogs: ${name}.js reports alive`, () => {
    assert.match(src, /alive\("\w+", cx\)/);
  });
}

test("dialogs: a left or right click beside the keys panel closes it, and a press on the panel never drags it", () => {
  const src = readFileSync(new URL("keyspage.js", DIR), "utf8");
  for (const button of ["left", "right"]) {
    assert.match(src, new RegExp(`on_mouse_down\\("${button}", \\(_e, cx\\) => \\{ cx\\.stop_propagation\\(\\); this\\.giveBack\\(\\); \\}\\)`), `a ${button} click beside the panel`);
    assert.match(src, new RegExp(`on_mouse_down\\("${button}", \\(_e, cx\\) => cx\\.stop_propagation\\(\\)\\)`), `a ${button} press on the panel`);
  }
});
