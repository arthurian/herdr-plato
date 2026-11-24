# PLATO

A Herdr layout in the style of a PLATO terminal, with your spaces drawn as a line. Each space has a fixed letter, and each tab has a code such as `c3`. The route of spaces is on the left, and the terminal is in the middle. SIGNALS, NOW AT, TODAY and FILES are on the right, and a row of PLATO keys runs along the bottom.

![PLATO](preview.png)

## What you see

### The banner

28 px, at the top.

- The left side reads `PLATO · space e compass · tab 1 api`. The space is in reverse video.
- After PLATO comes the glow's name in dim text, for example `PLATO amber`. The name is bright for two seconds after a change. A click on PLATO or the name steps the glow. PLATO's tooltip reads "GLOW ⌘⇧G".
- The right side has the date and the clock. When agents need you (blocked, or done and not seen), "N needs you" shows before them in reverse video. The count leaves out the tab you are at, so it agrees with NEXT1. A click on the count does what NEXT1 does.
- For 4 seconds after a move, the left side reads `▶ ARRIVED AT f1 meridian · docs from e2 compass` in reverse video instead. So the arrival never covers the terminal.

### The route

260 px, on the left, at least 48 px.

- One row per letter on the line. A space is an 18 px square on the line with its letter inside, like a key cap, and its name beside it.
- The current space's square is filled, with the letter in reverse video, and its name is in reverse video too.
- A space with an agent that needs you has a reverse-video WAITING tag after its name. The mark shows without motion or color. A click on the tag goes to that space's first waiting agent in NEXT1 order, the way NEXT1 goes there.
- A free letter is a dashed square with a dim letter and "free since 14:02".

The current space has a branch with one row per tab: the number and label, then `program · state`. Each tab has a round lamp. The lamp is filled while the agent works or waits. The current tab's lamp has a ring around it. Its text is boxed and says "you are here", or "◀ arrived from e1" during an arrival.

The other spaces show one dot per tab. A working or blocked dot is filled. An idle or done dot is hollow. A blocked dot pulses.

Hover detail: while the pointer is on a dot, the readout shows the tab's detail in its place. The code comes with `space · tab`, then the purpose on up to two lines with its source, then `program · state time`. The purpose source uses the same words as NOW AT and LOOK. The current space's tab rows, lamps included, and the one-line rows in TREE do the same. A hover changes no PLATO state and takes no focus. When the pointer leaves, the readout comes back.

Right-click menus look and work like Herdr's own tab menu:

- A right-click opens a small menu at the pointer. ↑ and ↓ move, Enter or a click picks, and Esc closes.
- A space's square or name gives RENAME, LAB, SET DUE and SIGN-OFF, or SIGN-ON on a free letter. CLOSE UP shows while the line has free letters.
- A tab row, dot or one-line row gives GO, LOOK, RENAME TAB and SET PURPOSE…. The current tab has no GO.
- Each row shows its key.
- A pick does the same as the key. LAB on another space selects that space first, then opens the new-tab menu. SIGN-OFF opens its summary for that space.

NEXT1 is a dashed bright run. It goes out from the current tab and down the right edge. Then it goes in on a line under the target's row, and up into its dot or lamp. The target row can be a dot row, a one-line row in TREE, or a two-line tab row. The run never crosses another dot or any tab's text, and the target keeps its full width. A ◀ halfway along the line shows the direction, and the word NEXT1 sits at its right end.

NEXT is a small ▼ at the end of the line into its target, with its tip on the target's marker. That is on the branch for a tab of this space, or on the line for the next space's square. When NEXT wraps back to a, no ▼ shows.

The readout at the bottom has four lines, in the order of the keys:

```
NEXT  → e2 compass · tests
BACK  → c2 orbit · shell
NEXT1 → f1 needs you · meridian · docs
BACK1 → c1 orbit · build
```

With nothing waiting, NEXT1 says "nothing waiting". Its code and reason come first, so a cut keeps them. Under the readout, a three-line legend uses the route's own marks: ■ this space, □ space, a dashed □ free. Then the ringed lamp for you are here, ● working and ○ idle. Then a bright ● for needs you, and the WAITING tag for its space.

### The work area and the strip

The work area shows the active tab, alone, with panes that have a 1 px border and an accent border on the focused pane.

The strip is a 28 px header at the bottom of every pane. Thin rules separate its parts:

- The tab code.
- The git state: `⎇ branch ●3 ↑2 ↓1`. A count of zero does not show. A folder outside git shows no git part.
- The agent's progress, such as `3/7`, dim unless the agent works. While the agent is blocked, the step it waits to run follows, such as `▸ asks: Bash: git push`.
- The state with its time, such as `working 12m`.

When the pane is narrow, the step is cut first. The git state is read again after 10 s, and at once after a change of folder or branch. A step from before your last prompt does not show. After an arrival, the strip is in reverse video with the names, "GOAL <purpose>" and "◀ arrived from e1".

### The right column

280 px, at least 200 px.

SIGNALS (150 px, room for three rows, always shown) lists the agents that need you in NEXT1 order, without the one you are at. Each row has the letter in a circle, the code and name, and the state with how long it waited. The first row is where NEXT1 goes, in reverse video. The title note reads "N needs you". A click on a row folds an open agenda, and goes to that agent as NEXT1 does.

NOW AT (144 px) has up to three parts:

