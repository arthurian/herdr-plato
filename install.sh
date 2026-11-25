#!/bin/sh
# Copy the PLATO layout, themes and mod (plato) into Herdr's folder, and add the layout:plato
# keys to keys.json. Existing PLATO files are kept unless --force. The plato-* mods of earlier
# versions are now roles of plato, so --force removes them.
# --hooks adds PLATO's Claude Code hooks (last prompt, purpose, step), the rules Bash(hc label:*) and Bash(plato-post:*)
# and the sandbox exclusions "hc label:*" and "plato-post:*" to ~/.claude/settings.json, links bin/plato-post
# as ~/.local/bin/plato-post, and links the director skill skills/plato-director as ~/.claude/skills/plato-director
# (run by hand as /plato-director). --hooks --remove takes them out again.
set -eu
H="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
R="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" = "--hooks" ]; then
  command -v jq >/dev/null 2>&1 || { echo "install.sh --hooks needs jq. Install it (brew install jq) and run again." >&2; exit 1; }
  S="$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude"
  if [ -f "$S" ] && [ ! -e "$S.before-plato" ]; then cp "$S" "$S.before-plato"; fi
  [ -f "$S" ] || echo '{}' >"$S"
  # This repo's hooks folder, as typed and with symlinks resolved: an entry under either is ours.
  D1="$R/hooks/"
  D2="$(cd "$R" && pwd -P)/hooks/"
  if [ "${2:-}" = "--remove" ]; then
    jq --arg d1 "$D1" --arg d2 "$D2" '
      def ours: (.command // "") as $c | ($c | startswith($d1)) or ($c | startswith($d2));
      if .hooks then
        # In each group with one of our hooks, drop ours; drop a group that this empties,
        # then an event with no groups left.
        .hooks |= (with_entries(.value |= map(
          if (.hooks | type) == "array" and any(.hooks[]; ours)
          then (.hooks |= map(select(ours | not))) | select(.hooks | length > 0) else . end
        ))
        | with_entries(select(.value | length > 0)))
        | if .hooks == {} then del(.hooks) else . end
      else . end
      | if any(.permissions.allow[]?; . == "Bash(hc label:*)") then
          .permissions.allow -= ["Bash(hc label:*)"]
          | if .permissions.allow == [] then del(.permissions.allow) else . end
          | if .permissions == {} then del(.permissions) else . end
        else . end
      | if any(.sandbox.excludedCommands[]?; . == "hc label:*") then
          .sandbox.excludedCommands -= ["hc label:*"]
          | if .sandbox.excludedCommands == [] then del(.sandbox.excludedCommands) else . end
          | if .sandbox == {} then del(.sandbox) else . end
        else . end
      | if any(.permissions.allow[]?; . == "Bash(plato-post:*)") then
          .permissions.allow -= ["Bash(plato-post:*)"]
          | if .permissions.allow == [] then del(.permissions.allow) else . end
          | if .permissions == {} then del(.permissions) else . end
        else . end
      | if any(.sandbox.excludedCommands[]?; . == "plato-post:*") then
          .sandbox.excludedCommands -= ["plato-post:*"]
          | if .sandbox.excludedCommands == [] then del(.sandbox.excludedCommands) else . end
          | if .sandbox == {} then del(.sandbox) else . end
        else . end
    ' "$S" >"$S.tmp"
    cat "$S.tmp" >"$S" && rm "$S.tmp"
    # The link, only if it points at this checkout's plato-post.
    L="$HOME/.local/bin/plato-post"
    if [ -L "$L" ]; then
      T="$(readlink "$L")"
      if [ "$T" = "$R/bin/plato-post" ] || [ "$T" = "$(cd "$R" && pwd -P)/bin/plato-post" ]; then rm "$L"; fi
    fi
    # The director skill's link, only if it points at this checkout's skill.
    K="$HOME/.claude/skills/plato-director"
    if [ -L "$K" ]; then
      T="$(readlink "$K")"
      if [ "$T" = "$R/skills/plato-director" ] || [ "$T" = "$(cd "$R" && pwd -P)/skills/plato-director" ]; then rm "$K"; fi
    fi
    echo "Removed PLATO's hooks from $S."
  else
    jq --arg d1 "$D1" --arg d2 "$D2" '
      # $matcher: the tools it runs for (null: all). $timeout: seconds before Claude Code gives
      # up on it (null: its default); a hook on every tool call must never stall the agent.
      def add($event; $file; $matcher; $timeout):
        if any(.hooks[$event][]?.hooks[]?; .command == $d1 + $file or .command == $d2 + $file) then .
        else .hooks[$event] += [{ hooks: [{ type: "command", command: ($d1 + $file) }
            + (if $timeout then { timeout: $timeout } else {} end)] }
          + (if $matcher then { matcher: $matcher } else {} end)] end;
      def add($event; $file): add($event; $file; null; null);
      add("UserPromptSubmit"; "claude-plato-last.sh")
      | add("SessionStart"; "claude-plato-purpose.sh")
      # The step labels: on every tool call, and after TodoWrite for the task progress.
      | add("PreToolUse"; "claude-plato-step.sh"; null; 2)
      | add("PostToolUse"; "claude-plato-step.sh"; "TodoWrite"; 2)
      | if any(.permissions.allow[]?; . == "Bash(hc label:*)") then . else .permissions.allow += ["Bash(hc label:*)"] end
      # Claude Code runs Bash in a sandbox, and there hc cannot reach Herdr.
      | if any(.sandbox.excludedCommands[]?; . == "hc label:*") then . else .sandbox.excludedCommands += ["hc label:*"] end
      | if any(.permissions.allow[]?; . == "Bash(plato-post:*)") then . else .permissions.allow += ["Bash(plato-post:*)"] end
      | if any(.sandbox.excludedCommands[]?; . == "plato-post:*") then . else .sandbox.excludedCommands += ["plato-post:*"] end
    ' "$S" >"$S.tmp"
    cat "$S.tmp" >"$S" && rm "$S.tmp"
    mkdir -p "$HOME/.local/bin"
    ln -sf "$R/bin/plato-post" "$HOME/.local/bin/plato-post"
    # The director skill: a link, so it follows this checkout. A folder of the same name that is
    # not a link is someone's own skill: leave it.
    K="$HOME/.claude/skills/plato-director"
    mkdir -p "$HOME/.claude/skills"
    if [ -e "$K" ] && [ ! -L "$K" ]; then
      echo "Left $K as it is: it is not a link to PLATO's director skill." >&2
    else
      ln -sfn "$R/skills/plato-director" "$K"
    fi
    echo "Added PLATO's hooks and the /plato-director skill to $S and $HOME/.claude/skills. Start a new Claude Code session, or review them in /hooks."
  fi
  exit 0
fi
if [ "${1:-}" != "--force" ] && { [ -e "$H/mods/plato" ] || [ -e "$H/mods/plato-route" ] || [ -e "$H/mods/plato-strip" ] || [ -e "$H/layouts/plato.json" ]; }; then
  echo "PLATO is already installed in $H. Run with --force to replace it." >&2
  exit 1
fi
mkdir -p "$H/layouts" "$H/themes" "$H/mods"
cp "$R/layouts/plato.json" "$R/layouts/plato.svg" "$H/layouts/"
cp "$R/themes/plato.json" "$R/themes/plato-amber.json" "$R/themes/plato-green.json" "$R/themes/plato-white.json" "$R/themes/plato-nord.json" "$R/themes/plato-mocha.json" "$R/themes/plato-tokyo.json" "$R/themes/plato-kanagawa.json" "$H/themes/"
rsync -a --delete "$R/mods/plato/" "$H/mods/plato/"
for m in plato-route plato-strip plato-sign plato-nowat plato-timetable plato-banner plato-signals; do
  if [ -d "$H/mods/$m" ]; then rm -r "$H/mods/$m"; echo "Removed $H/mods/$m (now a role of plato)."; fi
done
if [ -f "$H/keys.json" ]; then cp "$H/keys.json" "$H/keys.json.before-plato"; fi
python3 - "$H/keys.json" "$R/keys.json" <<'PY'
import json, os, sys
path, ours = sys.argv[1], json.load(open(sys.argv[2]))
keys = json.load(open(path)) if os.path.exists(path) else {}
keys["layout:plato"] = ours["layout:plato"]
with open(path, "w") as f:
    json.dump(keys, f, indent=2)
    f.write("\n")
PY
echo "Installed in $H. Switch with: herdr-app do layout.switch --name plato"
