// Live progress (Android): the bot sends silent updates (core/live_progress.py in the bot)
// while one of your requests downloads, and this draws them as one ongoing notification
// per request (modules/plexbie-live), until it's on Plex. Handled by a background task,
// so it works with the app closed; it's registered from index.ts, before anything else.
import { File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { endAllLive, endLive, liveSupported, showLive } from "../../../modules/plexbie-live";

export const LIVE_TASK = "plexbie-live-progress";
/** A live notification goes by itself this long after its last update (the bot sends one
 *  at least every 10 minutes while it's moving), so a quiet bot never leaves one behind. */
const LIVE_TIMEOUT = 30 * 60_000;

/** This phone can show it: Android, with the native module in the build. */
export const liveAvailable = Platform.OS === "android" && liveSupported;

const setting = () => new File(Paths.document, "plexbie-live.txt");
let on = (() => {
  try { const f = setting(); return !(f.exists && f.textSync().trim() === "off"); } catch { return true; }
})();

const pinSetting = () => new File(Paths.document, "plexbie-live-pin.txt");
let pin = (() => {
  try { const f = pinSetting(); return !(f.exists && f.textSync().trim() === "off"); } catch { return true; }
})();

/** In the status bar (the default): a Live Update, with its % in the status bar and its
 *  place at the top of the shade. Off: an ordinary silent notification, down with the
 *  others. Android doesn't let one be both. */
export const livePinned = () => pin;
export function setLivePinned(next: boolean) {
  pin = next;
  try { pinSetting().write(next ? "on" : "off"); } catch { /* stays for this run */ }
}

const forPhoneSetting = () => new File(Paths.document, "plexbie-live-alerts.txt");
let forPhone = (() => {
  try { const f = forPhoneSetting(); return !(f.exists && f.textSync().trim() === "off"); } catch { return true; }
})();

/** Off once alerts are turned off here or the person signs out, until alerts are turned on
 *  again: updates the bot sends before it hears that aren't drawn. A file, not the Keychain,
 *  so the background task can read it with the phone locked. */
export function setLiveForThisPhone(next: boolean) {
  forPhone = next;
  try { forPhoneSetting().write(next ? "on" : "off"); } catch { /* stays for this run */ }
}

/** Live progress on (the default) or off, on this phone. */
export const liveOn = () => liveAvailable && on;

export async function setLiveOn(next: boolean): Promise<void> {
  on = next;
  try { setting().write(next ? "on" : "off"); } catch { /* stays for this run */ }
  if (!next) await endAllLive();
}

type Live = { plexbie: "live"; op: "show" | "end"; id: string; slot?: number | null; title?: string; text?: string;
  stage?: string; percent?: number | null; ts?: number };

/** The update in a notification's data, however Expo and FCM wrapped it. */
export function liveIn(data: unknown): Live | null {
  const tryParse = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } };
  const candidates = [data, tryParse((data as { dataString?: unknown } | null)?.dataString), tryParse((data as { body?: unknown } | null)?.body)];
  for (const c of candidates) {
    const d = c as Partial<Live> | null;
    if (d && d.plexbie === "live" && (d.op === "show" || d.op === "end") && typeof d.id === "string" && /^[\w-]{1,40}$/.test(d.id)) return d as Live;
  }
  return null;
}

/** The newest update drawn per request ("ts", when the bot sent it) and when it came, by this
 *  phone's clock. A phone that was offline can get updates late and out of order, and a late
 *  "show" mustn't bring back one that has ended. A file, so the background task, which can
 *  start afresh, sees what the app drew; kept an hour. */
const seenSetting = () => new File(Paths.document, "plexbie-live-seen.json");
const SEEN_FOR = 60 * 60_000;
type Seen = Record<string, { ts: number; at: number }>;
let seenHere: Seen = {};

/** False for an update older than the last one drawn for its request; otherwise it's noted.
 *  One from a bot that doesn't date them is drawn as it comes. */
function newest(live: Live): boolean {
  const ts = live.ts;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return true;
  let seen = seenHere;
  try {
    const f = seenSetting();
    if (f.exists) { const v: unknown = JSON.parse(f.textSync()); if (v && typeof v === "object") seen = v as Seen; }
  } catch { /* what this run noted */ }
  const now = Date.now(), kept: Seen = Object.create(null);
  for (const [id, s] of Object.entries(seen)) {
    if (s && typeof s.ts === "number" && typeof s.at === "number" && now - s.at < SEEN_FOR) kept[id] = s;
  }
  if (kept[live.id] && ts < kept[live.id].ts) return false;
  kept[live.id] = { ts, at: now };
  seenHere = kept;
  try { seenSetting().write(JSON.stringify(kept)); } catch { /* noted for this run */ }
  return true;
}

export async function handleLive(live: Live): Promise<void> {
  if (!newest(live)) return;
  if (live.op === "end" || !liveOn() || !forPhone) { await endLive(live.id); return; }
  const slot = typeof live.slot === "number" && Number.isInteger(live.slot) && live.slot > 0 ? live.slot : null;
  const percent = typeof live.percent === "number" ? Math.max(0, Math.min(100, Math.round(live.percent))) : null;
  const stage = live.stage === "unpacking" || live.stage === "importing" ? live.stage : "downloading";
  await showLive(live.id, slot, String(live.title ?? "Your request").slice(0, 120), String(live.text ?? "").slice(0, 200),
    stage, percent, LIVE_TIMEOUT, pin);
}

if (liveAvailable) {
  // Loaded only here: iPhone builds never need it (live progress is Android's).
  const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(LIVE_TASK, async ({ data }) => {
    const live = data && !("actionIdentifier" in data) ? liveIn(data.data) ?? liveIn(data) : null;
    if (live) await handleLive(live);
    return Notifications.BackgroundNotificationTaskResult.NoData;
  });
  void Notifications.registerTaskAsync(LIVE_TASK).catch((e) => console.warn("Live progress: couldn't register its background task", e));
}

/** Whether notifications are allowed for Plexbie in the phone's settings. */
export async function notificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

let previewing = false;
/** "Show me": one made-up request going through it in about 15 seconds, then gone. Says how
 *  it went: "denied" when notifications are off for Plexbie, so nothing could show. */
export async function previewLive(): Promise<"shown" | "denied" | "busy" | "unavailable"> {
  if (!liveAvailable) return "unavailable";
  if (previewing) return "busy";
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return "denied";
  previewing = true;
  const id = "preview", wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    for (let pct = 0; pct <= 100; pct += 10) {
      const left = Math.max(1, Math.round((100 - pct) / 20));
      await showLive(id, null, "Sintel (a preview)", `Downloading, ${pct}%. About ${left} min left`, "downloading", pct, LIVE_TIMEOUT, pin);
      await wait(900);
    }
    await showLive(id, null, "Sintel (a preview)", "Unpacking, 1 of 2", "unpacking", 50, LIVE_TIMEOUT, pin);
    await wait(2000);
    await showLive(id, null, "Sintel (a preview)", "Downloaded. Adding it to Plex", "importing", 100, LIVE_TIMEOUT, pin);
    await wait(2500);
  } finally {
    await endLive(id);
    previewing = false;
  }
  return "shown";
}