- A small letter in a circle, the code, `space · tab` and the state.
- The tab's purpose in full, on up to three lines, with its source in dim text. A tab with no purpose has no purpose line.
- "sent 9m ago:" and the last prompt, on one line.

The title reads "sending to · changed" during an arrival, and the border turns bright. While SIGN-ON is open, it says "signing on at g" and "keys go to SIGN-ON only".

TODAY (272 px) scrolls what does not fit.

- The title note reads "last 2h · totals today". A click on "last 2h", in the accent color, steps the window through 2, 6, 12 and 24 hours.
- A window that starts before midnight shows part of yesterday too. The totals stay today's alone.
- Three columns: the letters (16 px), the graph, and today's totals (68 px). Each row of totals has "53m" ran and "12m" waited in a hollow box.
- The graph shows the last two hours of recorded time, ending at now. It is placed in percentages of its area, so it fits at any zoom. A bar means ran, a thin line means idle, and a hollow box means waited on you. A bright line shows your path, with a dot at now.
- A stretch with no record is a 6 px gap with a dim line, "not recorded" in the legend. A gap under two minutes is joined.
- Under the graph are a legend and the response line, for example "4 waits answered · typical 6m · longest 11m at e1". With due dates set, the due list follows. A late date is in reverse video.
- A click on a letter or a total goes to that space's active tab. A click on a wait box goes to the tab of the latest wait there.

FILES shows the folder tree of the project you are in, with the title `files · <folder>`. Folders have `▸` and `▾`. It shows no dot files and no `node_modules`.

### The keyset

32 px, at the bottom. Boxed keys NEXT, BACK, NEXT1, BACK1, JUMP, AGENDA, FOCUS, LAB, TERM and HELP, each with its shortcut in dim text: the moves, the views, then the rest.

The keys center under the terminal, not the window. So the keyset leaves room for the route while the line shows, and for the right column unless FOCUS hides it. In the agenda, the keys center under the agenda.

The route's title reads `ROUTE  TREE ⌘⇧T  AGENDA ⌘⇧A`, and a click on TREE or AGENDA does what its key does.

### The agenda

`cmd-shift-a` shows the agenda in place of the route and the work area. The header has the buttons TODAY and WEEK (the current one in reverse video), the cap `Tab switches`, and a count such as `5 spaces · 13 tabs`. Tab, or a click on a button, switches the view. After a reload, the agenda opens on TODAY.

#### TODAY

One column per letter.

The head is a 52 px letter in a circle with the space name. Under the name are only the lines that space has:

- The due date. A space with no due date has no line for it. A late date is in reverse video. A date from today to two days ahead is bright.
- `ran 36m · you 35m`, for a space with activity today.
- The last activity: `active now`, `last active 40m ago`, or `QUIET today` in reverse video, under one minute of activity.

The space you are at has a filled badge and its name in reverse video.

Under the heads is a day box per column. It runs from the start of the hour of the first session today to now, with a line and a label for each hour. Its marks:

- A filled block where an agent ran.
- A hollow block with WAIT where one waited on you.
- A 4 px bright bar at the left edge for your time, the focus.
- A dim band where nothing was recorded: Herdr was closed, another layout was shown, or there is no day file yet. Only the first column says "not recorded".
- A dashed line at the bottom for now.

A column counts a letter's time only since its space took the letter, under any name. So a rename keeps the history, and a letter that changed space does not mix two projects.

Under each day box is one 24 px row per tab: the ▶ cursor, the lamp, the code and the label, `→` for NEXT and a pulsing `▲` for NEXT1. The tab you are at is in reverse video. A free letter has a dashed circle and an empty dashed box.

Sizes and fitting:

- The day box fills the window's height, less the header, the footer and the tab rows.
- Columns share the width, at least 150 px each. When not all fit, the agenda shows the ones that do, always with the cursor's column. The header then ends with `◀ 2 more` and `1 more ▶`.
- The heads, the day boxes and each tab row scroll as rows, so the arrows bring the cursor's row into view.

Under the columns are the day's totals and what the marks mean.

#### WEEK

One row per letter. Each row has nine cells: the four days before today, today, and the four days after.

- A past cell has a bar for the time the agents ran, full at four hours, and a 3 px bar for your time. Its words are the time, `WAIT 20m` or `you 12m`.
- A dot is a day under one minute of activity. An empty cell is a day before the space opened.
- Future cells are dashed and show `◆ DUE` on the due date, in reverse video within two days.
- At the right end are the week's times and `since Sun 22`, `today` or `QUIET since Fri 20`.

Up and down move between rows. A click moves the cursor, a double click goes to the space's first tab, and a right-click opens the space's menu. Under the rows are the week's totals and its busiest day.

#### Under the views, and the right column

Under either view, one line has the key caps for where the cursor is: move, go, look and sign-off. NEXT, BACK, JUMP and the rest are left out, because the keyset shows them and the tab rows mark NEXT and NEXT1. Tab is in the header and Esc in the title. While the pointer is on a tab, the line shows its detail instead.

A right-click on a column head opens the space's menu, and on a tab the tab's menu, with LOOK (the Space bar) too. In the agenda, a pick first moves the cursor there, so LAB, SIGN-OFF and LOOK act there as their keys do.

