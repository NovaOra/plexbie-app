// Alerts in the Plexbie app. The phone's Expo push token goes to the bot (POST
// /api/push/app), which sends request news, inactivity warnings and copies of its
// Discord DMs through Expo's push service. Asked for only when someone wants alerts,
// never on launch. The token is kept (in the Keychain/Keystore) only to remove it again.
import type { Href } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { endAllLive } from "../../../modules/plexbie-live";
import type { Api } from "../../api/client";
import * as haptics from "../../ui/haptics";
import { liveIn, liveOn, setLiveForThisPhone } from "./live";

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
const IOS_PUSH = Constants.expoConfig?.extra?.iosPush === true;

/** Can this build, on this device, get alerts at all? (A simulator or emulator without
 *  Google Play can't, nor an iPhone build without Apple's push entitlement.) */
const pushPossible = () => !!projectId() && Device.isDevice !== false && (Platform.OS !== "ios" || IOS_PUSH);

// Shown while the app is open, too: a banner, in the list, with sound, and a knock-knock.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    // Live progress updates are silent data; the background task draws them (live.ts).
    if (liveIn(n.request.content.data)) return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    haptics.knock();
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
  },
});

/** Plexbie's alert vibration on Android: tap, tap, buzz. */
const PATTERN = [0, 70, 90, 70, 90, 180];

/** The Android channel this phone's alerts should use: Android fixes a channel's sound and
 *  vibration once it exists, so the Vibration setting picks between two. ("default", from
 *  older versions, stays for older Plexbie bots, which only know it.) */
const alertChannel = () => (haptics.hapticsOn() ? "alerts" : "alerts-quiet");

async function makeChannels() {
  if (Platform.OS !== "android") return;
  const common = {
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#ff5c93",
    // On a locked phone: that something came, not what it says (DM copies can be personal).
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  };
  await Notifications.setNotificationChannelAsync("alerts", { ...common, name: "Alerts", vibrationPattern: PATTERN, enableVibrate: true });
  await Notifications.setNotificationChannelAsync("alerts-quiet", { ...common, name: "Alerts without vibration", enableVibrate: false, vibrationPattern: [0] });
  await Notifications.setNotificationChannelAsync("default", { ...common, name: "Alerts from older Plexbie servers" });
}

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
  await makeChannels();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return "denied";
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId()! });
  await client.registerPush(token, Platform.OS, alertChannel(), liveOn());
  await SecureStore.setItemAsync(KEY, token, STORE);
  setLiveForThisPhone(true);
  return "on";
}

/** On each start, and when the Vibration setting changes: with alerts on, make sure the
 *  channels exist and the bot has this phone on the right one. Quiet and best-effort. */
export async function refreshPush(client: Api): Promise<void> {
  try {
    if ((await pushState()) !== "on") return;
    const saved = await SecureStore.getItemAsync(KEY, STORE);
    if (!saved) return;
    await makeChannels();
    await client.registerPush(saved, Platform.OS, alertChannel(), liveOn());
  } catch {
    // The next start tries again.
  }
}

/** The alerts switch: tells the bot to stop, then forgets the token. If the bot didn't hear
 *  it, that's the error the switch shows, and the token stays so trying again can remove it
 *  (otherwise alerts would keep coming while the switch says off). */
export async function disablePush(client: Api): Promise<PushState> {
  const saved = await SecureStore.getItemAsync(KEY, STORE);
  if (saved) await client.unregisterPush(saved);
  await SecureStore.deleteItemAsync(KEY, STORE);
  // No end message comes for a request still downloading now: take its progress down.
  setLiveForThisPhone(false);
  await endAllLive();
  return pushPossible() ? "off" : "unavailable";
}

/** Signing out: forgets the token on this phone and takes down live progress, and draws
 *  none of the updates the bot may still send before it hears. Returns the token, so the
 *  sign-out can still tell the bot to drop it (auth/session.tsx), however long that takes. */
export async function forgetPush(): Promise<string | null> {
  const saved = await SecureStore.getItemAsync(KEY, STORE).catch(() => null);
  await SecureStore.deleteItemAsync(KEY, STORE);
  setLiveForThisPhone(false);
  await endAllLive();
  return saved;
}

/** The token this phone has alerts on with now, if any. */
export const savedPush = () => SecureStore.getItemAsync(KEY, STORE);

/** Where tapping an alert goes: the bot's website paths, mapped to the app's screens. The
 *  household's pages are at the site's root; alerts from older bots say /app/...
 *  "/manage?tab=tickets&ticket=…" opens that ticket; "/manage?tab=messages&who=…" that conversation. */
export function routeFor(url: unknown): Href {
  const u = (typeof url === "string" ? url : "").replace(/^\/app(?=[/?]|$)/, "") || "/";
  if (u.startsWith("/manage")) {
    const q = new URLSearchParams(u.split("?")[1] ?? "");
    const ticket = q.get("ticket"), who = q.get("who"), tab = q.get("tab");
    if (ticket && /^[0-9a-f]{12}$/.test(ticket)) return { pathname: "/manage-ticket/[id]", params: { id: ticket } };
    if (tab === "messages" && who && /^[dp][\w .@+-]{1,120}$/.test(who)) return { pathname: "/manage", params: { tab, who } };
    return tab && /^[a-z]{2,20}$/.test(tab) ? { pathname: "/manage", params: { tab } } : "/manage";
  }
  if (u.startsWith("/schedule") || u.startsWith("/requests")) return "/requests";
  return "/home";
}

const KINDS = new Set(["movie", "tv", "audiobook", "ebook"]);

/** One of the app's own links (com.plexbie.app:///request/214, from a live-progress
 *  notification), opened while signed out, as the screen to open after the sign-in. null when
 *  there's nothing more than Home to open: sign-in and invite links, and anything unknown or
 *  malformed. */
export function routeForLink(url: unknown): Href | null {
  if (typeof url !== "string") return null;
  // Everything after "scheme://" is the path, as the router reads it ("…://request/214" too).
  const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  if (rest === url) return null;
  const [path, query] = rest.split(/[?#]/, 2);
  const p = `/${path}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
  const request = p.match(/^\/request\/([1-9]\d{0,8})$/);
  if (request) return { pathname: "/request/[slot]", params: { slot: request[1] } };
  const title = p.match(/^\/title\/([a-z]+)\/([\w.:-]{1,128})$/);
  if (title && KINDS.has(title[1])) return { pathname: "/title/[kind]/[id]", params: { kind: title[1], id: title[2] } };
  if (p === "/search" || p === "/library") return p;
  const to = /^\/(manage|requests|schedule)$/.test(p) ? routeFor(query ? `${p}?${query}` : p) : null;
  return to === "/home" ? null : to;
}
