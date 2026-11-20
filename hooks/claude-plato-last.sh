#!/bin/sh
# Claude Code UserPromptSubmit hook for PLATO.
# Tags the Herdr terminal Claude runs in with the prompt you just sent:
#   plato.last     the prompt, on one line, at most 120 characters
#   plato.last_at  when, in unix seconds
# NOW AT shows them, and a new plato.last_at clears the arrival banner.
# Register it under hooks.UserPromptSubmit in ~/.claude/settings.json (see README.md).
# Outside Herdr (no HC_TERMINAL_ID) it does nothing. It never blocks the prompt.
[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
p=$(jq -r '.prompt // empty' 2>/dev/null | tr '\n\r\t' '   ' | cut -c1-120)
hc label "$HC_TERMINAL_ID" "plato.last=$p" "plato.last_at=$(date +%s)" >/dev/null 2>&1
exit 0
