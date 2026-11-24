# Developing PLATO

This page is for people who change PLATO's code. To use PLATO, read [README.md](README.md). `RECIPE.md` is the brief from which an agent can build PLATO from scratch.

## Set up

Run `npm install` once in the repo. It installs ESLint and turns on the pre-commit hook in `.githooks/`. Before each commit, the hook runs the logic tests, ESLint and shellcheck. If one of them fails, the commit stops. To skip the hook once, run `git commit --no-verify`.

To run the checks by hand:

```sh
npm test
npm run lint
```

ESLint catches a name that is used but not imported, in code that `herdr-app check` does not run, such as a click or a close.

## Edit, check and save

Herdr reloads a changed mod file at once, but it does not follow a symlink for this. So you edit the live files in `~/.config/herdr-app`, and you copy them into this repo before a commit:

```sh
./sync.sh
git status
```

`sync.sh` copies with `--delete`, so a file that is only in the repo is removed from it. Copy a new file into the live folder too.

Check the mod with Herdr. With no props, the check draws every role once:

```sh
herdr-app check ~/.config/herdr-app/mods/plato
```

Because all panels are one mod, saving any PLATO file reloads every PLATO panel.

## How the code is built

All of PLATO is one mod, `plato`, so the panels share `line.js`, `look.js`, `agenda.js`, `overview.js` and `day.js`. A mod cannot import from another mod's folder. The layout gives each copy of the mod a role in its props, for example `{ "role": "route", "mode": "line" }`. `main.js` lists the roles.

Herdr sends each `plato.*` command to every copy. `commands.js` lists which role owns each command, and each copy passes a command only to its owner. If two roles claim the same command, or a key runs a command that no role takes, a test fails.

The files sit in layers:

- Pure logic: `line.js`, `agenda.js`, `overview.js`, `day.js`, `sign.js`, `glow.js`, `logic.js`, `commands.js` and `shared.js`. These have no Herdr or GPUI import, so Node can test them.
- The drawing kit: `look.js`, with the colors, the font, boxes and bars.
- Actions that more than one role runs: `keys.js`.
- One file per role. `agendaview.js` (TODAY) and `agendaweek.js` (WEEK) are helpers of the route. `recorder.js` (the day record) is a helper of the banner, because the banner is on screen in every view.

A role never imports another role. Roles talk only through `plato.*` commands and shared state. `shared.js` names every shared key once, with the files that write and read it. `test/layers.test.mjs` checks the imports and fails on a new file that has no layer. `test/shared.test.mjs` checks every `shared()` and `setShared()` call against `shared.js`.

## Keyboard and mouse

PLATO follows one rule: everything you can do with a key, you can also find and do with the mouse, and every clickable thing shows its key. If you add an action or a click, add it to this table. Keep the logic of a menu in a pure function (`spaceMenu` and `tabMenu` in `logic.js`), and make each click run the same code as its key.

