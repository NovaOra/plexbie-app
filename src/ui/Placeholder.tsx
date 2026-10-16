// What a list, card or poster looks like before it's loaded: its own shape in panel slate,
// with a band of light sweeping across it, as the website's. Under Reduce Motion it holds
// still. Hidden from screen readers: whatever holds it says "Loading" once, for all of them.
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import { color, radius } from "./theme";

export function Placeholder({ height, width, round = radius.m, style }: {
  height?: DimensionValue;
  width?: DimensionValue;
  /** Its corner radius: a card's 12 by default, a poster's 6. */
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const at = useSharedValue(0);
  const span = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    at.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(at);
  }, [reduced, at]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: (at.get() * 2 - 1) * span.get() }] }));
  return (
    <View testID="placeholder" style={[styles.box, { height, width, borderRadius: round }, style]}
      onLayout={(e) => span.set(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {reduced ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient colors={[color.panel, color.panelRaised, color.panel]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: color.panel, overflow: "hidden" },
});
