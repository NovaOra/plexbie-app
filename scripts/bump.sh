#!/usr/bin/env bash
# Moves app.json to the next version: one step in the last place per release,
# 1.0.0, 1.0.1 … 1.0.9, then 1.1.0 (and 1.9.9 → 2.0.0); versionCode goes up by one
# (Android updates by that), and the iPhone build number with it. Starts
# docs/releases/<version>.md for the notes.
set -euo pipefail
cd "$(dirname "$0")/.."
next=$(node -e '
  const [a, b, c] = require("./app.json").expo.version.split(".").map(Number);
  const n = a * 100 + b * 10 + c + 1;
  console.log(`${Math.floor(n / 100)}.${Math.floor(n / 10) % 10}.${n % 10}`);
')
node -e '
  const fs = require("fs"); const p = "./app.json"; const app = JSON.parse(fs.readFileSync(p, "utf8"));
  app.expo.version = process.argv[1]; app.expo.android.versionCode += 1;
  app.expo.ios.buildNumber = String(app.expo.android.versionCode);   // the iPhone build number follows it
  fs.writeFileSync(p, JSON.stringify(app, null, 2) + "\n");
  console.log(`version ${app.expo.version}, versionCode ${app.expo.android.versionCode}`);
' "$next"
notes="docs/releases/$next.md"
[[ -f "$notes" ]] || printf '**New in %s**\n- \n' "$next" > "$notes"
echo "Write what's new in $notes, commit, then scripts/release.sh"
