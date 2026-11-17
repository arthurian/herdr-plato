# PLATO

A Herdr layout in the style of a PLATO terminal: orange text on near-black (or amber, green or paper white), boxed panels in IBM Plex Mono, and PLATO words for each part. The left column has an index of projects and a list of terminals. The terminal is in the middle. The right column has a calendar, a notesfile for the lesson and a file tree. A row of PLATO keys runs along the bottom.

![PLATO](preview.png)

## What you see

- Banner (28 px, top): `PLATO · lesson <space> · page 1 2 3` on the left (tabs as pages, the active one in reverse video), and the clock on the right. A click on "lesson" or the space name opens the INDEX letter choice, the same as `cmd-i`. If an agent is blocked, the right side shows "Press NEXT1 to continue", pulsing.
- Left column (220 px):
  - INDEX: spaces as `a. name`, `b. name`. The active space is in reverse video. A mark follows each name: `!` blocked, `*` done, `~` working. Last row: `+ new lesson`.
  - TALKOMATIC: every terminal pane of the active space in tab order. An agent row shows a number, its status word (working, needs you, done, idle) and its title. A shell row shows "shell" and `program · folder`. Under the list, other spaces with blocked agents get one line each.
- Middle: the active tab, panes with a 1 px theme border and an accent border on the focused pane.
- Right column (280 px):
  - CAL: the month in the layout of Unix `cal`, centered, today in reverse video, `<` and `>` to step months. The panel height follows the number of weeks: 172 px for five, plus or minus 19 px per week.
  - NOTES: the GOAL, then numbered checkpoint responses for the active space.
  - FILES: the project folder tree, `▸`/`▾` folders, no dot files and no `node_modules`.
- Keyset (32 px, bottom): boxed keys NEXT, BACK, NEXT1, BACK1, HELP, TERM, LAB, DATA, FOCUS, each with its shortcut in dim text.
- Colors: theme `plato` (`#ff8a1f` on `#0d0703`) `plato-amber` (`#ffb000` on `#14110f`), `plato-green` (`#4fd06a` on `#08100a`) or `plato-white` (`#dcdcd2` on `#101010`). Panels read accent, background, `ansi8` (dim) and `ansi11` (bright) from the theme. The glow is a 1 px border in the accent color at 20% opacity.

## How it behaves

- Agent status: blocked rows pulse and use the bright color. When the person looks at a "done" agent, it turns "idle".
- NEXT and BACK (`cmd-enter`, `cmd-alt-enter`): the next or previous terminal pane in the active space, through all tabs, wrapping.
- NEXT1 and BACK1 (`ctrl-cmd-enter`, `ctrl-cmd-alt-enter`): jump to the next agent that needs the person (blocked first, then done, never the current one), and return.
- INDEX (`cmd-i`): the index takes the keyboard and highlights the active space. A letter selects that space at once. `ctrl-n`, `ctrl-p` and the arrows move the highlight (wrapping), and Enter goes to it. Esc leaves. In the column, choosing ends by itself after 10 seconds without an index key.
- HELP (`cmd-/`): a dialog with the keys for the current place: classroom, focus mode, INDEX or DATA. INDEX and DATA store the place in shared `plato.place` with a time, and it counts for 60 seconds. TERM (`cmd-shift-p`): the command palette. LAB (`cmd-l`): the new-tab menu.
- DATA (`cmd-shift-c`): a checkpoint dialog with GOAL (prefilled), WORKED, NOTICED and NEXT. Tab, Shift-Tab and the arrows move; Enter saves; Esc cancels. Empty lines show reflection questions as hints. A fifth line, FILE, names a file for a Markdown copy, kept in shared `plato.notesFile`. It is empty until the person types a path (`~` and relative paths start at the home folder), and empty means no file. With a path, a changed goal and a filled checkpoint each append a `### <space> · goal|#n · time` block to it. The first time DATA opens, a line explains FILE.
- GLOW (`cmd-shift-g`, or a click on PLATO): steps the theme: orange, amber, green, white, then orange.
- FOCUS (`cmd-shift-f`): `layout.hide` on the `left` and `right` columns, or `layout.show` when they are hidden (read from `layout()`). In focus mode the INDEX column gets no commands, so the keyset opens INDEX as a dialog (`role: index`, `dialog: true`). A letter or a click selects the space and closes the dialog.
- A click on CAL (outside its arrows and month name) opens a dialog with three months side by side, like `cal -3` (role `calendar`, command `plato.calendar`): ← and → step a month, T returns to today, Esc returns.
- NOTES is the lesson's notesfile (shared `plato.notes`, keyed by space id: `{goal, responses}`). It shows the GOAL, then responses newest first: `#n time`, then `w`, `n` and `>` lines. A lesson keeps its latest 63 responses. Agent events are not recorded. A click on NOTES opens the full notesfile as a dialog (role `notesfile`, command `plato.notesfile`): the goal with its date, then every response with full dates and labels, scrolling. D or E there opens DATA; Esc returns. With no goal and no responses, a click opens DATA instead.
- Every PLATO dialog (HELP, DATA, and INDEX and MONITOR in focus mode) is a modal toggle: `toggleDialog` in `keys.js` keeps its overlay id in shared `plato.dialog.<name>`, the same key closes it, and the dialog clears the id when it closes itself.
- EDIT (`cmd-e`, `plato.edit`): renames in place with the DATA line editor. Not choosing: the INDEX row of the current space becomes an edit line (`space.rename`). INDEX choosing: EDIT then a letter, or Enter for the highlight. MONITOR choosing: EDIT then a row number edits that row's tab name (`tab.rename`); TALKOMATIC shows `word · tab name`. Focus mode: the INDEX dialog opens with the edit line. EDIT TAB (`cmd-shift-e`, `plato.edittab`) edits the current tab's name in its TALKOMATIC row (the focused row, else the first row of the active tab); in focus mode it opens the TALKOMATIC dialog with that edit line. Dialogs get no key commands, so the key sets shared `plato.edit` = {at, arm} and the choosing copy reads it while rendering. A focus change cannot run during render, so the edit starts in `cx.timer.after(0)`. An edit line in a column ends unsaved after 60 s without a key.
- LESSON: `L` in HELP (or the unbound `plato.lesson` command) opens an eight-page lesson about PLATO from `mods/plato/lesson.js`. Enter, →, space or n go forward; ←, Backspace or p go back; Esc returns. Each page names its source.
- PAGE: in focus mode, if an agent other than the focused one is blocked, the keyset grows from 32 to 58 px and shows a flashing line: `PAGE  <space> · <title> needs you  (+N more)  press NEXT1`. A click focuses that agent.
- MONITOR: each TALKOMATIC row except the focused one shows "monitor". A click on it, or a right-click on the row, opens a PLATO peek: a modal dialog whose layout is a `peekbar` title block above a `{ terminal }` block (`openPeek` in `keys.js`). MONITOR again, `cmd-w` or the boxed CLOSE button closes it; the boxed GO TO THIS AGENT / GO TO THIS SHELL button, or NEXT while the view is open, focuses that terminal (`goToPeek`, `goToCommand`; the peeked address is kept in shared `plato.peekTerminal`). MONITOR (`cmd-shift-m`) puts TALKOMATIC in choose mode ("row number · Esc"); a digit 1-9 peeks at that row. In focus mode it opens TALKOMATIC as a dialog. In the column, choosing ends after 10 seconds without a key.
- A click on a file in FILES opens it in a viewer pane to the right: markdown rendered, other text plain.

