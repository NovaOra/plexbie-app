// Every vibration the app makes, in one place, behind the Vibration setting on the You
// screen. One haptic per thing the person did, at the moment it happens, and never the
// only feedback (haptics are off on many phones). The pattern says what kind of thing:
//   tap       a press commits (light)
//   select    a switch or a choice flips
//   success   something went through
//   error     it didn't
//   reward    a request was sent: a little rising "ba-da-ding"
//   knock     an alert arrived while the app is open: knock-knock
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { flagSetting } from "./flagSetting";

/** The setting, in the app's own documents folder. */
const setting = flagSetting("plexbie-haptics.txt", true);

export const hapticsOn = setting.get;

export async function setHapticsOn(next: boolean): Promise<void> {
  setting.set(next);
  if (next) success();
}

const later = (ms: number, f: () => Promise<void>) => setTimeout(() => { if (setting.get()) void f().catch(() => undefined); }, ms);
const now = (f: () => Promise<void>) => { if (setting.get()) void f().catch(() => undefined); };

// Android: the phone's own haptic effects (performHapticFeedback), which each maker tunes for
// its motor and which follow the system's touch-feedback setting. expo-haptics' own Android
// patterns run at 12-27% strength, too faint to notice on most phones.
const ANDROID = Platform.OS === "android";
const A = Haptics.AndroidHaptics;
const android = (type: Haptics.AndroidHaptics) => () => Haptics.performAndroidHapticsAsync(type);

export const tap = () => now(ANDROID ? android(A.Virtual_Key) : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const select = () => now(ANDROID ? android(A.Segment_Tick) : () => Haptics.selectionAsync());
export const success = () => now(ANDROID ? android(A.Confirm) : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const error = () => now(ANDROID ? android(A.Reject) : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** A request went off: tick, tick, then the success pattern, rising like a little fanfare. */
export function reward() {
  if (ANDROID) {
    now(android(A.Virtual_Key));
    later(90, android(A.Virtual_Key));
    later(200, android(A.Confirm));
    return;
  }
  now(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  later(90, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  later(200, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** An alert came in while the app is open. iPhone only: on Android the alert's channel
 *  vibrates in Plexbie's pattern already, open or not. */
export function knock() {
  if (ANDROID) return;
  now(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  later(150, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
