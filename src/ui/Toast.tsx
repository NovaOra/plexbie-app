// "Approved Dune" / "That didn't go through": one short message at a time, near the top
// (clear of the tab bar and the keyboard), gone after a few seconds or on a tap.
// Screen readers hear it as it appears.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { EASE_OUT, TOUCH, color, radius, space } from "./theme";
import { GlassFill, glass } from "./Glass";

export interface ToastIn {
  text: string;
  detail?: string;
  tone?: "ok" | "error";
  /** One follow-up, e.g. Undo for something reversible. The toast stays a little longer. */
  action?: { label: string; onPress: () => void };
}
type Shown = ToastIn & { key: number };

const Ctx = createContext<(t: ToastIn) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();

  const show = useCallback((t: ToastIn) => {
    clearTimeout(timer.current);
    setToast({ ...t, key: Date.now() });
    AccessibilityInfo.announceForAccessibility(
      [t.text, t.detail, t.action ? `${t.action.label} is available` : null].filter(Boolean).join(". "));
    // With a screen reader on, a toast stays until it's dismissed: there's no racing a
    // timer to reach Undo. Otherwise a few seconds, longer when there's something to do.
    void AccessibilityInfo.isScreenReaderEnabled().then((reader) => {
      if (!reader) timer.current = setTimeout(() => setToast(null), t.tone === "error" || t.action ? 6000 : 4000);
    });
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const act = () => { const a = toast?.action; setToast(null); a?.onPress(); };

  return (
    <Ctx.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + space.s }]}>
        {toast ? (
          <Animated.View key={toast.key} entering={FadeInUp.duration(220).easing(EASE_OUT)} exiting={FadeOutUp.duration(160)}>
            <View style={[styles.toast, glass.surface, toast.tone === "error" && styles.error]} accessibilityLiveRegion="polite">
              <GlassFill radius={radius.m} strong />
              {/* The message and its action are siblings, so a screen reader reaches both. */}
              <Pressable
                onPress={() => setToast(null)}
                accessibilityRole="alert"
                accessibilityHint="Dismisses this message"
                accessibilityActions={[{ name: "dismiss", label: "Dismiss" }, ...(toast.action ? [{ name: "act", label: toast.action.label }] : [])]}
                onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === "act") act(); else setToast(null); }}
                style={styles.message}
              >
                <View style={[styles.dot, toast.tone === "error" && styles.dotError]} />
                <View style={styles.words}>
                  <Text variant="label">{toast.text}</Text>
                  {toast.detail ? <Text variant="meta">{toast.detail}</Text> : null}
                </View>
              </Pressable>
              {toast.action ? (
                <Pressable onPress={act} accessibilityRole="button" accessibilityLabel={toast.action.label} style={styles.action}>
                  <Text variant="label" style={styles.actionText}>{toast.action.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: space.l, right: space.l, zIndex: 10 },
  message: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: space.m },
  toast: {
    flexDirection: "row", alignItems: "center", gap: space.m, padding: space.l, borderRadius: radius.m,
    backgroundColor: color.panelRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: color.rule,
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  error: { borderColor: color.tally },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: color.screen },
  dotError: { backgroundColor: color.tally },
  words: { flex: 1, gap: 2 },
  action: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: "center", paddingHorizontal: space.s },
  actionText: { color: color.screen },
});
