// Plexbie's own "are you sure?" dialog, in place of the platform's stock alert: the
// app's panel, type and buttons. Same shape as Alert.alert (title, message, buttons
// with text, style and onPress), so a call reads the same. Back, or a tap outside,
// is the cancel button.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, Keyframe } from "react-native-reanimated";
import { Button } from "./Button";
import { Text } from "./Text";
import { color, EASE_OUT, radius, space } from "./theme";
import { GlassFill, glass } from "./Glass";

export interface ConfirmButton {
  text: string;
  style?: "cancel" | "destructive" | "default";
  onPress?: () => void | Promise<void>;
}
type Ask = (title: string, message: string, buttons: ConfirmButton[]) => void;
interface Shown { title: string; message: string; buttons: ConfirmButton[]; key: number }

const Ctx = createContext<Ask>(() => {});

/** confirm(title, message, buttons): like Alert.alert, drawn by Plexbie. */
export function useConfirm() {
  return useContext(Ctx);
}

// Rises a touch as it fades in (no scale from nothing); reduced motion keeps only the fade.
const rise = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.96 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
}).duration(200);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const ask = useCallback<Ask>((title, message, buttons) => setShown({ title, message, buttons, key: Date.now() }), []);
  const cancel = shown?.buttons.find((b) => b.style === "cancel");
  const choose = (b?: ConfirmButton) => {
    setShown(null);
    void b?.onPress?.();
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal visible={!!shown} transparent statusBarTranslucent navigationBarTranslucent animationType="none"
        onRequestClose={() => choose(cancel)}>
        {shown ? (
          <View style={styles.layer}>
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
              <Pressable style={styles.scrim} onPress={() => choose(cancel)} accessibilityLabel={cancel?.text ?? "Close"}
                accessibilityRole="button" importantForAccessibility="no-hide-descendants" />
            </Animated.View>
            <Animated.View key={shown.key} entering={rise} exiting={FadeOut.duration(120)} style={[styles.card, glass.surface]}
              accessibilityViewIsModal accessibilityLiveRegion="assertive">
              <GlassFill radius={radius.l} strong />
              <Text variant="title" accessibilityRole="header">{shown.title}</Text>
              {shown.message ? <Text variant="body" style={styles.message}>{shown.message}</Text> : null}
              <View style={styles.actions}>
                {shown.buttons.map((b) => (
                  <Button key={b.text} label={b.text} onPress={() => choose(b)} style={styles.grow}
                    kind={b.style === "cancel" ? "secondary" : b.style === "destructive" ? "danger" : "primary"} />
                ))}
              </View>
            </Animated.View>
          </View>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: "center", padding: space.xl },
  // Lighter on iOS: the glass dialog needs the page behind it to show through.
  scrim: { flex: 1, backgroundColor: Platform.OS === "ios" ? "rgba(6, 9, 20, 0.5)" : "rgba(6, 9, 20, 0.72)" },
  card: {
    gap: space.s, padding: space.xl, borderRadius: radius.l, backgroundColor: color.panel,
    borderWidth: 1, borderColor: color.rule, maxWidth: 480, width: "100%", alignSelf: "center",
  },
  message: { color: color.slateInk },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.m },
  grow: { flexGrow: 1, flexBasis: 120 },
});
