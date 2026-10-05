// Alerts in the Plexbie app. The phone's Expo push token goes to the bot (POST
// /api/push/app), which sends request news, inactivity warnings and copies of its
// Discord DMs through Expo's push service. Asked for only when someone wants alerts,
// never on launch. The token is kept (in the Keychain/Keystore) only to remove it again.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Api } from "../../api/client";

const KEY = "plexbie.pushToken";
const STORE: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export type PushState = "on" | "off" | "denied" | "unavailable";

/** The Expo project this build belongs to (set by `eas init`). Without it there are no tokens. */
export function projectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id ? id : null;
}

/**
 * iPhone builds get push only when they're signed through Apple's paid developer program:
 * that signature carries the "aps-environment" entitlement Apple's push service needs. The
 * builds members install with SideStore/AltStore are signed with their own free Apple ID,
 * which can't carry it. A build that can sets `extra.iosPush: true` in app.json.
 */
export const IOS_PUSH = Constants.expoConfig?.extra?.iosPush === true;

/** Can this build, on this device, get alerts at all? (A simulator or emulator without
 *  Google Play can't, nor an iPhone build without Apple's push entitlement.) */
export const pushPossible = () => !!projectId() && Device.isDevice !== false && (Platform.OS !== "ios" || IOS_PUSH);

// Shown while the app is open, too: a banner, in the list, with sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function pushState(): Promise<PushState> {
  if (!pushPossible()) return "unavailable";
  const saved = await SecureStore.getItemAsync(KEY, STORE);
  if (!saved) return "off";
  const perm = await Notifications.getPermissionsAsync();
  return perm.granted ? "on" : "denied";
}

/** Asks (once, when wanted), gets this phone's token and tells the bot. */
export async function enablePush(client: Api): Promise<PushState> {
  if (!pushPossible()) return "unavailable";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Requests and your account",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#ff5c93",
      // On a locked phone: that something came, not what it says (DM copies can be personal).
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return "denied";
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId()! });
  await client.registerPush(token, Platform.OS);
  await SecureStore.setItemAsync(KEY, token, STORE);
  return "on";
}

/** Tells the bot to stop, and forgets the token. Best-effort on the bot's side. */
export async function disablePush(client: Api | null): Promise<PushState> {
  const saved = await SecureStore.getItemAsync(KEY, STORE);
  if (saved && client) await client.unregisterPush(saved).catch(() => undefined);
  await SecureStore.deleteItemAsync(KEY, STORE);
  return pushPossible() ? "off" : "unavailable";
}

/** Where tapping an alert goes: the bot's website paths, mapped to the app's screens. The
 *  household's pages are at the site's root; alerts from older bots say /app/... */
export function routeFor(url: unknown): "/requests" | "/manage" | "/home" {
  const u = (typeof url === "string" ? url : "").replace(/^\/app(?=[/?]|$)/, "") || "/";
  if (u.startsWith("/manage")) return "/manage";
  if (u.startsWith("/schedule") || u.startsWith("/requests")) return "/requests";
  return "/home";
}
