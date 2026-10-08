#!/usr/bin/env bash
# The Maestro flows in .maestro/ on a real Android emulator or iOS Simulator, against a
# release build of this checkout (the JS bundled in, no Metro), in sample mode: no server,
# no account, nothing sent anywhere.
#   android: expo prebuild + gradle, an x86_64 APK signed with the debug key (a test build
#            only, never published: scripts/release.sh signs the real ones), installed on the
#            device adb names (ANDROID_SERIAL, or `adb connect` to ANDROID_DEVICE=host:port).
#   ios:     expo prebuild + xcodebuild for the Simulator (unsigned), installed on the newest
#            available iPhone simulator (or IOS_SIMULATOR=<name or udid>), booted if need be.
# Results land in build/device-tests/<platform>: a JUnit report, and screenshots and logs
# of any flow that failed.
# Usage: scripts/device-tests.sh android|ios [maestro test options, e.g. --include-tags smoke]
set -euo pipefail
cd "$(dirname "$0")/.."

platform="${1:-}"; shift || true
[[ "$platform" == android || "$platform" == ios ]] || { echo "Usage: $0 android|ios [maestro options]" >&2; exit 2; }
# Maestro (and Gradle) need a JDK: on a Mac, Android Studio's unless JAVA_HOME says otherwise.
jbr="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
[[ -z "${JAVA_HOME:-}" && -d "$jbr" ]] && export JAVA_HOME="$jbr"
command -v maestro >/dev/null || { echo "Maestro isn't installed: https://docs.maestro.dev/getting-started/installing-maestro" >&2; exit 1; }
out="build/device-tests/$platform"
rm -rf "$out" && mkdir -p "$out"

# app.json names google-services.json (push, FCM), which stays out of the repo. A checkout
# without one gets a stand-in for this build: the app runs, it just can't register for push.
made_gs=0
if [[ ! -f google-services.json ]]; then
  made_gs=1
  cat > google-services.json <<'JSON'
{"project_info":{"project_number":"000000000000","project_id":"plexbie-device-tests","storage_bucket":"plexbie-device-tests.appspot.com"},
 "client":[{"client_info":{"mobilesdk_app_id":"1:000000000000:android:0000000000000000","android_client_info":{"package_name":"com.plexbie.app"}},
  "oauth_client":[],"api_key":[{"current_key":"AIzaSyA-device-tests-not-a-real-key-000"}],"services":{"appinvite_service":{"other_platform_oauth_client":[]}}}],
 "configuration_version":"1"}
JSON
fi
cleanup() { [[ $made_gs == 1 ]] && rm -f google-services.json; rm -f "$PWD/build/device-tests/debug-signing.properties"; }
trap cleanup EXIT

if [[ "$platform" == android ]]; then
  if [[ -n "${ANDROID_DEVICE:-}" ]]; then
    adb connect "$ANDROID_DEVICE" >/dev/null
    export ANDROID_SERIAL="$ANDROID_DEVICE"
  fi
  adb wait-for-device
  until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do sleep 2; done
  device="$(adb get-serialno)"

  npx expo prebuild --platform android --no-install >/dev/null
  # The release build wants a key (plugins/withReleaseSigning.js); this one is the debug key
  # prebuild puts in android/app, for a build that only ever goes on the test device.
  props="$PWD/build/device-tests/debug-signing.properties"
  printf 'storeFile=%s\nstorePassword=android\nkeyAlias=androiddebugkey\nkeyPassword=android\n' \
    "$PWD/android/app/debug.keystore" > "$props"
  abi="$(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
  (cd android && ./gradlew app:assembleRelease -x lint -x test -q --init-script ../scripts/no-lint-vital.gradle \
    -PreactNativeArchitectures="$abi" -Pplexbie.signing="$props")
  apk=android/app/build/outputs/apk/release/app-release.apk
  # A build signed with another key (a phone-style release) can't be updated in place.
  adb install -r "$apk" >/dev/null 2>&1 || { adb uninstall com.plexbie.app >/dev/null 2>&1 || true; adb install "$apk" >/dev/null; }
else
  npx expo prebuild --platform ios --no-install >/dev/null
  (cd ios && LANG=en_US.UTF-8 pod install >/dev/null)
  # Only this Mac's own architecture: a Release build for the Simulator builds every one otherwise.
  (cd ios && xcodebuild -workspace Plexbie.xcworkspace -scheme Plexbie -configuration Release -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath build/simulator -quiet \
    ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO)
  app=ios/build/simulator/Build/Products/Release-iphonesimulator/Plexbie.app
  # The simulator: IOS_SIMULATOR (a name or a udid), or the newest iPhone available.
  device="$(xcrun simctl list -j devices available | IOS_SIMULATOR="${IOS_SIMULATOR:-}" node -e '
    const want = process.env.IOS_SIMULATOR;
    const all = Object.entries(JSON.parse(require("fs").readFileSync(0, "utf8")).devices)
      .filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([runtime, list]) => list.map(d => ({ ...d, v: runtime.split("iOS-")[1].split("-").map(Number) })));
    const pick = want ? all.find(d => d.udid === want || d.name === want)
      : all.filter(d => d.name.startsWith("iPhone")).sort((a, b) => (b.v[0] - a.v[0]) || (b.v[1] - a.v[1]))[0];
    if (!pick) { console.error(want ? `No simulator named ${want}.` : "No iPhone simulator: add one in Xcode."); process.exit(1); }
    console.log(pick.udid);')"
  xcrun simctl bootstatus "$device" -b >/dev/null
  xcrun simctl install "$device" "$app"
fi

echo "Testing on $platform ($device)"
maestro --device "$device" test .maestro --format junit --output "$out/report.xml" \
  --test-output-dir "$out" "$@"
