// The day recorder, a helper of the banner role: the banner is on screen in every view of the
// layout (REVIEW and FOCUS hide TODAY, never the banner), so the record has no gap while
// PLATO is shown. Records each agent state change and focus change to
// plato-data/YYYY-MM-DD.json under the app home, only when something changes; see day.js for
// the events. TODAY (timetable.js), REVIEW (review.js), LOOK and JUMP read the files.
// The banner calls record() in each render and on its one-second timer, and close() when the
// app quits or the layout changes. Another layout, or a closed app, is a gap.

import { spaces, panes, terminals, focused, shared, appHome, readTextFile, checking } from "herdr";
import * as fs from "fs/promises";
import { stops, currentStop } from "./line.js";
import { dayKey, oldDayFiles, oldPostFolders, worldOf, dayText, parseDay, recordStep, writeStuck, behindSince, retryDue } from "./day.js";
import { LINE } from "./shared.js";

const DIR = "plato-data";

export class Recorder {
  /** Read today's file, then record from the next call on. Deletes old day files once. */
  constructor(cx) {
    this.state = { day: dayKey(Date.now()), events: null, prev: null };
    this.writing = Promise.resolve();
    this.running = null; // the write in progress: { at }, or null
    this.startedAt = Date.now();
    this.pendingAt = null; // when the oldest change still unsaved came, or null
    this.asked = null; // when the newest write was asked for
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

  /** Delete day files and post folders older than KEEP_DAYS (day.js). */
  async prune() {
    const dir = `${appHome()}/${DIR}`;
    const names = await fs.readdir(dir).catch(() => []);
    for (const n of oldDayFiles(names, Date.now())) await fs.unlink(`${dir}/${n}`).catch(() => null);
    const posts = await fs.readdir(`${dir}/posts`).catch(() => []);
    for (const n of oldPostFolders(posts, Date.now())) await fs.rm(`${dir}/posts/${n}`, { recursive: true, force: true }).catch(() => null);
  }

  /** Compare the world with the last one recorded, and write the day file if it changed. */
  record(now) {
    if (checking() || !this.state.events) return;
    const line = shared(LINE) ?? null;
    const sp = spaces();
    const ps = panes();
    const all = stops(line, sp, ps);
    const w = worldOf(line, sp, all, currentStop(all, focused())?.code ?? null, terminals(), ps);
    const { write, ...next } = recordStep(this.state, w, now);
    this.state = next;
    // A write that failed leaves the change unsaved; try again while nothing is running.
    if (write || retryDue(this.pendingAt != null, this.running != null, this.asked, now)) this.save();
  }

  save() {
    this.unstick();
    const { day, events } = this.state, text = dayText(day, events);
    const asked = Date.now();
    this.asked = asked;
    this.pendingAt ??= asked;
    this.writing = this.writing
      .then(async () => {
        const job = { at: Date.now() };
        this.running = job;
        try {
          await fs.mkdir(`${appHome()}/${DIR}`, { recursive: true });
          await fs.writeFile(this.file(day), text);
          // Saved; a newer write still waiting keeps the record pending.
          this.pendingAt = this.asked === asked ? null : this.asked;
        } finally {
          if (this.running === job) this.running = null;
        }
      })
      .catch((e) => console.log(`plato recorder: could not write ${day}: ${e}`));
  }

  /** Each write waits for the one before it, so one write that never ends would stop the
   *  record for the rest of the day. Drop a stuck write: the next write holds the whole day. */
  unstick() {
    if (!writeStuck(this.running?.at ?? null, Date.now())) return;
    console.log("plato recorder: dropped a stuck write");
    this.running = null;
    this.writing = Promise.resolve();
  }

  /** Since when the record is behind at now, or null (day.js behindSince). The banner warns. */
  behind(now) {
    if (checking()) return null;
    return behindSince({ startedAt: this.startedAt, ready: this.state.events != null, pendingAt: this.pendingAt }, now);
  }

  /** The app quits or the layout changes: end the session, so the time until the next start
   *  is drawn as a gap. */
  async close() {
    if (checking() || !this.state.events || !this.state.prev) return;
    const { day } = this.state;
    const events = [...this.state.events, { t: Date.now(), e: "close" }];
    this.state = { ...this.state, events };
    this.unstick();
    await this.writing;
    await fs.writeFile(this.file(day), dayText(day, events)).catch(() => null);
  }
}
