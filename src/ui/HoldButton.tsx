// Press and hold to mean it: the bar fills while a finger stays down, saying something
// at each step (`stages`), and the action runs when it's full. Letting go early
// cancels, with a word about it (`bail`). The fill is a transform on the UI thread; the
// words change a handful of times a hold. Anything that presses without holding (a
// screen reader, a switch, voice, a keyboard) gets a confirm instead.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as haptic from "./haptics";
import { Text } from "./Text";
import { color, font, radius, TOUCH } from "./theme";
import { useLargeText } from "./useColumns";

export function HoldButton({ label, onConfirm, ms = 3200, stages = [], bail, disabled, confirmText }: {
  label: string;
  onConfirm: () => void;
  ms?: number;
  stages?: string[];
  bail?: string;
  disabled?: boolean;
  /** What the confirm asks, for anything that presses without holding. */
  confirmText?: string;
}) {
  const fill = useSharedValue(0);
  const width = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const [stage, setStage] = useState(0);
  const [bailed, setBailed] = useState(false);
  const large = useLargeText();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef(false);
  // Refs, not state: a release, a screen reader or `disabled` can change between a press
  // and the next render, and the timer has to see it.
  const pressed = useRef(false);
  const held = useRef(false);
  const touched = useRef(false);
  const reader = useRef(false);
  const latest = useRef({ onConfirm, disabled });
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);
  useEffect(() => { latest.current = { onConfirm, disabled }; });

  // Known before anyone presses, so a press never waits on the answer.
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (live) reader.current = on; });
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (on: boolean) => { reader.current = on; });
    return () => { live = false; sub.remove(); };
  }, []);

  const empty = () => {
    clear();
    held.current = false;
    setHolding(false);
    cancelAnimation(fill);
    fill.set(withTiming(0, { duration: 200 }));
  };
  const start = () => {
    if (latest.current.disabled) return;
    clear();
    done.current = false;
    held.current = true;
    setBailed(false);
    setHolding(true);
    setStage(0);
    haptic.tap();
    // Progress, not decoration: with Reduce Motion it still fills over the whole hold.
    fill.set(withTiming(1, { duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    stages.forEach((_, i) => {
      if (i) timers.current.push(setTimeout(() => { setStage(i); haptic.select(); }, (ms / stages.length) * i));
    });
    timers.current.push(setTimeout(() => {
      if (!pressed.current || latest.current.disabled) return empty();
      done.current = true;
      held.current = false;
      setHolding(false);
      latest.current.onConfirm();
    }, ms));
  };
  const stop = () => {
    if (done.current || !held.current) return;
    empty();
    if (bail) {
      setBailed(true);
      timers.current.push(setTimeout(() => setBailed(false), 2200));
    }
  };
  // Turned off mid-hold (something else started), it lets go without a word.
  useEffect(() => { if (disabled && held.current) empty(); });
  // Once it's gone through, the bar empties for next time.
  useEffect(() => { if (!holding && done.current) fill.set(0); }, [holding, fill]);

  // The fill slides in from the left with a dark copy of the words riding on it, held in
  // place, so the words read on both halves.
  const bar = useAnimatedStyle(() => ({
    opacity: width.get() ? 1 : 0,
    transform: [{ translateX: (fill.get() - 1) * width.get() }],
  }));
  const still = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - fill.get()) * width.get() }] }));
  const words = holding && stages.length ? stages[stage] : bailed && bail ? bail : `Hold to ${label.toLowerCase()}`;

  const confirm = () => {
    if (latest.current.disabled) return;
    Alert.alert(label, confirmText ?? "Are you sure?", [
      { text: "Not yet", style: "cancel" },
      { text: label, onPress: () => { if (!latest.current.disabled) latest.current.onConfirm(); } },
    ]);
  };

  return (
    <Pressable
      onPressIn={() => {
        pressed.current = true;
        touched.current = true;
        if (!reader.current) start();
      }}
      onPressOut={() => {
        pressed.current = false;
        stop();
        // A press that slides off never gets its onPress: forget the touch after this turn.
        setTimeout(() => { touched.current = false; }, 0);
      }}
      // A finger's tap is the hold's (it confirms by holding); a click with no touch behind
      // it, from a keyboard or a switch, or any press with a screen reader on, asks instead.
      onPress={() => {
        const touch = touched.current;
        touched.current = false;
        if (!touch || reader.current) confirm();
      }}
      // A screen reader's double tap, Switch Access and Voice Access activate it through the
      // "activate" action on Android; VoiceOver, Switch Control, Voice Control and Full
      // Keyboard Access through onAccessibilityTap on iOS, where a declared action would
      // show up again as a custom action.
      accessibilityActions={Platform.OS === "android" ? [{ name: "activate", label }] : undefined}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === "activate") confirm(); }}
      onAccessibilityTap={confirm}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Hold to ${label.toLowerCase()}`}
      accessibilityHint="Press and hold until the bar is full. A double tap, a switch or a voice command asks to confirm instead."
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.button, disabled && styles.off]}
    >
      <View style={styles.labelBox} pointerEvents="none">
        <Text style={styles.label} numberOfLines={large ? undefined : 1}>{words}</Text>
      </View>
      <Animated.View style={[styles.fill, bar]} pointerEvents="none" onLayout={(e) => width.set(e.nativeEvent.layout.width)}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.fillWords, still]}>
          <View style={styles.labelBox}>
            <Text style={[styles.label, styles.labelOn]} numberOfLines={large ? undefined : 1}>{words}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH + 4, borderRadius: radius.pill, overflow: "hidden", backgroundColor: color.panel,
    borderWidth: 1.5, borderColor: color.tally, justifyContent: "center" },
  off: { opacity: 0.5 },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", backgroundColor: color.tally },
  fillWords: { flex: 1, justifyContent: "center" },
  labelBox: { paddingHorizontal: 18, paddingVertical: 8, alignItems: "center" },
  label: { fontFamily: font.bold, fontSize: 16, color: color.ink, textAlign: "center" },
  // Dark on the pink, as the website's --on-tally.
  labelOn: { color: color.onTally },
});