## Built from

- `layouts/plato.json`: a column of banner, classroom row (left column, `{ "tab": "active" }` block, right column) and keyset. Every panel block is `{ "mod": "plato", "props": { "role": "<role>" } }`. The root sets `"titlebar": "none"`, `"traffic_lights": [12, 9]`, theme `plato` and `ui_font` IBM Plex Mono.
- `mods/plato/main.js` picks a role class from `props().role`: banner, index, talkomatic, cal, notes, files, keyset, help, data, viewer. Key commands arrive by `nextCommand()` as `plato.<command>`, and only the role that owns a command acts on it.
- `mods/plato/logic.js`: all pure logic (no `herdr` import), tested by `node --test`.
- Herdr data functions: `spaces`, `agents`, `panes`, `focused`, `theme`, `keys`, `shared`.
- Herdr action functions: `setShared`, `run`, `exec`, `watchFolder`, `readTextFile`, `openOverlay`, `notify`, `setAgentOrder`.
- Navigation commands: `space.select`, `space.new`, `tab.select`, `pane.focus`, `agent.focus`, `agent.next`, `agent.prev`.
- Other commands: `pane.split`, `pane.close`, `app.palette`, `app.theme`, `layout.resize`.
- Programs run: `git rev-parse` (project folder), `ls -1Ap` (tree), `sh` with `printf >>` (notes file).
- Art: `layouts/plato.svg` preview, IBM Plex Mono in `mods/plato/fonts/`.

## Watch out

- `herdr-app shot` returns the last drawn frame. After a hot reload, run `layout.switch --name plato` before a screenshot.
- Herdr's theme `foreground` for panels is near white. Use the theme's `accent` for panel text.
- After `space.select`, `focused().pane` still names the old space's pane. Focusing it switches back. Focus a pane of the new space instead.
- `"focusable": true` applies to every copy of the mod. Leave it out and focus the index from a key command.
- A recursive `watchFolder` on a large project redraws often. Refresh only for changes in shown folders, and never watch the home folder.
- Herdr does not follow symlinks for live reload. Keep the real files in Herdr's folder.
- Each `openOverlay` dialog stacks and dims the window again. A key that opens a dialog has to remember it and close it on the next press. `key` does not replace dialogs (only windows), and `closeOverlay` does not report whether anything was open. Make the dialog `modal` so a click beside it cannot close it behind the mod's back.
- Herdr's own `terminal.peek` is risky inside a layout: Esc goes to the peeked terminal (it interrupts an agent), and `cmd-w` reaches `tab.close` for the tab underneath. PLATO opens its own peek and binds `cmd-w` to `plato.close`, which closes PLATO dialogs first.
- Herdr does not call a mod's close hook when a dialog closes, so do not keep shared state that only a close can reset.
- A mod's focus handle can report focus after the person has clicked back into a terminal. Do not rely on `is_focused()` alone to end a mode.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/plato` passes and `node --test mods/plato/test/*.test.mjs` passes.
- `herdr-app do layout.switch --name plato` shows the layout and writes no `.error` file.
- `cmd-i` then a letter switches spaces. NEXT visits every terminal of the space and wraps.
- `herdr-app do plato.help` opens HELP. `herdr-app do plato.glow` steps to the next glow color.
- DATA saves a checkpoint and shows it in NOTES. With a FILE path, it also appends the checkpoint to that file.
