// The step hook (hooks/claude-plato-step.sh), run with a stand-in hc that writes its
// arguments to a file, one per line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, mkdirSync, symlinkSync, readlinkSync, realpathSync } from "node:fs";
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

test("install.sh --hooks links the director skill, and --remove unlinks only this checkout's", { skip: !hasJq }, () => {
  const home = mkdtempSync(join(tmpdir(), "plato-home-"));
  const install = fileURLToPath(new URL("../../../install.sh", import.meta.url));
  const skill = fileURLToPath(new URL("../../../skills/plato-director", import.meta.url));
  const env = { PATH: process.env.PATH, HOME: home, HERDR_APP_HOME: join(home, "herdr") };
  const link = join(home, ".claude/skills/plato-director");
  assert.equal(spawnSync("sh", [install, "--hooks"], { env }).status, 0);
  assert.equal(realpathSync(link), realpathSync(skill));
  assert.equal(spawnSync("sh", [install, "--hooks"], { env }).status, 0, "a second run is fine");
  assert.equal(spawnSync("sh", [install, "--hooks", "--remove"], { env }).status, 0);
  assert.equal(existsSync(link), false);
  // A skill of the same name from somewhere else stays.
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  symlinkSync(home, link);
  assert.equal(spawnSync("sh", [install, "--hooks", "--remove"], { env }).status, 0);
  assert.equal(readlinkSync(link), home);
  rmSync(home, { recursive: true, force: true });
});

test("the director skill starts only by hand and finds Herdr's data folder as plato-post does", () => {
  const text = readFileSync(fileURLToPath(new URL("../../../skills/plato-director/SKILL.md", import.meta.url)), "utf8");
  const front = text.split("---")[1];
  assert.match(front, /^name: plato-director$/m);
  assert.match(front, /^disable-model-invocation: true$/m);
  assert.match(text, /\$\{HERDR_APP_HOME:-\$HOME\/\.config\/herdr-app\}\/plato-data/);
  assert.doesNotMatch(text, /~\/\.config\/herdr-app/);
  assert.match(text, /plato-post note/);
});

// The purpose hook (hooks/claude-plato-purpose.sh): a stand-in hc answers `get` with {} and records `label`.
const PURPOSE = fileURLToPath(new URL("../../../hooks/claude-plato-purpose.sh", import.meta.url));

// The PATH without any plato-post, so a test decides whether one is there.
const PATH_NO_POST = process.env.PATH.split(":").filter((d) => d && !existsSync(join(d, "plato-post"))).join(":");

function runPurpose(input, env = { HC_TERMINAL_ID: "t1" }, { post = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "plato-hook-"));
  const out = join(dir, "args");
  writeFileSync(join(dir, "hc"), `#!/bin/sh\nif [ "$1" = get ]; then echo '{}'; exit 0; fi\nprintf '%s\\n' "$@" >> "${out}"\n`);
  chmodSync(join(dir, "hc"), 0o755);
  if (post) {
    writeFileSync(join(dir, "plato-post"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(dir, "plato-post"), 0o755);
  }
  const r = spawnSync("sh", [PURPOSE], { input: JSON.stringify(input), env: { PATH: `${dir}:${PATH_NO_POST}`, ...env } });
  const args = existsSync(out) ? readFileSync(out, "utf8").split("\n").slice(0, -1) : null;
  rmSync(dir, { recursive: true, force: true });
  return { args, code: r.status, stdout: String(r.stdout) };
}

test("purpose: sets plato.session and plato.session_how from the input", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: "abc-1", source: "clear" });
  assert.deepEqual(r.args, ["label", "t1", "plato.session=abc-1", "plato.session_how=clear"]);
  assert.equal(r.code, 0);
});

test("purpose: an unknown source becomes startup, and a bad id is cleaned", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: `a b/c;d_e-${"x".repeat(100)}`, source: "weird" });
  assert.equal(r.args[3], "plato.session_how=startup");
  assert.match(r.args[2], /^plato\.session=abcd_e-x+$/);
  assert.equal(r.args[2].length, "plato.session=".length + 80);
});

test("purpose: prints the plato.done instruction: five words, the verb list", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: "s", source: "startup" });
  assert.match(r.stdout, /plato\.done_at/);
  assert.ok(r.stdout.includes("researched, explored, explained, brainstormed, designed, planned, decided, built, fixed, refactored, configured, tested, diagnosed, reviewed, shipped, documented, drafted, dropped"));
  assert.match(r.stdout, /five words or fewer/);
});

test("purpose: a result only at a milestone, never for small steps", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: "s", source: "startup" });
  assert.match(r.stdout, /Record a result only at a milestone/);
  assert.match(r.stdout, /a pull request is opened or merged/);
  assert.match(r.stdout, /a research question is answered with a finding/);
  assert.match(r.stdout, /Small steps toward the same milestone set nothing/);
  assert.match(r.stdout, /These are examples\. Use your judgment for other work\./);
  assert.doesNotMatch(r.stdout, /At the end of a turn/);
});

