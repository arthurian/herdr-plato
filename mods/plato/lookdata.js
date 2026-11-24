// LOOK's card for a stop, from the world: what the LOOK dialog shows, and the preview
// beside JUMP's list. Both roles draw it; the words come from lookCard in overview.js.

import { spaces, panes, agents, terminals, focused, home } from "herdr";
import { lastSent, tabCount, currentStop, nextStop, next1Agent } from "./line.js";
import { lookCard, stateSince, activityWords } from "./overview.js";
import { build, dueList } from "./day.js";

/** The LOOK card of stop (lookCard's words), or null when it has gone. all: the stops in
 *  line order; line: shared plato.line; day: today's parsed day file, or null; perLine:
 *  characters per line in the card's value column. */
export function lookCardFor(stop, all, line, day, perLine, now = Date.now()) {
  if (!stop) return null;
  const sp = spaces();
  const terms = terminals();
  const term = terms.find((t) => t.address === stop.terminal);
  const pane = panes().find((p) => p.pane === stop.pane);
  const cur = currentStop(all, focused());
  const n1 = next1Agent(agents(), focused()?.terminal ?? null);
  const role = stop.terminal && n1?.address === stop.terminal ? "NEXT1" : nextStop(all, cur)?.code === stop.code ? "NEXT" : "";
  const graph = day ? build(day, now, true) : null;
  return lookCard({
    stop, labels: term?.labels ?? {}, last: stop.terminal ? lastSent(terms, stop.terminal) : null,
    folder: pane?.cwd ?? term?.cwd ?? null, home: home(),
    tabs: tabCount(all.filter((s) => s.space === stop.space)),
    due: dueList(line, sp, now).find((d) => d.letter === stop.letter) ?? null,
    today: activityWords(graph?.rows[stop.letter], now),
    subAgents: stop.terminal ? terms.filter((t) => t.parent === stop.terminal && t.state === "live").length : 0,
    role, since: stateSince(stop, sp), now, perLine,
  });
}
