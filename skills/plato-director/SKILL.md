---
name: plato-director
description: Write the daily note for PLATO's REVIEW, the DIRECTOR'S NOTE on COMMENTS. It uses the day's reports, comments, tab purposes, results and commits, and it posts with plato-post after the user approves. Run it as /plato-director, with an optional day (YYYY-MM-DD).
disable-model-invocation: true
---

# PLATO director

You are the director for one day: today, or the day the user names (YYYY-MM-DD). PLATO lets only an agent that the user starts as the director post a note. This skill is that start. Write one note for that day, show it to the user, and post it only after they approve it.

PLATO keeps its data in `${HERDR_APP_HOME:-$HOME/.config/herdr-app}/plato-data`, the same folder that `plato-post` writes to. Below, `<data>` means that folder.

## Gather the day

If the Bash sandbox blocks these commands, run them outside it. Read every output.

1. The posts. List `<data>/posts/<day>/` and read every file. Each file has the header lines `kind` (report, comment or note), `terminal` and `time` (unix seconds), an empty line, then the text. If the day already has a note, tell the user, and treat the newest one as the draft to update, not as material: keep what still holds, add what came after its `time`, and change what moved. Look at the day again for every sentence, and do not copy a sentence only because the old note has it. REVIEW shows only the newest note, and the older files stay in the folder.
2. Who sent each post. Run `herdr-app ls` to map each terminal id to its space and tab. A terminal that is gone has no row: name it by its posts only. The terminal ids (such as t11c) are herdr ids, not the codes that REVIEW shows. To get each terminal's PLATO code (such as f1), run `jq -r '[.events[] | select(.a and .c) | {a, c}] | group_by(.a)[] | "\(.[0].a) \(.[-1].c)"' <data>/<day>.json`. Each line gives a terminal id and the last code that it held that day. Use these codes, never the terminal ids, in the note.
3. Each tab's purpose and result. For each terminal of the day, run `hc get --json <terminal>` and read the labels `plato.purpose`, `plato.purpose_was`, `plato.done` and `plato.done_at`. For an earlier day, use only the posts, because the labels show now.
4. The commits. For each terminal, take its folder from the `cwd` field of `hc get --json <terminal>` (the space folders in `herdr-app ls` are often not repositories). In each folder, run `git log --since=<day> --until=<day+1> --oneline --author="$(git config user.email)"`. Skip a folder that is not a git repository.

Apart from the code query in step 2, do not read the raw day record (`<data>/<day>.json`). It is hundreds of low-level events, and the DAY page of REVIEW already shows its facts.

## Write the note

- Connect the work. Say what moved, what is stuck and why, and how the parts of the day affected each other. Do not repeat the reports one by one: DAY already lists them.
- Use the comments. Say what they show about how the day went, together, in one or two sentences. Do not quote a whole comment.
- If two or more comments name the same friction, end the note with one concrete change that would remove it, for example a line for CLAUDE.md, a permission rule or a skill. Propose at most one change.
- Give no counts. REVIEW promises that code counts every number, so leave counts to DAY. A version number, a ticket or a PR number from a post is fine.
- Name tabs by their code and purpose, for example "c1 (the REVIEW revision)". Never name a person.
- Write plain English: short sentences, active voice, no praise for its own sake, no headings, no lists.
- Keep it between 600 and 1200 characters. plato-post refuses a note over 1500 characters, and never cuts it.
- The first sentence stands alone, at most 120 characters, because DAY shows it as the lead.
- If the day shows a clear next step, end with one sentence on what tomorrow can start with.

## Post it

Show the draft and its length to the user. Change it until they approve it. Then write it to a file in your temporary folder and post it:

```sh
plato-post note < "$TMPDIR/note.txt"                   # today
plato-post note --day 2026-11-24 < "$TMPDIR/note.txt"  # another day
```

Read what plato-post prints: the path of the new post, or an error. COMMENTS then shows the note under DIRECTOR'S NOTE, marked shareable, and the `c` key copies it.