test("purpose: prints the plato-post rules", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: "s", source: "startup" });
  assert.match(r.stdout, /plato-post report/);
  assert.match(r.stdout, /Comments are about how the user and you work together, not about the work\./);
  assert.match(r.stdout, /A comment starts with "You" or "Your"/);
  assert.match(r.stdout, /friction that you saw more than once in this session/);
  assert.match(r.stdout, /do not suggest giving more detail at the start/);
  assert.match(r.stdout, /a permission rule, a line in CLAUDE\.md or AGENTS\.md, a skill, a script, or a change in how files, handoffs or status files are organized/);
  assert.match(r.stdout, /If you cannot name such a change, do not write the comment\./);
  assert.match(r.stdout, /advice about PLATO or its hooks/);
  assert.match(r.stdout, /not in the turn in which you read these instructions/);
  assert.match(r.stdout, /Most sessions end with no comment, and that is normal\./);
  assert.match(r.stdout, /Write about what the user did, never about who they are\./);
  assert.match(r.stdout, /never praise for its own sake/);
  assert.match(r.stdout, /at most one comment an hour/);
  assert.doesNotMatch(r.stdout, /8 hours|one small change/);
  assert.match(r.stdout, /A comment is at most 400 characters\./);
  assert.match(r.stdout, /plato-post comment/);
  assert.match(r.stdout, /Run each hc label and plato-post command alone/);
  assert.match(r.stdout, /Never send a note unless the user started you as the director/);
  assert.match(r.stdout, /REVIEW counts each result/);
  assert.doesNotMatch(r.stdout, /letter|editorial|PAPER/i);
});

test("purpose: without plato-post on PATH, the plato-post rules are left out", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: "s", source: "startup" }, { HC_TERMINAL_ID: "t1" }, { post: false });
  assert.doesNotMatch(r.stdout, /plato-post/);
  assert.match(r.stdout, /plato\.done_at/, "the rest still prints");
  assert.match(r.stdout, /Run each hc label command alone/);
});

test("purpose: outside Herdr prints nothing and calls nothing", { skip: !hasJq }, () => {
  const r = runPurpose({ session_id: "s", source: "startup" }, {});
  assert.equal(r.args, null);
  assert.equal(r.stdout, "");
});

// The last-prompt hook (hooks/claude-plato-last.sh). Claude Code also fires UserPromptSubmit for
// turns it starts itself, such as a subagent's report or another session's message. Those are not
// the person's prompt, so the hook leaves plato.last, plato.last_at and plato.first alone.
const LAST = fileURLToPath(new URL("../../../hooks/claude-plato-last.sh", import.meta.url));

/** Run the last-prompt hook with this prompt; the arguments hc got, or null if it was not called. */
function runLast(prompt, sid = "s1") {
  const dir = mkdtempSync(join(tmpdir(), "plato-last-"));
  const out = join(dir, "args");
  writeFileSync(join(dir, "hc"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${out}"\n`);
  chmodSync(join(dir, "hc"), 0o755);
  const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: sid, prompt });
  const r = spawnSync("sh", [LAST], { input, env: { PATH: `${dir}:${process.env.PATH}`, HC_TERMINAL_ID: "t1", HERDR_APP_HOME: dir } });
  const args = existsSync(out) ? readFileSync(out, "utf8").split("\n").slice(0, -1) : null;
  rmSync(dir, { recursive: true, force: true });
  return { args, code: r.status };
}

test("last: a typed prompt sets plato.last, plato.last_at and plato.first", { skip: !hasJq }, () => {
  const r = runLast("Fix the login bug");
  assert.deepEqual(r.args.slice(0, 3), ["label", "t1", "plato.last=Fix the login bug"]);
  assert.match(r.args[3], /^plato\.last_at=\d+$/);
  assert.equal(r.args[4], "plato.first=Fix the login bug");
  assert.equal(r.code, 0);
});

test("last: a pasted prompt still counts as typed", { skip: !hasJq }, () => {
  const r = runLast('<pasted_content id="x1">\nlog line\n</pasted_content id="x1">\nWhy does this fail?');
  assert.match(r.args[2], /^plato\.last=<pasted_content/);
});

test("last: a turn Claude Code starts itself leaves the labels alone", { skip: !hasJq }, () => {
  for (const p of [
    '<agent-message from="a357ecd5b7245f5a2">\n[Subagent hand-back] The text below is the final report',
    '<cross-session-message from="worker">\nCan you check the tests?',
    "<task-notification>\n<task-id>a1</task-id>",
    '<teammate-message teammate_id="t2">\nidle',
    '  \n<agent-message from="a1">\nreport',
  ]) {
    const r = runLast(p);
    assert.equal(r.args, null, p);
    assert.equal(r.code, 0);
  }
});
