// route.js imports Herdr, so Node cannot run it; this checks its source instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../route.js", import.meta.url), "utf8");

test("route: the agenda's cursor is read only through agendaAt(), which makes the cursor before reading the columns", () => {
  // cursorAt(this.columns ?? [], this.agendaCursor()) reads the columns first, so before the agenda
  // has drawn since it opened it used the last open's columns: SIGN-OFF in the agenda got a
  // space that had since closed, and NEXT closed nothing.
  const body = src.match(/^ {2}agendaAt\(\) \{\n([\s\S]*?)\n {2}\}/m);
  assert.ok(body, "route.js has no agendaAt() method");
  assert.match(body[1], /const c = this\.agendaCursor\(\);\n\s*return cursorAt\(this\.columns \?\? \[\], c\);/);
  const outside = src.replace(body[0], "");
  assert.doesNotMatch(outside, /cursorAt\(this\.columns/, "use this.agendaAt() instead of cursorAt(this.columns, …)");
});

test("route: the agenda takes the keyboard back after SET PURPOSE or SET DUE closes over it", () => {
  // Both open over the agenda without folding it. With no way back, Esc left the keyboard
  // nowhere and the arrows did nothing until a click.
  const method = (name) => src.match(new RegExp(`^ {2}${name}\\([^)]*\\) \\{\\n([\\s\\S]*?)\\n {2}\\}`, "m"))?.[1] ?? "";
  for (const name of ["openPurpose", "openDue"]) assert.match(method(name), /if \(this\.agendaMode\) this\.signing = true;/, `${name} marks the agenda as away`);
  const claim = method("claim");
  assert.match(claim, /this\.looking \|\| this\.jumping \|\| this\.signing/);
  assert.match(claim, /this\.signDialog\(\)/, "claim waits while the sign dialog is open");
});
