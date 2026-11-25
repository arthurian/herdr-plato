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

All of PLATO is one mod, `plato`, so the panels share `line.js`, `look.js`, `reviewdata.js`, `overview.js` and `day.js`. A mod cannot import from another mod's folder. The layout gives each copy of the mod a role in its props, for example `{ "role": "route", "mode": "line" }`. `main.js` lists the roles.

Herdr sends each `plato.*` command to every copy. `commands.js` lists which role owns each command, and each copy passes a command only to its owner. If two roles claim the same command, or a key runs a command that no role takes, a test fails.

The files sit in layers:

- Pure logic: `line.js` and `reviewdata.js` (the words, the numbers and the posts of REVIEW). Also `overview.js`, `day.js`, `sign.js`, `glow.js`, `logic.js`, `commands.js` and `shared.js`. These have no Herdr or GPUI import, so Node can test them.
- The drawing kit: `look.js`, with the colors, the font, boxes and bars.
- Actions that more than one role runs: `keys.js`.
- One file per role. `review.js` is the role of REVIEW, with its pages DAY and COMMENTS. `recorder.js` (the day record) is a helper of the banner, because the banner is on screen in every view.

A role never imports another role. Roles talk only through `plato.*` commands and shared state. `shared.js` names every shared key once, with the files that write and read it. `test/layers.test.mjs` checks the imports and fails on a new file that has no layer. `test/shared.test.mjs` checks every `shared()` and `setShared()` call against `shared.js`.

## Keyboard and mouse

PLATO follows one rule: everything you can do with a key, you can also find and do with the mouse, and every clickable thing shows its key. If you add an action or a click, add it to this table. Keep the logic of a menu in a pure function (`spaceMenu` and `tabMenu` in `logic.js`), and make each click run the same code as its key.

