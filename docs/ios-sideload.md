# Plexbie on iPhone, through SideStore

iPhones only install apps from the App Store, and Plexbie isn't there: putting it there needs Apple's paid developer program.
Until then, iPhones get Plexbie through **SideStore** (or **AltStore**). It's a free app that installs other apps under
the member's **own** Apple ID and renews them every week.

## What members do

Members see the same steps on the website: **Alerts**, then **Plexbie for iPhone**. It only shows once a release has an iPhone build.

1. **Install SideStore:** follow [sidestore.io](https://sidestore.io).
   - It needs a computer once, about 15 minutes.
   - After that it renews apps on the phone alone, through its small on-device VPN.
   - Then sign in with your Apple ID under SideStore's **Settings**: SideStore signs every app with it. If installing
     fails with "SideStore.OperationError error 28", that's SideStore's "You are not signed in" (the banner doesn't
     show the text), so sign in there again.
   - AltStore works too, but it renews only when the phone is on the same Wi-Fi as a computer running AltServer.
2. **Connect LocalDevVPN:** SideStore's setup also installs **LocalDevVPN**, its on-device VPN. Open it and tap
   **Connect** whenever SideStore installs or renews an app. If it isn't connected, SideStore fails with
   "VPN Connection Error: No utun interface detected — LocalDevVPN is not connected". If it still fails while
   connected, redo SideStore's pairing file from its guide.
3. **Turn on Developer Mode:** *Settings → Privacy & Security → Developer Mode*. The phone restarts.
4. **Add Plexbie:** on the iPhone, open your Plexbie (for example `plexbie.yourdomain.com`), go to **Alerts** and tap **Add to SideStore**. Then install Plexbie from SideStore.
   - Using AltStore instead: tap **Add to AltStore**, or **Copy the address** and paste it under *Sources → +*.
5. **Updates:** new versions show up in SideStore as an update.
   - Plexbie's own "new version" card also opens SideStore.
   - Updating keeps them signed in.

## How it works

| Piece | Where |
| --- | --- |
| Unsigned `plexbie-<version>.ipa` | Built by `scripts/release.sh` and attached to the GitHub release with the APK and `latest.json` (which names it under `ios`). The maintainer's release copies all three into their Plexbie's `config/app/`; other installs copy them there themselves. |
| Each member's source (`/app-source/<token>.json`) | The bot (`portal/app_release.py`). The token names who asked and lasts three years. Ask for one with `POST /api/app/ios-source` (members only). |
| The download (`/download/ios/<token>/<file>`) | The bot. Both this and the source check, every time, that the person is still a member. Once someone is off Plex, their source and downloads answer 410. |

## Limits of a free Apple ID

- **Three apps:** at most three sideloaded apps per iPhone, SideStore included.
- **Weekly renewal:** each app is renewed every 7 days. SideStore does it in the background; if it ever can't, the member opens SideStore once.
- **No push:** **no phone alerts**, because Apple's push service needs the paid program.
- **Links open in Safari:** links to your Plexbie open the website, not the app. Sign-in still returns to the app, through `com.plexbie.app:/auth`.
- **SideStore changes the app's ID:** it gives Plexbie an app ID of its own, built from the member's Apple ID. Nothing in Plexbie depends on that ID.

## Later: the paid program

With an Apple Developer account ($99/year):
- TestFlight or the App Store replace all of this.
- Push alerts can start working.
- In `scripts/release.sh`, swap the unsigned build for a signed archive.
