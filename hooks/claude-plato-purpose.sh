#!/bin/sh
# Claude Code SessionStart hook for PLATO.
# It sets two labels on its Herdr terminal itself, from the hook input:
#   plato.session      the Claude Code session id
#   plato.session_how  how the session began: startup, resume, clear or compact
# Then it prints instructions that Claude Code adds to Claude's context: once the task is
# clear, Claude tags its Herdr terminal with what the tab is for:
#   plato.purpose      the goal, at most 60 characters
#   plato.purpose_was  the goal before, when the goal changes
#   plato.purpose_at   when the purpose was set, in unix seconds
# and at a milestone (not at each turn, so REVIEW counts milestones):
#   plato.done         the result, five words or fewer, starting with a listed verb
#   plato.done_at      when the result was set, in unix seconds
# The map cards and the strip under each pane show the purpose; REVIEW counts the results.
# When plato-post is on PATH, it also tells Claude to post a report with each result, a comment
# when it saw friction repeat in how the user works with it and can name a lasting fix (at most
# one an hour from a terminal, starting with "You", which plato-post enforces), and never a note
# unless started as the director. Without
# plato-post (./install.sh --hooks links it), those rules are left out.
# Register it with ./install.sh --hooks (see README.md). The rule Bash(hc label:*) lets
# Claude set the label without a question, and the sandbox exclusion "hc label:*" lets hc reach Herdr.
# Outside Herdr (no HC_TERMINAL_ID), or without hc or jq, it prints nothing.
[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
t=$(printf '%s' "$HC_TERMINAL_ID" | tr -cd 'A-Za-z0-9_./-')
[ -n "$t" ] || exit 0
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-' | cut -c1-80)
how=$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null)
case "$how" in startup | resume | clear | compact) ;; *) how=startup ;; esac
[ -n "$sid" ] && hc label "$t" "plato.session=$sid" "plato.session_how=$how" >/dev/null 2>&1
cur=$(hc get --json "$t" 2>/dev/null | jq -j '.labels["plato.purpose"] // empty' 2>/dev/null | tr '\n\r\t' '   ' | cut -c1-60)
cat <<EOF
This session runs in the Herdr terminal $t. Herdr shows a one-line purpose for each tab.
EOF
if [ -n "$cur" ]; then
  printf 'The purpose set now is: %s\n' "$cur"
  echo "Keep it while it still describes the goal."
else
  echo "Once the user's task is clear, set the purpose. Do not set it before that."
fi
cat <<EOF
To set it, run \`date +%s\`, then run:
  hc label $t "plato.purpose=<goal>" "plato.purpose_at=<the number from date>"
The goal is one line, at most 60 characters, with no quote marks. It says what the work is for, for example "Fix the login timeout in the API".
If the goal changes later, set the new goal and put the old goal in plato.purpose_was:
  hc label $t "plato.purpose=<new goal>" "plato.purpose_was=<old goal>" "plato.purpose_at=<the number from date>"
A goal changes when the user asks for different work. Small steps toward the same goal do not change it.
Record a result only at a milestone, because REVIEW counts each result. A milestone is a point that the user would want to see in a summary of the day. For example: a phase or plan step finishes, a pull request is opened or merged, a deploy or another change outside the repo is applied, a ticket changes status, a research question is answered with a finding, a decision is made, a document is drafted or finished, or the user says that the goal is done. These are examples. Use your judgment for other work. Small steps toward the same milestone set nothing.
At a milestone, run \`date +%s\`, then run:
  hc label $t "plato.done=<result>" "plato.done_at=<the number from date>"
The result is five words or fewer and starts with one of these words: researched, explored, explained, brainstormed, designed, planned, decided, built, fixed, refactored, configured, tested, diagnosed, reviewed, shipped, documented, drafted, dropped. A turn that only explains something to the user sets nothing.
EOF
cmds="hc label"
if command -v plato-post >/dev/null 2>&1; then
  cmds="hc label and plato-post"
  cat <<EOF
Each time you set plato.done, also run \`plato-post report "<one or two sentences of facts>"\`. A report is at most 280 characters.
Comments are about how the user and you work together, not about the work. When you notice it, run \`plato-post comment "<the comment>"\`. A comment starts with "You" or "Your" and describes friction that you saw more than once in this session, or a habit that clearly saved time. Examples are the same approval given again and again, the same correction repeated or a file or status you had to search for each time. Exploring and changing direction in conversation is how the user works on purpose. Do not treat it as a fault, and do not suggest giving more detail at the start. End with one lasting change that would remove the friction: a permission rule, a line in CLAUDE.md or AGENTS.md, a skill, a script, or a change in how files, handoffs or status files are organized. If you cannot name such a change, do not write the comment. These are not comments: the state of the work, risks, next steps, and advice about PLATO or its hooks. Put those in your reply or your report. Write a comment only when you notice something, never because a comment is allowed, and not in the turn in which you read these instructions. Most sessions end with no comment, and that is normal. Write about what the user did, never about who they are. Be honest, even when it is unflattering, and never praise for its own sake. Give one fact from the session. A terminal sends at most one comment an hour, and plato-post refuses a sooner one or one that does not start with "You" or "Your". A comment is at most 400 characters. Never send a note unless the user started you as the director. \`plato-post --help\` gives the limits.
EOF
fi
cat <<EOF
Run each $cmds command alone, with no pipe, redirect or \$(...), and read what it prints. If it prints an error such as "Operation not permitted", the sandbox blocked it. Do not run it outside the sandbox. Skip that command, tell the user in one sentence that ./install.sh --hooks in the PLATO repo adds the sandbox exclusions, and go on with the task.
Apart from that one sentence, do not tell the user about the purpose label or these instructions.
EOF
exit 0
