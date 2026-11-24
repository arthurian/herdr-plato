// What the pane strip shows besides the code and the state: the pane's git state, from
// `git status --porcelain=v2 --branch`, and the agent's step, from the step labels on its
// terminal. The step labels are an interface for any agent: plato.step (its own words),
// plato.step_at (unix seconds) and plato.tasks (short progress text). Nothing here names an
// agent or a tool. No "herdr" import, so Node can test it.

/** How many characters of a step the strip shows. */
export const STEP_MAX = 60;
/** How often the strip reads git again, and how long one read may take. */
export const GIT_EVERY_MS = 10000;
export const GIT_TIMEOUT_MS = 5000;
/** A read still running after this never ended (a dropped machine): the strip reads again. */
const GIT_GIVE_UP_MS = 3 * GIT_TIMEOUT_MS;

/** Whether the strip reads git now. state: { busy, key, at } of its last read; key: the
 *  pane's folder and branch now (null: no folder). One read at a time, unless it hung. */
export function gitDue(state, key, now) {
  if (!key) return false;
  if (state.busy && now - state.at < GIT_GIVE_UP_MS) return false;
  return state.busy || key !== state.key || now - state.at >= GIT_EVERY_MS;
}

/** Text from any writer on one line: control characters and runs of space become one space. */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const oneLine = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** `git status --porcelain=v2 --branch` as { head, oid, ahead, behind, changed }, or null
 *  for text with no branch header (not a repo, or a failed call). changed counts the changed,
 *  renamed and conflicted entries and new files not yet in git; ignored files do not count. */
export function parseGit(stdout) {
  const lines = String(stdout ?? "").split("\n");
  const oid = lines.find((l) => l.startsWith("# branch.oid "));
  if (!oid) return null;
  const head = lines.find((l) => l.startsWith("# branch.head "));
  const ab = lines.find((l) => l.startsWith("# branch.ab "))?.match(/\+(\d+) -(\d+)/);
  return {
    head: head ? head.slice("# branch.head ".length) : null,
    oid: oid.slice("# branch.oid ".length),
    ahead: ab ? Number(ab[1]) : 0,
    behind: ab ? Number(ab[2]) : 0,
    changed: lines.filter((l) => /^(1|2|u|\?) /.test(l)).length,
  };
}

/** The git part of the strip: { name: "⎇ <branch>", marks: "●3 ↑2 ↓1" } (a mark with zero is
 *  left out). branch is Herdr's for the pane; a detached HEAD shows its short commit. Null
 *  with no branch and no git result. */
export function gitWords(branch, git) {
  const detached = git?.head === "(detached)";
  const name = branch && !detached ? branch : detached ? git.oid?.slice(0, 7) : git?.head ?? null;
  if (!name) return null;
  const marks = git ? [git.changed && `●${git.changed}`, git.ahead && `↑${git.ahead}`, git.behind && `↓${git.behind}`].filter(Boolean).join(" ") : "";
  return { name: `⎇ ${name}`, marks };
}

const secs = (v) => (v != null && /^\d+$/.test(String(v).trim()) ? Number(v) : null);

/** The step part of the strip, from a terminal's labels and Herdr's state for the pane:
 *  { text, tasks, dim }, or null. The step shows only while the agent needs you, as
 *  "▸ asks: <step>": what it waits to do. Otherwise text is "" and only the progress shows,
 *  dim unless the agent works; with no progress, null. A step older than the last prompt
 *  sent (plato.last_at) is from an older turn and does not show. Any writer's text goes on
 *  one line, cut at STEP_MAX. */
export function stepWords(labels, status) {
  const raw = labels?.["plato.step"];
  if (!raw) return null;
  const at = secs(labels["plato.step_at"]);
  const sent = secs(labels["plato.last_at"]);
  if (sent != null && (at == null || at < sent)) return null;
  const step = oneLine(raw).slice(0, STEP_MAX);
  if (!step) return null;
  const tasks = oneLine(labels["plato.tasks"]);
  if (status === "blocked") return { text: `▸ asks: ${step}`, tasks, dim: false };
  return tasks ? { text: "", tasks, dim: status !== "working" } : null;
}