In the agenda's right column, SIGNALS and NOW AT stay, and DUE takes the place of TODAY and FILES. DUE lists the spaces with a due date, soonest first, with a late one in reverse video. Under the list, it names the longest running and the oldest idle tab. The agenda's header counts the spaces and tabs, and SIGNALS shows who waits, so DUE does not count them again.

### Focus mode

`cmd-shift-f` hides the right column, and the route becomes 56 px wide: a column of 32 px lettered squares, as on the full route. The current one is filled, with its tab number under it. A space with an agent that needs you pulses and has a reverse-video WAIT tag under it.

If another agent is blocked, the keyset grows to 58 px and shows a flashing `SIGNAL meridian · <title> needs you  press NEXT1`. A click on it does what NEXT1 does, and a click on a WAIT tag goes to that space's waiting agent.

### The dialogs

SIGN-ON and SIGN-OFF are a modal dialog, 640 by 430 px.

- SIGN-ON has a dashed circle with the letter it will take, and the name line with a ▶ and a blinking cursor. Under them are the letter it takes, the folder line with "choose… ⌘O", what happens with that folder, and the due date line.
- SIGN-OFF has a solid circle and a summary: the space, the time open, its tabs, the due date and what happens to the line. For a space in the middle, it adds "U closes up the line instead".
- The keys at the bottom of each page are boxed caps. A click on one does what the key does. So a page opened by mouse still asks first, and can be answered by mouse.

SET PURPOSE (`cmd-e`, or the tab menu) is the same dialog, 640 by 330 px. It reuses SIGN-ON's name line and shows the purpose now with its source. The line starts with your own purpose, or empty. NEXT or Enter saves it as your purpose for the tab. A blank line clears it. BACK or Esc cancels. In the agenda, `cmd-e` is for the tab under the cursor. NOW AT does not count it as a sign-on.

