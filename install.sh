#!/bin/sh
# Copy the PLATO layout, themes and mod into Herdr's folder, and add the
# layout:plato keys to keys.json. Existing PLATO files are kept unless --force.
set -eu
H="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
R="$(cd "$(dirname "$0")" && pwd)"
if [ "${1:-}" != "--force" ] && { [ -e "$H/mods/plato" ] || [ -e "$H/layouts/plato.json" ]; }; then
  echo "PLATO is already installed in $H. Run with --force to replace it." >&2
  exit 1
fi
mkdir -p "$H/layouts" "$H/themes" "$H/mods"
cp "$R/layouts/plato.json" "$R/layouts/plato.svg" "$H/layouts/"
cp "$R/themes/plato.json" "$R/themes/plato-amber.json" "$R/themes/plato-green.json" "$R/themes/plato-white.json" "$H/themes/"
rsync -a --delete "$R/mods/plato/" "$H/mods/plato/"
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
