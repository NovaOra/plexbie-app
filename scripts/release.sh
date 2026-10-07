#!/usr/bin/env bash
# Build, sign and publish one release, Android and iPhone, the same way every time:
#   0. the type-check, the tests and the API-types check first (as CI runs them; the
#      bot's checkout is ../plexbie, or PLEXBIE_REPO, and its API types must match the
#      bot's main after a fetch), so nothing is built if one fails,
#   1. a release APK for arm64 phones (expo prebuild + gradle),
#   2. signed with the release key in ~/.plexbie (never the debug key, or phones
#      can't update in place), checked against the known certificate,
#   3. an iPhone .ipa, built unsigned: SideStore/AltStore sign it on each phone with
#      that member's own Apple ID (there's no Apple developer account here),
#   4. both scanned by VirusTotal (scripts/virustotal.sh; stops if any engine flags
#      either, or no engine gave a verdict, and the release notes link both reports),
#   5. a GitHub release (tag vX.Y.Z) with docs/releases/X.Y.Z.md as its notes,
#   6. handed to the Plexbie bot (config/app/ in its container): members get the
#      "new version" card in the app and a download on the website, app users one
#      alert, iPhones the update through their SideStore source, and the site's
#      /.well-known/assetlinks.json names the release key so plexbie.com links open
#      the Android app (portal/app_release.py in the bot).
#
# Run scripts/bump.sh first (the next version: one step in the last place, 1.0.9 →
# 1.1.0), write docs/releases/<version>.md, and commit.
# Usage: scripts/release.sh   (add --no-publish to stop after signing; --revise to replace
# the current version with a new build of it, after scripts/bump.sh --build)
set -euo pipefail
cd "$(dirname "$0")/.."

CERT_SHA256="bca0aa00c3b6b56d9f1b7d5e41b79e0ba0cadfa38585ea457250e51bd945dc51"
KEYSTORE="$HOME/.plexbie/plexbie-release.keystore"
SIGNING="$HOME/.plexbie/release-signing.properties"
# Where the maintainer's Plexbie runs (ssh user@host, and its container), kept outside the
# repo in ~/.plexbie/release.env (PLEXBIE_HOST=…, PLEXBIE_CONTAINER=…) or the environment.
# Exported (set -a), so the scripts it runs see them too (scripts/virustotal.sh needs the key).
if [[ -f "$HOME/.plexbie/release.env" ]]; then set -a; source "$HOME/.plexbie/release.env"; set +a; fi
PLEXBIE_CONTAINER="${PLEXBIE_CONTAINER:-plexbie}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
publish=1; revise=0
for arg in "$@"; do
  case "$arg" in
    --no-publish) publish=0 ;;
    # A new build of the version already out (scripts/bump.sh --build first): same version,
    # a higher versionCode so phones take it as an update, and its GitHub release, tag and
    # notes replaced rather than a new one made.
    --revise) revise=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

version=$(node -p 'require("./app.json").expo.version')
code=$(node -p 'require("./app.json").expo.android.versionCode')
notes="docs/releases/$version.md"
out="dist/release"
apk="$out/plexbie-$version.apk"
ipa="$out/plexbie-$version.ipa"
[[ -f "$notes" ]] || { echo "Write $notes first (what's new, for members)." >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Commit first: the release is built from what's committed." >&2; exit 1; }
if (( revise )); then
  git rev-parse -q --verify "refs/tags/v$version" >/dev/null || { echo "v$version isn't out yet: release it without --revise." >&2; exit 1; }
  was=$(gh release download "v$version" -p latest.json -O - 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).versionCode)}catch{console.log(0)}})')
  (( code > was )) || { echo "v$version is out as build $was: run scripts/bump.sh --build (phones only take a higher one)." >&2; exit 1; }
  echo "Revising $version: build $was becomes build $code"
