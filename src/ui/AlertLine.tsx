// A warning, the way the rest of the app draws its marks: a small alert triangle in the
// tally's pink, 2px strokes with rounded ends, drawn from Views as the Plex key's play
// mark is (the app has no SVG), beside its words in the same pink. Not the "⚠" glyph,
// which each phone draws in its own font and weight.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import { Text } from "./Text";
import { color, space } from "./theme";

const STROKE = 2;

/** One straight stroke from (x1, y1) to (x2, y2), rounded at both ends. */
function Stroke({ x1, y1, x2, y2, tint }: { x1: number; y1: number; x2: number; y2: number; tint: string }) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <View style={[styles.stroke, {
      width: length, left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - STROKE / 2, backgroundColor: tint, transform: [{ rotate: `${angle}deg` }],
    }]} />
  );
}

/** The alert triangle with its "!", `size` dp square (16-20), tally pink unless told otherwise. */
export function AlertIcon({ size = 18, tint = color.tally }: { size?: number; tint?: string }) {
  const u = size / 20;
  const top = { x: 10 * u, y: 2.5 * u };
  const left = { x: 1.5 * u, y: 17.5 * u };
  const right = { x: 18.5 * u, y: 17.5 * u };
  return (
    <View testID="alert-icon" style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Stroke x1={top.x} y1={top.y} x2={left.x} y2={left.y} tint={tint} />
      <Stroke x1={top.x} y1={top.y} x2={right.x} y2={right.y} tint={tint} />
      <Stroke x1={left.x} y1={left.y} x2={right.x} y2={right.y} tint={tint} />
      <View style={[styles.mark, { left: 10 * u - STROKE / 2, top: 7.5 * u, height: 4.5 * u, backgroundColor: tint }]} />
      <View style={[styles.mark, { left: 10 * u - STROKE / 2, top: 13.5 * u, height: STROKE, backgroundColor: tint }]} />
    </View>
  );
}

/** A warning line: the triangle, then its words, wrapping beside it rather than under it. */
export function AlertLine({ children, variant = "label", style }: { children: ReactNode; variant?: "label" | "meta"; style?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.line}>
      <View style={styles.iconBox}><AlertIcon /></View>
      <Text variant={variant} style={[styles.text, style]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stroke: { position: "absolute", height: STROKE, borderRadius: STROKE / 2 },
  mark: { position: "absolute", width: STROKE, borderRadius: STROKE / 2 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: space.s },
  // Centred on the first line of words (20dp tall for both label and meta).
  iconBox: { paddingTop: 1 },
  text: { flex: 1, color: color.tally },
});