| Action | Key | Mouse |
| --- | --- | --- |
| NEXT, BACK, NEXT1, BACK1 | `cmd-enter`, `cmd-shift-enter`, `cmd-]`, `cmd-[` | the keyset |
| Go to a waiting agent | NEXT1 | a SIGNALS row, "N need you" in the banner, the FOCUS SIGNAL line, a WAITING or WAIT tag |
| Go to a tab or space | JUMP (`cmd-j`), or a code and Enter in the agenda | the route (square, name, tab, dot, one-line row), a tab or head in the agenda, TODAY, GO in a tab menu |
| AGENDA | `cmd-shift-a` | the keyset, "AGENDA ⌘⇧A" in the route's title |
| JUMP | `cmd-j` | the keyset |
| TREE | `cmd-shift-t` | "TREE ⌘⇧T" in the route's title |
| SIGN-ON | `cmd-n` | a free letter: its menu, or a click in the agenda |
| SIGN-OFF | `cmd-alt-w` | a space menu |
| CLOSE UP | `cmd-u` | a space menu, while the line has free letters |
| Confirm or cancel SIGN-ON, SIGN-OFF, CLOSE UP, SET PURPOSE, SET DUE | NEXT, NEXT1, BACK, Enter, Esc, U | the boxed keys on the page |
| LAB | `cmd-l` | the keyset, a space menu |
| RENAME, RENAME TAB | `shift-F2`, `F2` (Herdr's) | a space menu, a tab menu |
| PEEK (agenda) | the Space bar | an agenda tab's menu |
| SET PURPOSE | `cmd-e` | a tab menu |
| SET DUE | `cmd-shift-e` | a space menu |
| Any PLATO command by one letter | KEYS (`cmd-k`), then the letter | a row in the keys panel |
| FOCUS, HELP, TERM | `cmd-shift-f`, `cmd-/`, `cmd-shift-p` | the keyset |
| GLOW | `cmd-shift-g` | PLATO in the banner (its tooltip names the key) |
| See a tab's detail | NOW AT, for the tab you are at, and each pane's strip for its git state and step | hover a dot, a tab row or lamp, a one-line row, or a tab in the agenda: the readout shows it |

| Clickable element | What a click does | Its key, shown at |
| --- | --- | --- |
| Keyset keys | run the key | the key itself |
| SIGNALS row, banner count, SIGNAL line, WAITING and WAIT tags | go to the agent by NEXT1's move | NEXT1 in the keyset, and "press NEXT1" on the SIGNAL line |
| Route title TREE and AGENDA | run TREE or AGENDA | the title |
| Route and agenda right-click menus | run the item | each item's row |
| Sign and purpose page caps | act as the key | the cap |
| Agenda "◀ N more" | move the cursor | the ←↑↓→ cap in the bottom line |
| HELP screen names | switch the screen | the footer |
| PLATO in the banner | GLOW | its tooltip |

Some gaps stay on purpose:

- A click on the route, a tab in the agenda or TODAY goes to a tab without a key next to it. The key for that is JUMP, which the keyset shows.
- FILES opens folders and shows files by mouse only. The terminal and Herdr's picker do the same by keyboard.
- "last 2h" in TODAY changes only the view, and it has no key. `herdr-app do plato.span` does the same.
- The route's readout and the SIGN-ON fields take no click or need none. The keyset and the keyboard cover them.
- The key caps in the agenda's bottom line are labels, not buttons.

Every dialog follows two rules. It never acts on Enter while cmd is held (`ownEnter` in `logic.js`), because the cmd-enter chords are layout keys that the route handles or hands to a sign dialog. It reports alive with `alive()` in `keys.js`, and while LOOK, JUMP, HELP or a menu is open the route holds NEXT, BACK, NEXT1 and BACK1 (`moveHeld`). `test/dialogs.test.mjs` checks both rules for every dialog, and fails when a new dialog is missing from its list.

## Drive PLATO from a script

Scripts can drive PLATO with mod commands, for example `herdr-app do plato.next`, `herdr-app do plato.agenda` and `herdr-app do 'plato.type:c3'`. The last one types c3 into an open agenda.

While the window is in the background, Herdr draws few frames, and a mod sees a change in shared state only on the next frame. In a script, wait a moment between commands, or take a screenshot with `herdr-app shot` to make Herdr draw.

## How the hooks set their labels

Each agent tags its own Herdr terminal with labels, and PLATO reads them:

- `plato.last`: the last prompt, on one line, at most 120 characters.
- `plato.last_at`: when it was sent, in unix seconds.
- `plato.first`: the session's first prompt.
- `plato.purpose`, `plato.purpose_was` and `plato.purpose_at`: the purpose the agent set, the one before it, and when.

`hooks/claude-plato-last.sh` (UserPromptSubmit) sets `plato.last`, `plato.last_at` and, once per session, `plato.first`. It keeps an empty marker file per session in `plato-data/first/` in Herdr's folder. Each prompt touches the marker, and a new session deletes markers that no prompt touched for 7 days. `hooks/claude-plato-purpose.sh` (SessionStart) gives Claude instructions: once the task is clear, Claude sets `plato.purpose`, at most 60 characters, and does not mention it to you. Both hooks need `jq` and `hc`, and outside Herdr they do nothing.
