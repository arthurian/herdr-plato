// The step hook (hooks/claude-plato-step.sh), run with a stand-in hc that writes its
// arguments to a file, one per line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../../../hooks/claude-plato-step.sh", import.meta.url));
const hasJq = spawnSync("sh", ["-c", "command -v jq"]).status === 0;

/** Run the hook with this input; the arguments hc got (null if it was not called) and the exit code. */
function run(input, env = { HC_TERMINAL_ID: "t1" }) {
  const dir = mkdtempSync(join(tmpdir(), "plato-hook-"));
  const out = join(dir, "args");
  writeFileSync(join(dir, "hc"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${out}"\n`);
  chmodSync(join(dir, "hc"), 0o755);
  const r = spawnSync("sh", [HOOK], { input: JSON.stringify(input), env: { PATH: `${dir}:${process.env.PATH}`, ...env } });
  const args = existsSync(out) ? readFileSync(out, "utf8").split("\n").slice(0, -1) : null;
  rmSync(dir, { recursive: true, force: true });
  return { args, code: r.status, stdout: String(r.stdout) };
}

const pre = (tool_name, tool_input) => ({ hook_event_name: "PreToolUse", tool_name, tool_input });
const stepOf = (args) => args.find((a) => a.startsWith("plato.step="));

test("step: Bash", { skip: !hasJq }, () => {
  const r = run(pre("Bash", { command: "npm test" }));
  assert.deepEqual(r.args.slice(0, 3), ["label", "t1", "plato.step=Bash: npm test"]);
  assert.match(r.args[3], /^plato\.step_at=\d+$/);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("step: a file tool", { skip: !hasJq }, () => {
  assert.equal(stepOf(run(pre("Edit", { file_path: "/a/b/route.js" })).args), "plato.step=Edit route.js");
  assert.equal(stepOf(run(pre("Read", { file_path: "/a/README.md" })).args), "plato.step=Read README.md");
});

test("step: search, web and agents", { skip: !hasJq }, () => {
  assert.equal(stepOf(run(pre("Grep", { pattern: "noticeLive" })).args), "plato.step=Grep noticeLive");
  assert.equal(stepOf(run(pre("WebFetch", { url: "https://example.com/a/b" })).args), "plato.step=WebFetch example.com");
  assert.equal(stepOf(run(pre("WebSearch", { query: "herdr docs" })).args), "plato.step=WebSearch herdr docs");
  assert.equal(stepOf(run(pre("Agent", { description: "Review the branch" })).args), "plato.step=Agent: Review the branch");
  assert.equal(stepOf(run(pre("TodoWrite", {})).args), "plato.step=TodoWrite");
});

test("step: MCP", { skip: !hasJq }, () => {
  assert.equal(stepOf(run(pre("mcp__claude_ai_Gmail__search", {})).args), "plato.step=search");
});

test("step: multi-line command", { skip: !hasJq }, () => {
  const s = stepOf(run(pre("Bash", { command: `echo 'a'\n\techo b ${"x".repeat(100)}` })).args);
  assert.equal(s, "plato.step=Bash: echo 'a'");
  assert.ok(s.length <= "plato.step=".length + 60);
  assert.doesNotMatch(s, /[\t\n]/);
  const long = stepOf(run(pre("Bash", { command: "y".repeat(100) })).args);
  assert.equal(long.length, "plato.step=".length + 60);
});

test("step: control characters", { skip: !hasJq }, () => {
  const s = stepOf(run(pre("Bash", { command: "echo \u001b[31m red\u0007 done" })).args);
  assert.doesNotMatch(s, /[\u0000-\u001f\u007f]/); // eslint-disable-line no-control-regex
  assert.equal(s, "plato.step=Bash: echo [31m red done");
});

test("step: a command that starts with a blank line", { skip: !hasJq }, () => {
  assert.equal(stepOf(run(pre("Bash", { command: "\n  npm test" })).args), "plato.step=Bash: npm test");
});

test("tasks", { skip: !hasJq }, () => {
  const post = (todos) => ({ hook_event_name: "PostToolUse", tool_name: "TodoWrite", tool_input: { todos } });
  assert.deepEqual(run(post([{ status: "completed" }, { status: "in_progress" }, { status: "pending" }])).args, ["label", "t1", "plato.tasks=1/3"]);
  assert.deepEqual(run(post([])).args, ["label", "t1", "plato.tasks="]);
});

test("outside Herdr", { skip: !hasJq }, () => {
  const r = run(pre("Bash", { command: "ls" }), {});
  assert.equal(r.args, null);
  assert.equal(r.code, 0);
});

test("install.sh --hooks adds the step hook on both events, and --remove takes it out", { skip: !hasJq }, () => {
  const home = mkdtempSync(join(tmpdir(), "plato-home-"));
  const install = fileURLToPath(new URL("../../../install.sh", import.meta.url));
  const env = { PATH: process.env.PATH, HOME: home, HERDR_APP_HOME: join(home, "herdr") };
  assert.equal(spawnSync("sh", [install, "--hooks"], { env }).status, 0);
  const s = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  const cmds = (event) => (s.hooks[event] ?? []).flatMap((g) => g.hooks.map((h) => ({ matcher: g.matcher ?? null, command: h.command })));
  assert.ok(cmds("PreToolUse").some((h) => h.command.endsWith("/hooks/claude-plato-step.sh") && h.matcher === null));
  // Every tool call waits for this hook: it gives up after 2 s if Herdr does not answer.
  for (const event of ["PreToolUse", "PostToolUse"]) {
    const h = s.hooks[event].flatMap((g) => g.hooks).find((x) => x.command.endsWith("/hooks/claude-plato-step.sh"));
    assert.equal(h.timeout, 2, `${event} hook timeout`);
  }
  assert.ok(cmds("PostToolUse").some((h) => h.command.endsWith("/hooks/claude-plato-step.sh") && h.matcher === "TodoWrite"));
  assert.equal(spawnSync("sh", [install, "--hooks"], { env }).status, 0);
  const again = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  assert.equal(again.hooks.PostToolUse.length, 1, "a second run adds nothing");
  assert.equal(spawnSync("sh", [install, "--hooks", "--remove"], { env }).status, 0);
  const gone = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  assert.equal(gone.hooks, undefined);
  rmSync(home, { recursive: true, force: true });
});
