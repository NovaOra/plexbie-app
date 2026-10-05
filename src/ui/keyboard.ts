// Screens with text fields. The app runs edge to edge, so on Android the window no longer
// shrinks for the keyboard (Android 15 ignores adjustResize then): a KeyboardAvoidingView
// has to make the room on both platforms, and a field near the bottom of a long page is
// scrolled into view when it's tapped, so you can see what you're typing.
import { useCallback, useRef } from "react";
import { Keyboard, type LayoutChangeEvent, type ScrollView } from "react-native";

/** Room left above a scrolled-to field: the status bar and the floating back button. */
const CLEAR_TOP = 110;

/** For every KeyboardAvoidingView around a screen's content. */
export const KEYBOARD_BEHAVIOR = "padding" as const;

/**
 * `scroll` goes on the ScrollView; `onLayout` on the field (or the box holding it), a direct
 * child of the ScrollView's content; `onFocus` on the TextInput. On focus, once the keyboard
 * is up (and the room for it made), the page scrolls so the field's box starts just below
 * the floating back button, with as much of it as fits above the keyboard.
 */
export function useScrollToField() {
  const scroll = useRef<ScrollView>(null);
  const y = useRef(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => { y.current = e.nativeEvent.layout.y; }, []);
  const onFocus = useCallback(() => {
    const go = () => scroll.current?.scrollTo({ y: Math.max(0, y.current - CLEAR_TOP), animated: true });
    if (Keyboard.isVisible()) { setTimeout(go, 60); return; }
    const shown = Keyboard.addListener("keyboardDidShow", () => { shown.remove(); setTimeout(go, 60); });
    setTimeout(() => shown.remove(), 1500);      // no keyboard came (a hardware one): nothing to do
  }, []);
  return { scroll, onLayout, onFocus };
}

/** For a field at the very end of a page (a reply box): once the keyboard is up, scroll to the end. */
export function useScrollToEnd() {
  const scroll = useRef<ScrollView>(null);
  const onFocus = useCallback(() => {
    const go = () => scroll.current?.scrollToEnd({ animated: true });
    if (Keyboard.isVisible()) { setTimeout(go, 60); return; }
    const shown = Keyboard.addListener("keyboardDidShow", () => { shown.remove(); setTimeout(go, 60); });
    setTimeout(() => shown.remove(), 1500);
  }, []);
  return { scroll, onFocus };
}
