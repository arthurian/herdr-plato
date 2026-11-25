// route.js imports Herdr, so Node cannot run it; this checks its source instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../route.js", import.meta.url), "utf8");

test("route: no agenda code is left", () => {
  assert.doesNotMatch(src, /agendaMode/);
  assert.doesNotMatch(src, /agendaview|agendaweek|\.\/agenda\.js/);
  assert.doesNotMatch(src, /agenda(At|Cursor|Go|SignOn|Look|Frame)\b|\bclaim\(|showCascade|readDay/);
});