SET DUE (`cmd-shift-e`, or a space's menu) is the same dialog, 640 by 330 px. It is for the space you are in, or the space under the agenda's cursor (none for a free letter).

- It reuses the name line, starts with the space's date, and takes SIGN-ON's date forms. The day it means shows under it, with the date now.
- NEXT or Enter saves the date. A blank line clears it.
- A date it cannot read stays on the page, with the reason. NOW AT does not count it as a sign-on.

LOOK, JUMP, HELP and the ⌘K panel are described under [How it behaves](#how-it-behaves).

### Colors

PLATO has eight themes. The default is `plato-tokyo`. Panels take the accent, the background, a dim color (`ansi8`) and a bright color (`ansi11`) from the theme.

| Theme | Accent | Background | Bright | Dim | Terminal text |
| --- | --- | --- | --- | --- | --- |
| `plato-tokyo` | `#7aa2f7` Tokyo Night blue | `#1a1b26` | `#ff9e64` orange | `#7f87ae` | `#c0caf5` |
| `plato-kanagawa` | `#dcd7ba` fujiWhite | `#1f1f28` sumiInk3 | `#ffa066` surimiOrange | `#938aa9` springViolet1 | `#dcd7ba` |
| `plato-mocha` | `#cba6f7` mauve | `#1e1e2e` base | `#fab387` peach | `#9399b2` overlay2 | `#cdd6f4` |
| `plato-nord` | `#88c0d0` frost | `#2e3440` | `#ebcb8b` yellow | `#97a2b8` | `#d8dee9` |
| `plato` (orange) | `#ff8a1f` | `#0d0703` | | | |
| `plato-amber` | `#ffb000` | `#14110f` | | | |
| `plato-green` | `#4fd06a` | `#08100a` | | | |
| `plato-white` | `#dcdcd2` | `#101010` | | | |

Notes on the modern glows:

- Tokyo Night's own dim, dark5 `#737aa2`, is made lighter to reach 4.9:1.
- Kanagawa's own `ansi11` is carpYellow, so the bright is surimiOrange.
- Mocha takes every role from Mocha's own palette.
- Nord's own `#616e88` is too faint for text (2.4:1), so the dim is `#97a2b8`.

The glow is a 1 px border in the accent color at 14% opacity. Bright means "needs you" (blocked, or done and not seen yet), the accent means working, and dim means idle. A lamp is filled while its agent works or needs you. Only blocked pulses. A state is also marked by shape, words or reverse video, so it reads in paper white, where bright and accent are close.

## How it behaves

### Letters and tabs

The line is the list of spaces in letter order. Each slot holds a letter and its space, with the space's name, folder, due date and the time it opened.

- A new space takes the first free letter, else the next letter at the end.
- A closed space leaves a free letter, so other letters never move. Free letters at the end are trimmed.
- If a space goes away and a new space has the same folder, the new space keeps the letter.
- PLATO also moves Herdr's spaces into letter order.

Tabs are the tabs of a space that is not settled, in tab order. A split tab gives one entry per pane (`c3.1`, `c3.2`). A tab's label is the tab name. If nobody named the tab, the label is the terminal's title, else the program (`zsh`). A shell that sets no title gets its terminal id (`t3v`) as a title from Herdr, and that counts as no title.

### Moves

- NEXT (`cmd-enter`): the next tab in line order, wrapping to a.
- BACK (`cmd-shift-enter`, because shift reverses NEXT as it reverses Tab): the tab before in line order, wrapping to the last. Only NEXT gets a mark on the line (▼). The readout names BACK.
- BACK1 (`cmd-[`, back as in a browser): the most recent other tab you were at. PLATO remembers up to 20.
- NEXT1 (`cmd-]`): the first blocked agent (longest waiting), else the oldest agent that is done but not seen, never the current one. PLATO gives Herdr the same agent order, so `cmd-]` sits where Herdr's next agent was. Herdr's pane zoom moves from `cmd-shift-enter` to `cmd-shift-z` in this layout.

Arrival: when the current tab changes, the banner, the strip, NOW AT and the route show where you came from. The arrival clears after 4 seconds, or as soon as you send a prompt there.

Last prompt: the agent's hook records your last prompt and its time on the terminal, and NOW AT shows it.

### SIGN-ON, SIGN-OFF and CLOSE UP

SIGN-ON (`cmd-n`) opens a modal dialog with three fields: name, folder and due date.

- Tab and ↓ go to the next field. Shift-Tab and ↑ go to the one before.
- The name field takes only a name. → at its end puts the space at the end of the line, not in the first free letter. A click on the "where" line does the same.
- The folder field is optional and takes `~/…`, `/…` or a path in the home folder. SIGN-ON checks only that the typed folder exists, and never looks for one on its own. An empty folder starts the space in the home folder.
- "choose…" or `cmd-o` opens the system folder picker. A chosen folder fills the field, and a cancel keeps it.
- NEXT waits with "Checking the folder…" while the check runs, and stops with "There is no folder …" for a missing one.
- The due date takes `2026-11-27`, `11/27`, `27`, `fri` or `+5`.
- NEXT opens the space, at the letter that SIGN-ON showed. BACK or Esc cancels.

SIGN-OFF (`cmd-alt-w`) shows a summary first.

- NEXT goes to the first tab of the next space and closes the space.
- NEXT1 closes it and goes to the NEXT1 agent.
- `U` on a space in the middle closes up the line instead.
- BACK keeps the space.

CLOSE UP (`cmd-u`) opens the same dialog on a third page. It lists the free letters that come off, and each space that moves. Only NEXT closes up the line, at once. BACK, Esc or `cmd-u` again closes the page. A close-up drops all free letters and reletters the rest. A moved space shows "was f" for 24 hours.

While SIGN-ON or SIGN-OFF is open, NEXT, BACK, NEXT1 and CLOSE UP act on the dialog, not on the line.

### AGENDA and LOOK

AGENDA (`cmd-shift-a`) shows the agenda in place of the route and the work area, and DUE in place of TODAY and FILES.

- The agenda takes the keyboard as it opens.
- The arrows move the cursor without wrapping, and Enter goes to the tab under it. Enter on a free letter opens SIGN-ON for that letter.
- Letters and digits do nothing in the agenda. JUMP (`cmd-j`) finds a tab by its code, and opens over the agenda.
- Esc or `cmd-shift-a` closes the agenda and gives the keyboard to the current pane.
- With the agenda open, LAB adds a tab to the space under the cursor, and SIGN-OFF opens for that space. NEXT, BACK, NEXT1, SIGN-ON and SIGN-OFF close the agenda first.

LOOK: the Space bar opens LOOK on the tab under the cursor, as a modal dialog. The card shows the code, space and tab, the program, the state with its time, and whether NEXT or NEXT1 goes there. Under that are the purpose in full with its source, and the first prompt if it differs. Then come the last prompt you sent and when, the folder, the space's tabs and due date, today's run time, and running sub-agents. Enter goes to the tab. The arrows step to the next card: along the line, or from SIGNALS through the waiting agents in NEXT1 order. `cmd-e` sets that tab's purpose. When LOOK closes, the agenda takes the keyboard back.

The cascade: when the agenda opens, TODAY's columns are hidden at first, then fade in one after another (45 ms steps, 90 ms fade). When the window is not active, the agenda skips it.

The agenda's data comes from the day record. When the agenda opens, it reads today, and each of the four days before once, because a past day does not change. While it is open, it reads today again only after the record changes.

### TREE

`cmd-shift-t` gives every other space one-line tab rows instead of a row of dots. A row is 28 px, with an 8 px lamp and `code program state`, for example `a1 claude idle`. Titles are often too long for one line, so the rows leave them out. The current space keeps its full rows.

Each space with rows gets its own branch. NEXT1 ends at a compact row's lamp, and the NEXT ▼ tips onto it. The names of spaces have a background, so a branch never strikes through them. The title note reads `TREE ⌘⇧T  AGENDA ⌘⇧A`, with TREE in reverse video while on.

### JUMP

`cmd-j` opens a 1280 by 640 px dialog that lists every tab.

- If JUMP opens over the agenda and closes without going, the agenda takes the keyboard back, as it does after LOOK.
- A tab that the query names as a code or a space letter comes first. Then come the groups: waiting (NEXT1 order), working and idle (line order).
- Each word of the query must appear in the tab's code, space, name, program, purpose or folder, and the matched letters light up.
- The field has the same editing keys as the SIGN-ON fields. ctrl-a and ctrl-e go to the start and the end. ctrl-b and ctrl-f move one letter, and alt-b and alt-f one word. ctrl-d and ctrl-h delete a letter, alt-d the next word and ctrl-w the word before. ctrl-k deletes to the end and ctrl-u to the start.
- ctrl-n and ctrl-p move as the arrows do. Tab and shift-Tab step the group. Esc and ctrl-g close.
- The right side is the selected tab's LOOK card, the same card as in LOOK.
- Enter, or a double click on a row, goes to the tab.

### The ⌘K panel (KEYS)

`cmd-k`, then one plain letter, runs any PLATO command. The panel covers the whole window, with no frame and no dimming.

- It draws nothing for 500 ms. Then it draws the panel at the bottom, 40 px above the window's edge, so the keyset stays in view.
- A letter runs its row: a PLATO command, or Herdr's ZOOM or RENAME TAB. Esc and ctrl-g cancel. A modifier alone does nothing. A key with `cmd`, `ctrl` or `alt` held is undefined.
- A row closes the panel, then runs.
- An undefined key closes the panel, and the banner says "⌘K q is undefined" for 2 seconds.
- A chord that `keys.json` binds is not a panel key. The panel passes it to Herdr and closes, with no notice.
- A left or right click beside the panel closes it. A right-click on the panel does nothing.
- The panel closes once it loses the keyboard.

In the agenda, the panel's header names the space and tab under the cursor. `e`, `d`, `l`, `k` and `r` act on them. So `r` renames the tab under the cursor, as the right-click RENAME TAB does. If the panel closes without running a row, the agenda takes the keyboard back. After a row it does not, so HELP, TERM or the rename keeps the keyboard.

### The day record

PLATO records the day while the layout is shown, in every view. The events are `open`, `close`, `line`, `agent` and `focus`, in one file per day under the app home.

- It compares the world every second, and writes only on a change. It records in every view, so the agenda and FOCUS leave no gap.
- A new day is written at once, with the world at midnight.
- When Herdr quits, it writes a `close`. A mod reload writes no `close`, so a session without one runs to the next `open`. Each `open` is followed by a full snapshot.
- It deletes day files older than 60 days.

TODAY reads today's file at three times: as it starts, after each change, and at the turn of the day. A read caught in the middle of a write is shorter than the last one, so TODAY keeps the last one. Waits on you are rebuilt per agent from the `agent` events.

### FOCUS, GLOW, HELP and the rest

- FOCUS (`cmd-shift-f`): hides the right column and narrows the route to 56 px, or brings both back to 260 px.
- GLOW (`cmd-shift-g`, or a click on PLATO): steps the theme: tokyo (the default), kanagawa, mocha, nord, orange, amber, green, white, then tokyo.
- HELP (`cmd-/`): a dialog with two screens, KEYS and WORDS, shown one at a time ("HELP · KEYS WORDS · 1 of 2").
  - KEYS has one short line per key and a MOUSE line ("Right-click: a menu. Hover: a tab's detail."). It includes Herdr's picker and TERM, Herdr's command palette. It also has RENAME (shift-F2) and RENAME TAB (F2). A renamed space keeps its letter.
  - WORDS explains the letter, the code, the free letter, the route's marks, SIGNAL, the agenda and JUMP.
  - → or Enter goes on, ← back, and 1 or 2 straight there, as does a click on a name. The footer names the next screen.
- TERM (`cmd-shift-p`): the command palette.
- LAB (`cmd-l`): the new-tab menu, which adds a tab to the space.
- CLOSE (`cmd-w`): closes open PLATO dialogs, else the tab.
- FILES follows the git root of the focused terminal's folder. A click on a file opens it in a viewer pane to the right: Markdown rendered, other text plain.

## Built from

### The layout and the mod

- `layouts/plato.json`: a column of banner, main row and keyset.
  - The main row has the stack `plato-main` and the column `right`.
  - The stack shows `line-view` or `agenda-view`. `line-view` is the route block and a `{ "tab": "active" }` block with the strip header and `lone: true`.
  - The column `right` has SIGNALS (role `signals`, mode `signals`), NOW AT and the stack `box`. The stack shows TODAY and FILES, or DUE (role `signals`, mode `due`).
  - The root sets `"titlebar": "none"`, `"traffic_lights": [12, 9]`, the theme `plato-tokyo` and `ui_font` IBM Plex Mono.
- One mod, `plato`, in roles that the layout and overlays give in props: `route` (route, agenda, letters, moves), `strip`, `banner` (also the arrival line), `nowat`, `timetable` (TODAY), `signals`, `sign`, `keyset`, `help`, `files`, `viewer`, `menu`, `look`, `jump` and `keys`. Herdr sends each `plato.*` command to every copy, so `main.js` passes a command only to the role that owns it in `commands.js`. With no props (`herdr-app check`), every role is drawn once.
- Pure logic with Node tests: `line.js` (letters, tabs, moves, arrival), `agenda.js`, `overview.js`, `day.js` (the day record and TODAY), `sign.js`, `glow.js`, `stripdata.js` (the strip's git state and step), `leader.js` (the ⌘K letters), `lookdata.js` (the LOOK card) and `logic.js` (FILES, the keyset, HELP).
- Herdr data functions: `spaces`, `panes`, `agents`, `focused`, `terminals`, `machines`, `layout`, `theme`, `keys`, `shared`, `props`, `window`, `home`, `appHome`.
- Herdr action functions: `setShared`, `run`, `exec`, `openOverlay`, `closeOverlay`, `setAgentOrder`, `readTextFile`, `watchFolder`, `nextCommand`, `pickFolder`.
- Commands: `space.select`, `space.new`, `space.close`, `space.move`, `space.rename`, `tab.select`, `tab.new`, `tab.close`, `tab.rename`, `pane.focus`, `pane.zoom`, `agent.focus`, `layout.select`, `layout.hide`, `layout.show`, `layout.resize`, `app.theme`, `app.palette`, `mod.open:picker`.
- Programs run: `git rev-parse` (the project folder), `git --no-optional-locks status --porcelain=v2 --branch` (the strip), `ls -1Ap` (the tree), `sh` (to check a typed sign-on folder with `[ -d ]`) and `hc label` (SET PURPOSE).
- Files: `plato-data/YYYY-MM-DD.json` under the app home, written with `fs/promises`.
- Art: the `layouts/plato.svg` preview, and IBM Plex Mono in `mods/plato/fonts/`.

### Shared state

- `plato.line`: the line, a list of slots `{letter, space, name, folder, opened, due}`. Only the route role writes it, in render. With no change, it writes nothing. The route also keeps `plato.line.back`, the BACK1 list of up to 20 tabs, and moves Herdr's spaces into letter order with `space.move`.
- `plato.arrival`: after a change of the current tab, the nowat role sets it with from, to, the time and the target's `plato.last_at`. The banner role clears it after 4 seconds, or as soon as `plato.last_at` changes.
- `plato.pending` {name, letter, due}: SIGN-ON's NEXT sets it and runs `space.new`, and the route gives the new space the pending letter.
- `plato.closeup`: SIGN-OFF's `U` sets it with the space. CLOSE UP's NEXT sets it with no space, so the route applies it at once.
- `plato.sign.key`: dialogs get no key commands, so the route forwards NEXT, BACK, NEXT1 and close-up to SIGN-ON or SIGN-OFF through it. If a key waits for more than a second, the dialog is gone, so the route forgets it and does the move.
- `plato.agenda`: {at} while the agenda is open, and `cur`, what its cursor is on (`agendaCur` in `agenda.js`), for the ⌘K panel. The view is `r.agendaView` on the route, "today" after a reload.
- `plato.look`: names LOOK's terminal while LOOK is open, so `cmd-e` sets that tab's purpose.
- `plato.route.tree`: TREE on or off.
- `plato.today.span`: TODAY's window, from `SPANS` in `day.js`.
- `plato.notice` {text, at}: the ⌘K panel's undefined-key notice. The banner shows it for `NOTICE_MS` (2000 ms, `noticeLive` in `logic.js`), and its one-second check clears it.
- `plato.keys.back` {at}: if the ⌘K panel closes without running a row, it writes this, and the agenda takes the keyboard back.

### Labels on terminals

- `plato.last` and `plato.last_at`: your last prompt and its time, written by the agent's hook (`hooks/claude-plato-last.sh` for Claude Code).
- `plato.purpose_yours`: your purpose. SET PURPOSE runs `hc label <terminal> plato.purpose_yours=<text>` (`purposeArgs` in `sign.js`).
- `plato.step`, `plato.step_at`, `plato.tasks`: the step labels, an interface for any agent. The strip hides a step older than `plato.last_at`. `hooks/claude-plato-step.sh` writes them for Claude Code, on PreToolUse and on PostToolUse for TodoWrite. `install.sh` gives it a 2 s timeout, because Claude Code waits for it before every tool call. The hook and `stepWords` turn control characters into spaces.

### Where each part lives

- The banner: the glow name from `glowWord` in `glow.js`. A click on the count runs `plato.next1`. GLOW steps the theme with `app.theme`.
- The route: the WAITING tag goes to `waitingIn` in `line.js`, by NEXT1's own `agent.focus`. TREE rows come from `routeRows(…, tree)`. BACK is `prevStop`.
- Hover detail: `hoverable`, `hovered` and `detailBlock` in `agendaview.js`, with the words from `hoverDetail` in `overview.js` and `purposeSource` in `line.js`. `on_hover` sets the route view's own `hoverKey`.
- Right-click menus: `on_mouse_down("right")` (`rightClick` in `agendaview.js`) opens the `menu` role as a popup overlay at the pointer (`openMenu` in `route.js`). A pick sends `plato.pick:<json>` with the item and its target (a letter or a code, and in the agenda the column and row). `spaceMenu` and `tabMenu` in `logic.js` build the items, and `keyText` in `keys.js` gives the keys. `menuPick` in `route.js` runs a pick, the same code as the key.
- The strip: `gitWords` and `stepWords` in `stripdata.js`. The branch is from Herdr's `PaneInfo.branch`. The counts are from `parseGit`. The strip runs `git status` with `exec` on the space's machine, with a 5 s timeout, one call at a time. A 1 s check runs it when due. The step has flex basis 0, so it is cut first.
- SIGNALS: a click runs `plato.go:<terminal>`, which the route takes.
- TODAY (role `timetable`): `SPANS` in `day.js`, and the command `plato.span` does what the click does. When the window starts before midnight, TODAY reads the earlier day file it needs (`daysBefore`) once and joins it in front of today's. TODAY uses Herdr's box-and-inset pattern for its scroll.
- The keyset: `KEYS` in `keys.js`. It pads itself by the widths it reads from `layout()` (`keysetPad`).
- The agenda: `layout.select` shows `agenda-view` in the stack `plato-main` and `box-agenda` in the stack `box`. The agenda copy of the route role takes the keyboard for 1.5 seconds after opening. With the agenda open, LAB runs `tab.new` on the space under the cursor. `plato.type:<keys>` types into an open agenda, with names such as `<down>` and `<space>` for named keys.
- TODAY in the agenda: `agendaview.js`. The head lines are `columnWords` in `agenda.js`. The day box runs on `dayAxis` and `yAt` in `day.js`, with its marks from `dayBlocks` in `agenda.js`. The time comes from `daySegs` in `day.js` and `letterEntry` in `agenda.js`, from `opened` in the line. The box height is from `viewport_size()` and the zoom, less `AGENDA_CHROME`. `fitColumns` and `columnWindow` choose the columns. The totals line is `totalsLine`.
- WEEK: `agendaweek.js`, which the route passes to `agendaview.draw`. The days are `weekDays` and `weekGrid` in `agenda.js`, and the totals `weekTotals`.
- Under the views: `bottom` in `agendaview.js`. DUE: `dueList` and `tabTotals`.
- The dialogs: the boxed caps are `keyRow` in `signpage.js`, and a click runs `act`. SET PURPOSE (`plato.purpose`) and SET DUE (`plato.due`) use the sign role, with the pages `purpose` and `due`. SET DUE reads dates with `parseDue`, and runs `plato.due:<letter>=<YYYY-MM-DD>`, or `plato.due:<letter>=` for a blank line (`dueCommand` in `sign.js`). The route alone writes the line, so it applies the date with `setDue` in `line.js`.
- SIGN-ON: the route role opens the sign role. The folder field uses `folderPath`, and "choose…" opens Herdr's `pickFolder`. `plato.sign-on <path>` puts the path in the folder field and its last part in the name field (`signOnTarget`). SIGN-OFF closes a space with `space.close {confirmed: true}`. CLOSE UP is the command `plato.close-up`, and its list is `closeUpPlan` in `sign.js`.
- NEXT1: `agent.focus`, and the route sets Herdr's agent order to the same list with `setAgentOrder`.
- LOOK: the look role (`lookpage.js`). Its words come from `lookCard` in `overview.js`, and the card from `lookCardFor` in `lookdata.js`. Enter sends `plato.goto:<code>`, and the arrows step with `lookStep`.
- JUMP: the `jump` role in `jumppage.js`. The route role opens it with `toggleDialog`: the agenda copy while the agenda is open, else the line copy (`dialogOpen` in `keys.js`). `jumpList` in `overview.js` lists every stop: first `jumpCode`, then the groups, with waiting from `signalRows`. `matchSegs` lights the matches. The field uses `editLine` from `sign.js`. Tab steps the group with `jumpGroupStep`. Enter runs `plato.goto:<code>`. `herdr-app do plato.jump:test` opens JUMP with "test" typed, for scripts and checks.
- The ⌘K panel: `cmd-k` runs the command `plato.keys`. The keyset role opens the `keys` role (`keyspage.js`) with `toggleDialog`, as a `window` overlay with `frame: "none"`. It waits `PANEL_MS`. The letters are `LEADER` in `leader.js`, and `leaderKey` says what a key does. A row runs `perform(cmd)` from `keys.js`, or a Herdr command (`pane.zoom`, `tab.rename`). `r` runs `plato.rename-tab`. The panel checks its focus each `BEAT_MS`.
- The day record: `recorder.js`, a helper of the banner, records to `plato-data/YYYY-MM-DD.json`. It compares the world in each banner render and on the banner's one-second timer (`recordStep` in `day.js`). `main.js` passes Herdr's close hook to each role's `quit()`, and the banner's writes the `close` event. `recorder.js` deletes old files (`KEEP_DAYS` and `oldDayFiles` in `day.js`). TODAY reads again after each change in `plato-data`. A short read is caught by `freshDay`, and waits are rebuilt by `waits` in `day.js`.
- FOCUS: `layout.hide` on `right` and `layout.resize` of `route` to 56 px, or back to 260 px. The route reads `layout()`, and if `right` is hidden, it draws its slim column.
- HELP: `herdr-app do plato.help:words` opens HELP on WORDS, for scripts and checks. RENAME is `space.rename` and RENAME TAB is `tab.rename`. A renamed space keeps its letter because the line keeps space ids.
- Colors: the default theme is set in `layouts/plato.json`. A lamp is filled by `lit` in `look.js`.

## Watch out

- `herdr-app shot` returns the last drawn frame. While the window is in the background, Herdr draws few frames. A `setShared` in one mod reaches the others only on the next frame, so take two shots and keep the second.
- In the background, animations stall. A move made by a script can be missed by NOW AT, so no arrival shows. If the window is not active, the agenda skips its cascade. Otherwise the columns can stay hidden.
- If nobody named a tab, its label is the terminal's title. Titles can carry private work details. Before a public screenshot, name the tabs.
- Herdr's theme `foreground` for panels is near white. Use the theme's `accent` for panel text.
- After `space.select`, `focused().pane` still names the old space's pane. Focusing it switches back. Focus a pane of the new space instead.
- A mod cannot import from another mod's folder. Make the panels roles of one mod, so they share files. Then keep the roles apart by rule. A role never imports another role (`test/layers.test.mjs`). Every shared key is named once in `shared.js`, with its writers and readers (`test/shared.test.mjs`).
- Dialogs get no key commands. Send keys to a dialog through shared state, which redraws every copy.
- Panels hidden with `layout.hide` get no key commands either. The route owns NEXT, BACK, NEXT1, BACK1, JUMP, TREE and the agenda, so FOCUS narrows the route and never hides it. NOW AT is hidden in focus mode, and it records arrivals, so no arrival shows there.
- A mod cannot move the keyboard focus while it draws. Start such work in `cx.timer.after(0)`. If the next render comes first, Herdr can drop a timer started from render. Do shared writes in render itself. Write only what changed, so the redraw writes nothing.
- A mod command can carry text after a colon: `plato.sign-on:<path>` and `plato.type:c3` arrive whole.
- Switch views with layout stacks and `layout.select`. A `{ "tab": "active" }` block in a hidden stack child comes back as it was.
- `.frames` loops forever on a clock that all views share. For a one-time fade, use `.opacity` with `.transition` and a delay.
- Give agenda columns `overflow_hidden`, or long text sets their width and the last columns run off the right.
- `overflow_*_scrollbar()` wraps the element, so sizes such as `flex_1().min_h(0)` on it never reach the layout. The element grows to its content, and nothing scrolls, in either direction. Do as Herdr's `changes` panel does. A box takes the flex size (`flex_1().min_h(0).relative()`). The scroll area inside it is `absolute().inset_0()` with plain `overflow_y_scroll()`. A `Scrollbar.vertical(<same id>)` lies on top. The agenda scrolls up and down this way, and pages its columns sideways.
- A mod reads no zoom, so the agenda takes it from `rem_size()`, which is 13 px times the zoom.
- gpui-kit's `Popover` with `mouse_button("right")` did not open in a PLATO panel. Make a right-click menu as Herdr's tabs mod does: `on_mouse_down("right")` and `openOverlay({ kind: "popup" })` with a menu view.
- `.tooltip()` takes only a string, and draws it in Herdr's own style. gpui-kit's `HoverCard` showed nothing in a PLATO panel, as `Popover` did not open. For hover detail, use `on_hover`, and draw it in a panel you already have, as the readout does.
- `fs/promises` has no append and no stat. Write the day file whole, and only on a change.
- Each `openOverlay` dialog stacks and dims the window again. A key that opens a dialog has to remember it and close it on the next press. Make the dialog `modal`, so a click beside it cannot close it behind the mod's back.
- Herdr's own `terminal.peek` sends Esc to the peeked terminal, which interrupts an agent. `cmd-w` reaches `tab.close` for the tab underneath, so bind `cmd-w` to `plato.close`.
- Herdr gives a mod no way to read a terminal's text, so LOOK cannot show the agent's last reply. To show it, an agent can report its reply through a hook that sets a `plato.*` label, as the purpose hook does.
- If a dialog closes, Herdr does not call the mod's close hook. Do not keep shared state that only a close can reset.
- A mod's focus handle can report focus after the person clicks back into a terminal. Do not rely on `is_focused()` alone to end a mode.
- A recursive `watchFolder` on a large project redraws often. Refresh only for changes in shown folders, and never watch the home folder.
- Herdr does not follow symlinks for live reload. Keep the real files in Herdr's folder, and copy them back with `sync.sh`.
- If the shell comes back to the foreground, the agent state from OSC 7501 clears. A fake agent for a test must keep a program running, for example `printf '\033]7501;state=blocked\007'; sleep 900`.
- `hc send` from an agent's terminal wraps the text in `<hc>` tags. Unset `HC_TERMINAL_ID` to type plain text.

## Done when

- `herdr-app check mods/plato` passes, and so do `npm test` and `npm run lint` in the repo.
- `herdr-app do layout.switch --name plato` shows the layout, and `herdr-app status` lists no errors.
- Every space has a letter. A new space takes the first free letter. Closing a middle space leaves a free letter, and closing the last ones trims the line.
- NEXT visits every tab and wraps to a. BACK walks the line backward and wraps to the end. BACK1 returns to where you were. A blocked agent draws the NEXT1 run, and NEXT1 goes to it.
- After a jump, the arrival banner, the reverse-video strip and NOW AT's "changed" show. They clear after 4 seconds, or on a new prompt.
- `herdr-app do plato.sign-on` opens SIGN-ON, and NEXT opens a space at the letter it showed. SIGN-OFF closes the space only on NEXT or NEXT1.
- `herdr-app do plato.agenda` opens the agenda with DUE. `herdr-app do 'plato.type:<tab>'` switches to WEEK. `herdr-app do 'plato.type:<right><down>'` moves the cursor, and `type:<enter>` goes to the tab under it and closes the agenda.
- In the agenda, `herdr-app do 'plato.type:<space>'` opens LOOK on the tab under the cursor, and `plato.close` closes it.
- `herdr-app do plato.jump:test` opens JUMP with "test" typed, and the list shows only the tabs that match.
- `herdr-app do plato.keys` opens the ⌘K panel, and after half a second it draws the letters at the bottom. `plato.close` closes it. The person checks the letter keys by hand, because a script cannot press keys in an overlay.
- A pane in a git repo shows `⎇ <branch>` in its strip, and `●1` after a file changes. A pane outside git shows no git part.
- `herdr-app do plato.focus` narrows the route to its lettered squares and hides the right column, and a second call brings them back.
- `herdr-app do plato.glow` steps through all eight glows, and every panel recolors.
