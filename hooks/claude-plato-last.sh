#!/bin/sh
# Claude Code UserPromptSubmit hook for PLATO.
# Tags the Herdr terminal Claude runs in with the prompt you just sent:
#   plato.last     the prompt, on one line, at most 120 characters
#   plato.last_at  when, in unix seconds
#   plato.first    the session's first prompt, set once per session_id
# NOW AT shows plato.last, and a new plato.last_at clears the arrival banner. A tab's
# purpose falls back to plato.first when neither you nor the agent set one.
# A marker file per session, under plato-data/first/, records that plato.first is set. Each
# prompt touches it; a new session deletes markers no prompt touched for 7 days.
# Register it with ./install.sh --hooks (see README.md).
# Outside Herdr (no HC_TERMINAL_ID) it does nothing. It never blocks the prompt.
[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
p=$(printf '%s' "$input" | jq -j '.prompt // empty' 2>/dev/null | tr '\n\r\t' '   ' | cut -c1-120)
now=$(date +%s)
set -- "plato.last=$p" "plato.last_at=$now"
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-' | cut -c1-80)
if [ -n "$sid" ] && [ -n "$p" ]; then
  dir="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/plato-data/first"
  if [ -e "$dir/$sid" ]; then
    touch "$dir/$sid" 2>/dev/null
  elif mkdir -p "$dir" 2>/dev/null && : >"$dir/$sid" 2>/dev/null; then
    set -- "$@" "plato.first=$p"
    find "$dir" -type f -mtime +7 -delete 2>/dev/null
  fi
fi
hc label "$HC_TERMINAL_ID" "$@" >/dev/null 2>&1
exit 0
