#!/bin/sh
# Copy the live PLATO files from Herdr's folder into this repo, before a commit.
set -eu
H="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
R="$(cd "$(dirname "$0")" && pwd)"
cp "$H/layouts/plato.json" "$H/layouts/plato.svg" "$R/layouts/"
cp "$H/themes/plato.json" "$H/themes/plato-amber.json" "$H/themes/plato-green.json" "$H/themes/plato-white.json" "$R/themes/"
rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$H/mods/plato/" "$R/mods/plato/"
python3 - "$H/keys.json" "$R/keys.json" <<'PY'
import json, sys
keys = json.load(open(sys.argv[1]))
with open(sys.argv[2], "w") as f:
    json.dump({"layout:plato": keys.get("layout:plato", {})}, f, indent=2)
    f.write("\n")
PY
echo "Copied from $H. Review with: git -C \"$R\" status"
