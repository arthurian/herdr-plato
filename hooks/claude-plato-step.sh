#!/bin/sh
# Claude Code PreToolUse and PostToolUse (TodoWrite) hook for PLATO: the Claude Code writer
# of the step labels. Any agent can write these labels; the strip shows their text as it is.
#   plato.step     what the agent does now: the tool and its main argument, at most 60
#                  characters on one line ("Bash: npm test", "Edit route.js")
#   plato.step_at  when, in unix seconds
#   plato.tasks    after TodoWrite: done/total ("3/7"), empty for an empty list
# Claude Code runs PreToolUse before it asks for permission, so an agent that needs you
# shows the step it waits to run.
# Register it with ./install.sh --hooks (see README.md).
# Outside Herdr (no HC_TERMINAL_ID) it does nothing. It never blocks a tool and prints nothing.
[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
label=$(jq -r '
  def oneline: tostring | split("\n") | map(select(test("\\S"))) | .[0] // "";
  def base: tostring | split("/") | last // "";
  def clean: explode | map(if . < 32 or . == 127 then 32 else . end) | implode | gsub("\\s+"; " ") | ltrimstr(" ") | rtrimstr(" ") | .[0:60];
  .tool_name as $t | (.tool_input // {}) as $i |
  if .hook_event_name == "PostToolUse" then
    if $t == "TodoWrite" then
      ($i.todos // []) as $todos
      | "plato.tasks=" + (if ($todos | length) == 0 then "" else "\($todos | map(select(.status == "completed")) | length)/\($todos | length)" end)
    else empty end
  else
    "plato.step=" + ((
      if $t == "Bash" then "Bash: " + ($i.command // "" | oneline)
      elif ($t | IN("Edit", "MultiEdit", "Write", "Read", "NotebookEdit")) then "\($t) " + ($i.file_path // $i.notebook_path // "" | base)
      elif ($t | IN("Grep", "Glob")) then "\($t) " + ($i.pattern // "" | oneline)
      elif $t == "WebFetch" then "WebFetch " + (($i.url // "") | (capture("^[a-zA-Z]+://(?<h>[^/:?#]+)").h? // .))
      elif $t == "WebSearch" then "WebSearch " + ($i.query // "" | oneline)
      elif ($t | IN("Task", "Agent")) then "Agent: " + ($i.description // "" | oneline)
      elif ($t | startswith("mcp__")) then ($t | split("__") | last)
      else ($t // "") end
    ) | clean)
  end
' 2>/dev/null) || exit 0
case "$label" in
  plato.step=?*) hc label "$HC_TERMINAL_ID" "$label" "plato.step_at=$(date +%s)" >/dev/null 2>&1 ;;
  plato.tasks=*) hc label "$HC_TERMINAL_ID" "$label" >/dev/null 2>&1 ;;
esac
exit 0