| Action | Key | Mouse |
| --- | --- | --- |
| NEXT, BACK, NEXT1, BACK1 | `cmd-enter`, `cmd-shift-enter`, `cmd-]`, `cmd-[` | the keyset |
| Go to a waiting agent | NEXT1 | a SIGNALS row, "N need you" in the banner, the FOCUS SIGNAL line, a WAITING or WAIT tag |
| Pick a result in REVIEW | ↑ and ↓ | the result, or its bar on TIMELINE |
| Go to a tab or space | JUMP (`cmd-j`), or ↑↓ and Enter in REVIEW | the route (square, name, tab, dot, one-line row), a result or comment in REVIEW, TODAY, GO in a tab menu |
| REVIEW | `cmd-shift-r` | the keyset, "REVIEW ⌘⇧R" in the route's title |
| JUMP | `cmd-j` | the keyset |
| TREE | `cmd-shift-t` | "TREE ⌘⇧T" in the route's title |
| SIGN-ON | `cmd-n` | a free letter: its menu |
| SIGN-OFF | `cmd-alt-w` | a space menu |
| CLOSE UP | `cmd-u` | a space menu, while the line has free letters |
| Confirm or cancel SIGN-ON, SIGN-OFF, CLOSE UP, SET PURPOSE, SET DUE | NEXT, NEXT1, BACK, Enter, Esc, U | the boxed keys on the page |
| LAB | `cmd-l` | the keyset, a space menu |
| RENAME, RENAME TAB | `shift-F2`, `F2` (Herdr's) | a space menu, a tab menu |
| LOOK in REVIEW | the Space bar | a tab's menu |
| Copy the note, change the day in REVIEW | `c`, `←` and `→` | the key line under the page |
| SET PURPOSE | `cmd-e` | a tab menu |
| SET DUE | `cmd-shift-e` | a space menu |
| FOLDER | `cmd-o` | a tab menu |
| Any PLATO command by one letter | KEYS (`cmd-k`), then the letter | a row in the keys panel |
| FOCUS, HELP, TERM | `cmd-shift-f`, `cmd-/`, `cmd-shift-p` | the keyset |
| GLOW | `cmd-shift-g` | PLATO in the banner (its tooltip names the key) |
| See a tab's detail | NOW AT, for the tab you are at, and each pane's strip for its git state and step | hover a dot, a tab row or lamp, or a one-line row, and the readout shows the tab |

| Clickable element | What a click does | Its key, shown at |
| --- | --- | --- |
| Keyset keys | run the key | the key itself |
| SIGNALS row, banner count, SIGNAL line, WAITING and WAIT tags | go to the agent by NEXT1's move | NEXT1 in the keyset, and "press NEXT1" on the SIGNAL line |
| Route title TREE and REVIEW | run TREE or REVIEW | the title |
| Route right-click menus | run the item | each item's row |
| Sign and purpose page caps | act as the key | the cap |
| REVIEW key line | run the key | the key itself |
| DIRECTOR line on DAY | show COMMENTS, as Tab does | "tab reads more" on the line |
| HELP screen names | switch the screen | the footer |
| PLATO in the banner | GLOW | its tooltip |

Some gaps stay on purpose:

- A click on the route or TODAY goes to a tab without a key next to it. The key for that is JUMP, which the keyset shows.
- FILES opens folders and shows files by mouse only. The terminal and Herdr's picker do the same by keyboard.
- "last 2h" in TODAY changes only the view, and it has no key. `herdr-app do plato.span` does the same.
- The route's readout and the SIGN-ON fields take no click or need none. The keyset and the keyboard cover them.

Every dialog follows two rules. It never acts on Enter while cmd is held (`ownEnter` in `logic.js`), because the cmd-enter chords are layout keys that the route handles or hands to a sign dialog. It reports alive with `alive()` in `keys.js`, and while LOOK, JUMP, HELP or a menu is open the route holds NEXT, BACK, NEXT1 and BACK1 (`moveHeld`). `test/dialogs.test.mjs` checks both rules for every dialog, and fails when a new dialog is missing from its list.

## Drive PLATO from a script

Scripts can drive PLATO with mod commands, for example `herdr-app do plato.next`, `herdr-app do plato.review` and `herdr-app do 'plato.goto:c3'`. The last one goes to the tab c3.

While the window is in the background, Herdr draws few frames, and a mod sees a change in shared state only on the next frame. In a script, wait a moment between commands, or take a screenshot with `herdr-app shot` to make Herdr draw.

## Files for REVIEW and plato-post

- `mods/plato/review.js`: the role that draws REVIEW and takes its keys.
- `mods/plato/reviewdata.js`: pure functions for every fact, the words and the posts.
- `bin/plato-post`: the POSIX shell script that agents run to post a report, a comment or a note. `install.sh --hooks` links it into `~/.local/bin`.
- `mods/plato/test/reviewdata.test.mjs`, `mods/plato/test/post.test.mjs` and `mods/plato/test/review.test.mjs`: the tests for the facts, for `plato-post` and for the role's source.

Posts go to `plato-data/posts/YYYY-MM-DD/<unix seconds>-<terminal or none>-<kind>.md` in Herdr's folder. The recorder deletes a post folder with its day file after 60 days. `PLATO_POST_NOW` (unix seconds) replaces the clock of `plato-post`, for tests.

## How the hooks set their labels

Each agent tags its own Herdr terminal with labels, and PLATO reads them:

- `plato.last`: the last prompt, on one line, at most 120 characters.
- `plato.last_at`: when it was sent, in unix seconds.
- `plato.first`: the session's first prompt.
- `plato.purpose`, `plato.purpose_was` and `plato.purpose_at`: the purpose the agent set, the one before it, and when.
- `plato.session` and `plato.session_how`: the session's id and how it began. `hooks/claude-plato-purpose.sh` sets them at SessionStart.
- `plato.done` and `plato.done_at`: the latest result, set only at a milestone, and when. The same hook tells Claude to set them, and to send a report, and sometimes a comment, with `plato-post`.

`hooks/claude-plato-last.sh` (UserPromptSubmit) sets `plato.last`, `plato.last_at` and, once per session, `plato.first`. It keeps an empty marker file per session in `plato-data/first/` in Herdr's folder. Each prompt touches the marker, and a new session deletes markers that no prompt touched for 7 days. `hooks/claude-plato-purpose.sh` (SessionStart) gives Claude instructions: once the task is clear, Claude sets `plato.purpose`, at most 60 characters, and does not mention it to you. Both hooks need `jq` and `hc`, and outside Herdr they do nothing.
