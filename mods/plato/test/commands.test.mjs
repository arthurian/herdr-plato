import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMANDS, commandName, ownerOf, commandFor } from "../commands.js";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

/** main.js's roles: role name → its file, from the imports and the ROLES table. */
function roleFiles() {
  const main = read("../main.js");
  const files = Object.fromEntries([...main.matchAll(/^import (\w+) from "\.\/([\w-]+\.js)";$/gm)].map(([, cls, f]) => [cls, f]));
  const table = main.match(/const ROLES = \{([^}]*)\}/)[1];
  return Object.fromEntries([...table.matchAll(/(\w+): (\w+)/g)].map(([, role, cls]) => [role, files[cls]]));
}

test("commands: no command belongs to two roles", () => {
  const seen = {};
  for (const [role, names] of Object.entries(COMMANDS)) {
    for (const n of names) {
      assert.equal(seen[n], undefined, `"${n}" belongs to both ${seen[n]} and ${role}`);
      seen[n] = role;
    }
  }
});

test("commands: each role that owns commands has a command method, and each role with one owns commands", () => {
  const files = roleFiles();
  for (const role of Object.keys(COMMANDS)) {
    assert.ok(files[role], `${role} is not in main.js's ROLES`);
    assert.match(read(`../${files[role]}`), /^ {2}command\(c/m, `${role} (${files[role]}) has no command(c) method`);
  }
  for (const [role, file] of Object.entries(files)) {
    if (/^ {2}command\(c/m.test(read(`../${file}`))) assert.ok(COMMANDS[role], `${role} (${file}) has a command method but owns no commands in commands.js`);
  }
});

test("commands: every plato.* binding in keys.json has a role", () => {
  const keys = JSON.parse(read("../../../keys.json"))["layout:plato"];
  for (const [chord, action] of Object.entries(keys)) {
    if (!action.startsWith("plato.")) continue;
    assert.ok(ownerOf(action.slice("plato.".length)), `${chord} runs ${action}, which no role takes`);
  }
});

test("commands: cmd-k opens the keys panel", () => {
  assert.equal(JSON.parse(read("../../../keys.json"))["layout:plato"]["cmd-k"], "plato.keys");
});

test("commands: every PLATO key (the keyset and HELP) runs a command a role takes", () => {
  const cmds = new Set([...`${read("../keys.js")}\n${read("../logic.js")}`.matchAll(/cmd: "([\w-]+)"/g)].map(([, c]) => c));
  assert.ok(cmds.size > 10);
  for (const cmd of cmds) {
    const action = commandFor(cmd);
    if (action === "app.palette") continue;
    assert.ok(ownerOf(action.slice("plato.".length)), `the key ${cmd} runs ${action}, which no role takes`);
  }
});

test("commandName and ownerOf: the text after : or a space is not part of the name", () => {
  assert.equal(commandName("sign-on:<path>"), "sign-on");
  assert.equal(commandName("sign-on /tmp/x"), "sign-on");
  assert.equal(ownerOf("help:words"), "keyset");
  assert.equal(ownerOf("sign-on:/tmp/x"), "route");
  assert.equal(ownerOf("glow"), "banner");
  assert.equal(ownerOf("keys"), "keyset");
  assert.equal(ownerOf("go:t3v"), "route");
  assert.equal(ownerOf("nope"), null);
});

test("commands: review is the route's command, paper is gone", () => {
  assert.equal(ownerOf("paper"), null);
  assert.equal(ownerOf("review"), "route");
  assert.equal(ownerOf("review:2026-11-20 comments"), "route");
  assert.equal(commandFor("review"), "plato.review");
});
