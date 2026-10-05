# Plexbie app

Plexbie's native app for iPhone and Android. It's built with Expo and React Native, from one TypeScript codebase.

The app is a client of a Plexbie server's `/api`: any Plexbie, on any address. Signing in
works like Plexbie's setup: members type their domain and the app fills in
`plexbie.<their domain>`, or they choose **Use a different address** for any other (a
Tailscale name, one they already use). Every screen is native; the website is not inside it.

**What it does:** sign in with Discord or Plex (PKCE, through the server's own page; the token
lives in the Keychain/Keystore), requests with live progress, Home, Library, the
Request page with Seerr discovery, Manage for admins, invites, alerts (Android), and its own
update notices. iPhone gets iOS 26 Liquid Glass.

**Alerts:** the app gets alerts only from a Plexbie that sends them (`APP_PUSH=expo` on the
bot, off by default). App alerts go through the Plexbie project's Expo account, so they're
for the project's own household; every other Plexbie's members turn on its website's
alerts instead, which each install sends itself. The app says so and opens the website.

**Versions:** one step per release (1.0.9, then 1.1.0), from 1.0.0, the first public
release; the current one is in `app.json`. Android's `versionCode` (and the iPhone build
number) keeps counting up from the earlier private builds, so phones update in place.

**Getting it onto phones:**
- **Android:** a signed APK, downloaded from the household's Plexbie (Alerts page, or the app's
  update card).
- **iPhone:** an unsigned `.ipa` that **SideStore or AltStore** signs on each phone with that
  member's own free Apple ID. See [docs/ios-sideload.md](docs/ios-sideload.md). Apple only
  allows push alerts for apps from its paid developer program, so the iPhone app points members
  to their Plexbie website's alerts instead.

[docs/PLAN.md](docs/PLAN.md) is the original build plan, kept for its reasoning; parts of it
are now out of date.

## Releasing (the maintainer)

1. `scripts/bump.sh`: the next version, the versionCode and the iPhone build number.
2. Write what's new in `docs/releases/<version>.md`, and commit.
3. `scripts/release.sh`:
   - builds the Android APK and signs it with the release key in `~/.plexbie` (it checks the certificate);
   - builds the unsigned iPhone `.ipa`;
   - tags the release, then puts the APK, the IPA and `latest.json` on the GitHub release;
   - copies them into the maintainer's Plexbie (`PLEXBIE_HOST` in `~/.plexbie/release.env`).

   Other installs copy those three files from the GitHub release into their own `config/app/`.

## Setup

- **Required:**
  - Node 20+ (22 used).
  - For Android: Android Studio (its SDK, and its bundled Java at `/Applications/Android Studio.app/Contents/jbr/Contents/Home`).