elif git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then echo "v$version is already tagged (to replace it, scripts/bump.sh --build, then --revise)." >&2; exit 1; fi
# One step after the last release, never a jump (scripts/bump.sh makes it).
last=$(git tag -l 'v*' --sort=-v:refname | head -1 | sed 's/^v//')
if [[ -n "$last" ]] && (( ! revise )); then
  expected=$(node -e '
    const [a, b, c] = process.argv[1].split(".").map(Number); const n = a * 100 + b * 10 + c + 1;
    console.log(`${Math.floor(n / 100)}.${Math.floor(n / 10) % 10}.${n % 10}`);
  ' "$last")
  [[ "$version" == "$expected" ]] || { echo "After $last comes $expected, not $version: run scripts/bump.sh." >&2; exit 1; }
fi
echo "Plexbie $version (versionCode $code)"

# The same checks as CI, before anything is built.
npm run -s typecheck
npm test -s -- --silent
# The API types against the bot's main as it is now (as CI checks them), not whatever branch,
# old pull or uncommitted edit the bot's checkout happens to have.
bot="${PLEXBIE_REPO:-../plexbie}"
remote=$(git -C "$bot" config branch.main.remote 2>/dev/null || echo origin)
git -C "$bot" fetch -q "$remote" main || { echo "Couldn't fetch the bot's main into $bot." >&2; exit 1; }
git -C "$bot" diff --quiet FETCH_HEAD -- web/src/api/types.ts \
  || { echo "The API types in $bot aren't the bot's main: check out main there and pull." >&2; exit 1; }
npm run -s types:check

npx expo prebuild --platform android --no-install >/dev/null
# Gradle signs it with the release key already (plugins/withReleaseSigning.js; it stops without
# one); the re-sign below stays, with the certificate check after it.
(cd android && ./gradlew app:assembleRelease -x lint -x test -q \
  --init-script ../scripts/no-lint-vital.gradle -PreactNativeArchitectures=arm64-v8a -Pplexbie.signing="$SIGNING")
built=android/app/build/outputs/apk/release/app-release.apk
built_code=$(node -p "require('./android/app/build/outputs/apk/release/output-metadata.json').elements[0].versionCode")
[[ "$built_code" == "$code" ]] || { echo "Built versionCode $built_code, expected $code." >&2; exit 1; }

bt=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
mkdir -p "$out"
"$bt/zipalign" -f -p 4 "$built" "$out/aligned.apk"
PASS=$(grep -E '^storePassword=' "$SIGNING" | cut -d= -f2-) KEYPASS=$(grep -E '^keyPassword=' "$SIGNING" | cut -d= -f2-) \
  "$bt/apksigner" sign --ks "$KEYSTORE" --ks-key-alias plexbie --ks-pass env:PASS --key-pass env:KEYPASS --out "$apk" "$out/aligned.apk"
rm -f "$out/aligned.apk" "$apk.idsig"
"$bt/apksigner" verify --print-certs "$apk" | grep -q "SHA-256 digest: $CERT_SHA256" \
  || { echo "The APK isn't signed with the release key." >&2; exit 1; }
sha=$(shasum -a 256 "$apk" | cut -d' ' -f1)
echo "Signed: $apk ($sha)"

npx expo prebuild --platform ios --no-install >/dev/null
(cd ios && LANG=en_US.UTF-8 pod install >/dev/null)
(cd ios && xcodebuild -workspace Plexbie.xcworkspace -scheme Plexbie -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -derivedDataPath build/device -quiet \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="")
app_dir=ios/build/device/Build/Products/Release-iphoneos/Plexbie.app
built_ver=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$app_dir/Info.plist")
built_build=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$app_dir/Info.plist")
[[ "$built_ver" == "$version" && "$built_build" == "$code" ]] \
  || { echo "Built iPhone $built_ver ($built_build), expected $version ($code)." >&2; exit 1; }
rm -rf "$out/Payload" "$ipa" && mkdir -p "$out/Payload" && cp -R "$app_dir" "$out/Payload/"
(cd "$out" && zip -qry "plexbie-$version.ipa" Payload) && rm -rf "$out/Payload"
ipa_sha=$(shasum -a 256 "$ipa" | cut -d' ' -f1)
echo "iPhone: $ipa ($ipa_sha)"
[[ $publish == 1 ]] || exit 0
[[ -n "${PLEXBIE_HOST:-}" ]] || { echo "Set PLEXBIE_HOST (ssh user@host of your Plexbie) in ~/.plexbie/release.env." >&2; exit 1; }

# VirusTotal, before anything is published: a flagged file stops the release here. A known
# false positive can go out anyway with VIRUSTOTAL_ACCEPT=1 (the notes still say what it found).
scan=""
if [[ -n "${VIRUSTOTAL_API_KEY:-}" ]]; then
  echo "VirusTotal: scanning the APK and the IPA (a few minutes)…"
  apk_scan=$(scripts/virustotal.sh "$apk")      # a failed scan stops the release (set -e)
  ipa_scan=$(scripts/virustotal.sh "$ipa")
  read -r apk_flag apk_engines apk_report <<<"$apk_scan"
  read -r ipa_flag ipa_engines ipa_report <<<"$ipa_scan"
  # An analysis with no engine verdicts isn't a clean scan (VIRUSTOTAL_ACCEPT doesn't cover it).
  if ! [[ "$apk_engines" =~ ^[1-9][0-9]*$ && "$ipa_engines" =~ ^[1-9][0-9]*$ ]]; then
    echo "Not published: VirusTotal gave no engine verdicts (engines: APK ${apk_engines:-none}, IPA ${ipa_engines:-none})." >&2
    echo "Look at ${apk_report:-$apk_flag} and ${ipa_report:-$ipa_flag}, then run it again." >&2; exit 1
  fi
  echo "VirusTotal: APK $apk_flag/$apk_engines flagged, IPA $ipa_flag/$ipa_engines flagged"
  if (( apk_flag + ipa_flag > 0 )) && [[ "${VIRUSTOTAL_ACCEPT:-}" != 1 ]]; then
    echo "Not published: look at $apk_report and $ipa_report first." >&2; exit 1
  fi
  scan=$(printf -- '- VirusTotal: %s of %s antivirus engines flagged the APK ([report](%s)), %s of %s the IPA ([report](%s))' \
    "$apk_flag" "$apk_engines" "$apk_report" "$ipa_flag" "$ipa_engines" "$ipa_report")
else
  echo "No VIRUSTOTAL_API_KEY in ~/.plexbie/release.env: publishing without a virus scan." >&2
fi

{
  cat "$notes"
  printf '\n**Installing:** open Plexbie (a card on Home, or You) or the website'"'"'s Alerts page and tap Download; it installs over the older version and keeps you signed in.\n\n'
  printf '**iPhone:** through SideStore or AltStore, with the source on the website'"'"'s Alerts page (each member has their own); it shows up there as an update.\n\n'
  printf '**Checks**\n- APK SHA-256: `%s`\n- Signing certificate SHA-256: `%s` (same as before)\n- IPA SHA-256 (unsigned): `%s`\n' "$sha" "$CERT_SHA256" "$ipa_sha"
  if [[ -n "$scan" ]]; then printf '%s\n' "$scan"; fi
} > "$out/notes.md"
# latest.json goes on the release too: other installs copy the APK, the IPA and it into
# their config/app/ to offer the app from their own Plexbie.
node -e '
  const fs = require("fs");
  const [file, version, code, sha, notes, out, cert, ipa, ipaSha] = process.argv.slice(1);
  fs.writeFileSync(out, JSON.stringify({ version, versionCode: Number(code), file, sha256: sha, cert,
    ios: { file: ipa, sha256: ipaSha },
    notes: fs.readFileSync(notes, "utf8"), publishedAt: new Date().toISOString() }, null, 2));
' "plexbie-$version.apk" "$version" "$code" "$sha" "$notes" "$out/latest.json" "$CERT_SHA256" "plexbie-$version.ipa" "$ipa_sha"
if (( revise )); then
  git tag -f "v$version" && git push -q -f origin "v$version"
  gh release upload "v$version" "$apk" "$ipa" "$out/latest.json" --clobber
  gh release edit "v$version" --notes-file "$out/notes.md"
else
  git tag "v$version" && git push -q origin "v$version"
  gh release create "v$version" "$apk" "$ipa" "$out/latest.json" --title "Plexbie $version" --notes-file "$out/notes.md" --latest
fi

tmp=$(ssh "$PLEXBIE_HOST" mktemp -d)
scp -q "$apk" "$ipa" "$out/latest.json" "$PLEXBIE_HOST:$tmp/"
# The APK and IPA first, latest.json last, so the bot never names a file that isn't there yet.
ssh "$PLEXBIE_HOST" "set -e; docker exec $PLEXBIE_CONTAINER mkdir -p /app/config/app
  docker cp $tmp/plexbie-$version.apk $PLEXBIE_CONTAINER:/app/config/app/
  docker cp $tmp/plexbie-$version.ipa $PLEXBIE_CONTAINER:/app/config/app/
  docker cp $tmp/latest.json $PLEXBIE_CONTAINER:/app/config/app/
  docker exec $PLEXBIE_CONTAINER sh -c 'cd /app/config/app && for k in apk ipa; do ls -t plexbie-*.\$k 2>/dev/null | tail -n +3 | xargs -r rm -f; done'
  rm -rf $tmp"
echo "Published $version: GitHub, and the bot (members see it within the next check)."
