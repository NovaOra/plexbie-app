// Telling screen-reader users what just happened, on both platforms. (A live region alone
// only works on Android, and not for content that mounts with the region already set.)
import { AccessibilityInfo, type Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

export function announce(message: string | null | undefined) {
  if (message) AccessibilityInfo.announceForAccessibility(message);
}

/** Announces `message` whenever it changes to a new, non-empty value. */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => { announce(message); }, [message]);
}

/**
 * Screen-reader focus on this element: when the screen comes into view (a screen's
 * heading, since there's no native header to announce it), or, with `when`, each time
 * that value changes (a panel swapped in place of another).
 */
export function useFocusHere<T extends object = Text>(when?: unknown) {
  const ref = useRef<T>(null);
  const focus = useCallback(() => {
    const t = setTimeout(() => { if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current as never, "focus"); }, 350);
    return () => clearTimeout(t);
  }, []);
  useFocusEffect(focus);
  useEffect(() => { if (when !== undefined) return focus(); }, [when, focus]);
  return ref;
}
