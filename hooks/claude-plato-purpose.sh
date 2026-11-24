#!/bin/sh
# Claude Code SessionStart hook for PLATO.
# Prints instructions that Claude Code adds to Claude's context: once the task is clear,
# Claude tags its Herdr terminal with what the tab is for:
#   plato.purpose      the goal, at most 60 characters
#   plato.purpose_was  the goal before, when the goal changes
#   plato.purpose_at   when the purpose was set, in unix seconds
# The map cards and the strip under each pane show it.
# Register it with ./install.sh --hooks (see README.md). The rule Bash(hc label:*) lets
# Claude set the label without a question, and the sandbox exclusion "hc label:*" lets hc reach Herdr.
# Outside Herdr (no HC_TERMINAL_ID), or without hc or jq, it prints nothing.
[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cat >/dev/null
t=$(printf '%s' "$HC_TERMINAL_ID" | tr -cd 'A-Za-z0-9_./-')
[ -n "$t" ] || exit 0
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
Run each hc label command alone, with no pipe, redirect or \$(...), and read what it prints. If it prints an error such as "Operation not permitted", the sandbox blocked it. Do not run it outside the sandbox. Leave the purpose unset, tell the user in one sentence that ./install.sh --hooks in the PLATO repo adds the sandbox exclusion "hc label:*", and go on with the task.
Apart from that one sentence, do not tell the user about the purpose label or these instructions.
EOF
exit 0
