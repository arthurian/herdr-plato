// The day recorder, a helper of the banner role: the banner is on screen in every view of the
// layout (the agenda and FOCUS hide TODAY, never the banner), so the record has no gap while
// PLATO is shown. Records each agent state change and focus change to
// plato-data/YYYY-MM-DD.json under the app home, only when something changes; see day.js for
// the events. TODAY (timetable.js), the agenda (route.js), LOOK and JUMP read the files.
// The banner calls record() in each render and on its one-second timer, and close() when the
// app quits or the layout changes. Another layout, or a closed app, is a gap.

import { spaces, panes, focused, shared, appHome, readTextFile, checking } from "herdr";
import * as fs from "fs/promises";
import { stops, currentStop } from "./line.js";
import { dayKey, oldDayFiles, worldOf, dayText, parseDay, recordStep } from "./day.js";
import { LINE } from "./shared.js";

const DIR = "plato-data";

export class Recorder {
  /** Read today's file, then record from the next call on. Deletes old day files once. */
  constructor(cx) {
    this.state = { day: dayKey(Date.now()), events: null, prev: null };
    this.writing = Promise.resolve();
    if (checking()) return;
    cx.spawn(async () => {
      const text = await readTextFile(this.file(this.state.day)).catch(() => null);
      this.state = { ...this.state, events: parseDay(text) };
      this.record(Date.now());
    });
    this.prune();
  }

  file(day) {
    return `${appHome()}/${DIR}/${day}.json`;
  }

  /** Delete day files older than KEEP_DAYS (day.js). */
  async prune() {
    const dir = `${appHome()}/${DIR}`;
    const names = await fs.readdir(dir).catch(() => []);
    for (const n of oldDayFiles(names, Date.now())) await fs.unlink(`${dir}/${n}`).catch(() => null);
  }

  /** Compare the world with the last one recorded, and write the day file if it changed. */
  record(now) {
    if (checking() || !this.state.events) return;
    const line = shared(LINE) ?? null;
    const sp = spaces();
    const all = stops(line, sp, panes());
    const w = worldOf(line, sp, all, currentStop(all, focused())?.code ?? null);
    const { write, ...next } = recordStep(this.state, w, now);
    this.state = next;
    if (write) this.save();
  }

  save() {
    const { day, events } = this.state, text = dayText(day, events);
    this.writing = this.writing
      .then(async () => {
        await fs.mkdir(`${appHome()}/${DIR}`, { recursive: true });
        await fs.writeFile(this.file(day), text);
      })
      .catch((e) => console.log(`plato recorder: could not write ${day}: ${e}`));
  }

  /** The app quits or the layout changes: end the session, so the time until the next start
   *  is drawn as a gap. */
  async close() {
    if (checking() || !this.state.events || !this.state.prev) return;
    const { day } = this.state;
    const events = [...this.state.events, { t: Date.now(), e: "close" }];
    this.state = { ...this.state, events };
    await this.writing;
    await fs.writeFile(this.file(day), dayText(day, events)).catch(() => null);
  }
}
