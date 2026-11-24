// The plato mod's layers, and which may import which. Roles never import each other: they
// talk through plato.* commands (commands.js) and shared state (shared.js). A new file must
// be added to LAYERS, which decides what it may import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../", import.meta.url);

/** Each file's layer. A helper belongs to one role and may be imported only by it. */
const LAYERS = {
  // Pure logic: no Herdr or GPUI, so Node can test it. Imports only other pure files.
  line: "pure", agenda: "pure", overview: "pure", day: "pure", sign: "pure", glow: "pure", logic: "pure", commands: "pure", shared: "pure", leader: "pure", stripdata: "pure",
  // The drawing kit: colors and boxes.
  look: "kit",
  // Actions that more than one role runs: dialogs, the keys, the viewer pane, LOOK's card.
  keys: "actions", lookdata: "actions",
  // One file per role (main.js's ROLES).
  banner: "role", files: "role", help: "role", keyset: "role", nowat: "role", route: "role",
  signals: "role", signpage: "role", strip: "role", timetable: "role", viewer: "role", menu: "role", lookpage: "role", jumppage: "role", keyspage: "role",
  // A role's own helpers.
  agendaview: "helper:route", agendaweek: "helper:route", recorder: "helper:banner",
  main: "main",
};

/** What each layer may import, besides Herdr and GPUI (which pure files may not import). */
const MAY = {
  pure: ["pure"],
  kit: ["pure"],
  actions: ["pure", "kit"],
  role: ["pure", "kit", "actions"],
  helper: ["pure", "kit", "actions"],
  main: ["pure", "kit", "role"],
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();

function imports(name) {
  const src = readFileSync(new URL(`${name}.js`, DIR), "utf8");
  return [...src.matchAll(/^(?:import|export)\b[^;]*?\bfrom "([^"]+)";/gms)].map(([, from]) => from);
}

test("layers: every file in the mod has a layer, and every layer entry is a file", () => {
  assert.deepEqual(files.filter((f) => !LAYERS[f]), [], "add these files to LAYERS in test/layers.test.mjs");
  assert.deepEqual(Object.keys(LAYERS).filter((f) => !files.includes(f)), [], "these LAYERS entries have no file");
});

for (const name of files) {
  const layer = LAYERS[name];
  if (!layer) continue;
  test(`layers: ${name}.js (${layer}) imports only what its layer may`, () => {
    const [kind, owner] = layer.split(":");
    for (const from of imports(name)) {
      if (!from.startsWith("./")) {
        assert.notEqual(kind, "pure", `${name}.js is pure logic but imports "${from}"`);
        continue;
      }
      const target = from.slice(2).replace(/\.js$/, "");
      const [tKind, tOwner] = (LAYERS[target] ?? "unknown").split(":");
      if (tKind === "helper") {
        assert.equal(name, tOwner, `${name}.js imports ${target}.js, a helper of ${tOwner}.js`);
        continue;
      }
      assert.ok(MAY[kind].includes(tKind), `${name}.js (${kind}) may not import ${target}.js (${tKind})`);
      if (kind === "role" || kind === "helper") assert.notEqual(tKind, "role", `${name}.js imports the role ${target}.js`);
      if (owner) assert.notEqual(target, owner, `${name}.js is a helper of ${owner}.js and may not import it back`);
    }
  });
}