- **For iOS:**
  - **Xcode** from the Mac App Store (the command-line tools alone aren't enough).
  - CocoaPods: `brew install cocoapods`.
- **No Expo Go:** custom sign-in and push need a *development build* (the app with Expo's dev menu built in).

```bash
npm install
npm run types:check          # the API types match the bot's (../plexbie)
```

## Run

### Android emulator

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
# Plexbie's own emulator (made once: avdmanager create avd -n plexbie_app -k "system-images;android-35;default;arm64-v8a" -d pixel_8)
$ANDROID_HOME/emulator/emulator -avd plexbie_app -port 5600 &
npm run android              # builds the dev client, installs it, starts Metro
```

Later runs only need `npm start` (Metro), as long as the dev build is already on the emulator. Press `a` to open it on Android.

### iOS Simulator (needs Xcode)

```bash
npm run ios                  # prebuild, pod install, build, open the Simulator
```

### What's where

- `npm start`: Metro for an installed dev build (`expo start --dev-client`).
- `npm run typecheck`, `npm run lint`, `npm run doctor`.
- `npm run types:sync`: copy the bot's API types again after they change (set `PLEXBIE_REPO` if the bot's checkout isn't `../plexbie`).
- `node scripts/brand-assets.mjs`: rebuild the icons from the logo.

## Put it on your own phone

### iPhone, for the household: SideStore or AltStore

This is how members install it, no Mac needed: [docs/ios-sideload.md](docs/ios-sideload.md). Each release
(`scripts/release.sh`) builds an unsigned `.ipa`. SideStore or AltStore signs it on the phone with the member's
own Apple ID, and the bot hands each member their own source address on the website's Alerts page.

### iPhone, from Xcode, with a free Apple ID (for development)

1. **Add your Apple ID:** install Xcode, then *Xcode → Settings → Accounts → +* and add your Apple ID. That gives you a free "Personal Team".
2. **Prepare the iPhone:**
   - Connect it by cable and tap *Trust*.
   - Turn on *Settings → Privacy & Security → Developer Mode*; the phone restarts.
3. **Pick your team:** `npx expo prebuild -p ios`, then open `ios/Plexbie.xcworkspace` in Xcode.
   - Select the *Plexbie* target, then *Signing & Capabilities*.
   - Set *Team* to your Personal Team.
   - If Xcode says the bundle ID is taken, change it to something only you use, e.g. `com.<yourname>.plexbie`. Change it in `app.json` → `ios.bundleIdentifier` too.
4. **Install:** `npx expo run:ios --device` and choose the iPhone, or press ▶ in Xcode.
5. **Trust the developer:** the first launch is blocked until you go to *Settings → General → VPN & Device Management*, tap your Apple ID, then *Trust*.
6. **Load the code:** a dev build loads its code from Metro on the Mac (`npm start`), so the phone must be on the same Wi-Fi.

**Free Apple ID limits:**
- **Expiry:** the app stops opening after **7 days**. Plug in and run step 4 again to re-sign it; your sign-in survives.
- **Three apps:** at most three sideloaded apps per device.
- **No push:** **push notifications aren't available**, because Apple's Push capability needs the paid Apple Developer Program ($99/year). Everything else works.

### Android, as a plain APK

- **Development APK** (loads code from Metro on the Mac, same Wi-Fi):
  ```bash
  cd android && ./gradlew assembleDebug
  # android/app/build/outputs/apk/debug/app-debug.apk
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk   # or copy it to the phone and open it
  ```
- **Standalone APK** (code inside, no Mac needed; signed with the debug key, fine for your own phone):
  ```bash
  cd android && ./gradlew assembleRelease
  # android/app/build/outputs/apk/release/app-release.apk
  ```

On the phone, allow *Install unknown apps* for whatever opens the APK (Files, a browser). On GrapheneOS that's per app, under *Settings → Apps*.

### EAS (optional, cloud builds)

`eas.json` has these profiles:

| Profile | Builds |
|---|---|
| `development` | dev client (APK for Android, an internal build for registered iPhones) |
| `development-simulator` | dev client for the iOS Simulator |
| `preview` | standalone internal build (APK for Android) |
| `production` | store build |

They need a free Expo account (`npx eas-cli login`). They're optional; everything above builds locally.

## Architecture (short)

- **Routes** (`src/app`): Expo Router, thin route files. A sign-in gate (`Stack.Protected`) and the platform's own tab bar (`NativeTabs`).
- **Data** (`src/api`):
  - A typed client over `/api`: Bearer token, `X-Plexbie: 1`, 15 s timeout, retries for reads only.
  - Zod checks every response.
  - TanStack Query owns server state; NetInfo and AppState make it offline- and foreground-aware.
- **Auth** (`src/auth`):
  - Sign-in runs on the bot, in the system browser sheet, with PKCE. The app receives a one-time code and swaps it for a Plexbie session token.
  - The token lives in the Keychain or Keystore (this device only, never backed up) and is never logged or put in a URL.
  - The Plex token never leaves the bot.
- **Look** (`src/ui`): the website's "On Air" tokens, Archivo, press feedback (scale 0.97, 120 ms, one haptic), 48dp targets, reduced-motion aware.
- **Types:** copied from the bot (`scripts/sync-types.mjs`); the bot is the source of truth for `/api`.

## Licence

Plexbie's app is free software under the GNU Affero General Public License, version 3 or later
(`LICENSE`), the same as the [Plexbie bot](https://github.com/NovaOra/plexbie). If you change it and give it
to other people, you share your changes under the same licence.
