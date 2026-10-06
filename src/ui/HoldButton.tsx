// Press and hold to mean it: the bar fills while a finger stays down, saying something
// at each step (`stages`), and the action runs when it's full. Letting go early
// cancels, with a word about it (`bail`). The fill is a transform on the UI thread; the
// words change a handful of times a hold. A screen reader gets a confirm instead, since
// holding isn't something it can do.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as haptic from "./haptics";
import { Text } from "./Text";
import { color, font, radius, TOUCH } from "./theme";

export function HoldButton({ label, onConfirm, ms = 3200, stages = [], bail, disabled, confirmText }: {
  label: string;
  onConfirm: () => void;
  ms?: number;
  stages?: string[];
  bail?: string;
  disabled?: boolean;
  /** What the screen-reader confirm asks. */
  confirmText?: string;
}) {
  const fill = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const [stage, setStage] = useState(0);
  const [bailed, setBailed] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef(false);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const start = () => {
    if (disabled) return;
    clear();
    done.current = false;
    setBailed(false);
    setHolding(true);
    setStage(0);
    haptic.tap();
    fill.set(withTiming(1, { duration: ms, easing: Easing.linear }));
    stages.forEach((_, i) => {
      if (i) timers.current.push(setTimeout(() => { setStage(i); haptic.select(); }, (ms / stages.length) * i));
    });
    timers.current.push(setTimeout(() => {
      done.current = true;
      setHolding(false);
      onConfirm();
    }, ms));
  };
  const stop = () => {
    if (done.current || !holding) return;
    clear();
    setHolding(false);
    cancelAnimation(fill);
    fill.set(withTiming(0, { duration: 200 }));
    if (bail) {
      setBailed(true);
      timers.current.push(setTimeout(() => setBailed(false), 2200));
    }
  };
  // Once it's gone through, the bar empties for next time.
  useEffect(() => { if (!holding && done.current) fill.set(0); }, [holding, fill]);

  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  const words = holding && stages.length ? stages[stage] : bailed && bail ? bail : `Hold to ${label.toLowerCase()}`;

  const confirm = () => Alert.alert(label, confirmText ?? "Are you sure?", [
    { text: "Not yet", style: "cancel" },
    { text: label, onPress: onConfirm },
  ]);

  return (
    <Pressable
      onPressIn={() => {
        void AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (!on) start(); });
      }}
      onPressOut={stop}
      onPress={() => { void AccessibilityInfo.isScreenReaderEnabled().then((on) => { if (on) confirm(); }); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold until the bar is full. With a screen reader, double tap to confirm."
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.button, disabled && styles.off]}
    >
      <Animated.View style={[styles.fill, bar]} />
      <View style={styles.labelBox} pointerEvents="none">
        <Text style={[styles.label, holding && styles.labelOn]} numberOfLines={1}>{words}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH + 4, borderRadius: radius.pill, overflow: "hidden", backgroundColor: color.panel,
    borderWidth: 1.5, borderColor: color.tally, justifyContent: "center" },
  off: { opacity: 0.5 },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.tally, transformOrigin: "left" },
  labelBox: { paddingHorizontal: 18, alignItems: "center" },
  label: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  // Light on both halves (the filled pink and the dark), with a shadow so it reads on the pink.
  labelOn: { textShadowColor: "rgba(16, 23, 43, 0.65)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
